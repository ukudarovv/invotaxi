"""
Модуль симуляции маршрута с проверкой временных ограничений
"""
from typing import List, Optional, Callable, Dict, Tuple
from datetime import datetime, timedelta
import pandas as pd
import logging

from orders.models import Order

logger = logging.getLogger(__name__)


def simulate_route(
    driver_start_lat: float,
    driver_start_lng: float,
    driver_start_time: datetime,
    orders_sequence: List[Order],
    travel_minutes_fn: Optional[Callable] = None,
    wait_limit_min: float = 20.0,
    wait_period_min: float = 20.0,
    dropoff_buffer_min: float = 7.0,
    use_ml: bool = False,
    ml_predictor: Optional[object] = None,
    params: Optional[object] = None
) -> Tuple[pd.DataFrame, bool, List[str], float]:
    """
    Симулирует выполнение маршрута водителя с последовательностью заказов
    и проверяет соблюдение временных ограничений.
    
    Args:
        driver_start_lat: Начальная широта водителя
        driver_start_lng: Начальная долгота водителя
        driver_start_time: Время начала работы водителя
        orders_sequence: Последовательность заказов (список Order объектов)
        travel_minutes_fn: Функция расчета времени переезда (lat1, lon1, lat2, lon2, order, current_time) -> minutes
        wait_limit_min: Лимит ожидания (минуты)
        wait_period_min: Фиксированный период ожидания после scheduled_time (минуты)
        use_ml: Использовать ML предсказания
        ml_predictor: ML предсказатель (опционально)
        params: Параметры алгоритма (опционально)
    
    Returns:
        schedule_df: DataFrame с расписанием для каждого заказа
        is_valid: Валидность маршрута (нет нарушений дедлайнов)
        violations: Список ID заказов с нарушениями дедлайнов
        total_time_min: Общее время выполнения маршрута (минуты)
    """
    if travel_minutes_fn is None:
        # Используем DispatchEngine по умолчанию (lazy import для избежания циклического импорта)
        from dispatch.services import DispatchEngine
        dispatch_engine = DispatchEngine()
        
        def default_travel_fn(lat1: float, lon1: float, lat2: float, lon2: float,
                              order_for_ml: Optional[Order] = None, current_time: Optional[datetime] = None) -> float:
            route = dispatch_engine.calculate_route(lat1, lon1, lat2, lon2)
            if route:
                return route['duration_minutes']
            return 0.0
        
        travel_minutes_fn = default_travel_fn
    
    # Инициализация
    current_lat = driver_start_lat
    current_lng = driver_start_lng
    current_time = driver_start_time
    violations = []
    schedule_rows = []
    
    # Обработка каждого заказа
    for order in orders_sequence:
        order_id = str(order.id)
        
        # Расчет времени до точки забора
        t_drive_to_pickup_min = travel_minutes_fn(
            current_lat, current_lng,
            order.pickup_lat, order.pickup_lon,
            order_for_ml=order,
            current_time=current_time
        )
        
        # Время прибытия
        arrive_time = current_time + timedelta(minutes=t_drive_to_pickup_min)
        
        # Получаем scheduled_time (желаемое время подачи)
        scheduled_time = order.desired_pickup_time
        
        # Расчет времени ожидания
        if arrive_time < scheduled_time:
            early_arrival_min = (scheduled_time - arrive_time).total_seconds() / 60.0
            if use_ml and ml_predictor:
                wait_time_min = ml_predictor.predict_wait_time(order, early_arrival_min)
            else:
                wait_time_min = early_arrival_min
        else:
            wait_time_min = 0.0
        
        # Время начала поездки
        start_time = max(
            arrive_time + timedelta(minutes=wait_time_min),
            scheduled_time
        )
        
        # Дедлайн
        deadline_time = scheduled_time + timedelta(minutes=wait_limit_min)
        
        # Проверка опоздания
        is_late = start_time > deadline_time
        if is_late:
            violations.append(order_id)
            logger.warning(f'Заказ {order_id} нарушает дедлайн: start_time={start_time}, deadline_time={deadline_time}')
        
        # Расчет времени поездки (pickup → drop)
        t_trip_min = travel_minutes_fn(
            order.pickup_lat, order.pickup_lon,
            order.dropoff_lat, order.dropoff_lon,
            order_for_ml=order,
            current_time=start_time
        )
        
        # Время высадки пассажира (5-10 мин)
        buf_min = getattr(params, 'dropoff_buffer_min', dropoff_buffer_min) if params else dropoff_buffer_min
        
        # Время завершения (поездка + высадка)
        end_time = start_time + timedelta(minutes=t_trip_min + buf_min)
        
        # Сохранение данных в строку расписания
        schedule_rows.append({
            'order_id': order_id,
            'arrive_time': arrive_time,
            'wait_time_min': wait_time_min,
            'start_time': start_time,
            'deadline_time': deadline_time,
            'end_time': end_time,
            'is_late': is_late,
            't_drive_to_pickup_min': t_drive_to_pickup_min,
            't_trip_min': t_trip_min
        })
        
        # Обновление позиции
        current_lat = order.dropoff_lat
        current_lng = order.dropoff_lon
        current_time = end_time
    
    # Создание DataFrame
    schedule_df = pd.DataFrame(schedule_rows)
    
    # Проверка валидности
    is_valid = len(violations) == 0
    
    # Расчет общего времени выполнения маршрута
    if len(schedule_rows) > 0:
        first_order_start = schedule_rows[0]['arrive_time']
        last_order_end = schedule_rows[-1]['end_time']
        total_time_min = (last_order_end - first_order_start).total_seconds() / 60.0
    else:
        total_time_min = 0.0
    
    return schedule_df, is_valid, violations, total_time_min


def create_travel_minutes_function(
    dispatch_engine: Optional[object] = None,
    params: Optional[object] = None
) -> Callable:
    """
    Создает функцию расчета времени переезда
    
    Args:
        dispatch_engine: Экземпляр DispatchEngine
        params: Параметры алгоритма
    
    Returns:
        Функция (lat1, lon1, lat2, lon2, order_for_ml, current_time) -> minutes
    """
    if dispatch_engine is None:
        from dispatch.services import DispatchEngine
        dispatch_engine = DispatchEngine()
    
    def travel_minutes_fn(
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
        order_for_ml: Optional[Order] = None,
        current_time: Optional[datetime] = None
    ) -> float:
        """
        Рассчитывает время переезда между двумя точками в минутах
        
        Args:
            lat1, lon1: Координаты начальной точки
            lat2, lon2: Координаты конечной точки
            order_for_ml: Заказ для ML предсказания (опционально)
            current_time: Текущее время (опционально)
        
        Returns:
            Время переезда в минутах
        """
        route = dispatch_engine.calculate_route(lat1, lon1, lat2, lon2)
        if route:
            minutes = route['duration_minutes']
            
            # Применение буферов для учета пробок
            if params and hasattr(params, 'traffic_enabled') and params.traffic_enabled:
                if hasattr(params, 'percentage_buffer'):
                    minutes *= (1.0 + params.percentage_buffer)
                if hasattr(params, 'fixed_buffer_min'):
                    minutes += params.fixed_buffer_min
            
            return minutes
        
        # Fallback: расчет по прямой линии
        from geo.services import Geo
        distance_m = Geo.calculate_distance(lat1, lon1, lat2, lon2)
        distance_km = distance_m / 1000.0
        
        # Используем скорость из параметров или по умолчанию
        speed_kmh = 50.0
        if params and hasattr(params, 'speed_kmh'):
            speed_kmh = params.speed_kmh
        
        # Применяем road_factor
        road_factor = 1.25
        if params and hasattr(params, 'road_factor'):
            road_factor = params.road_factor
        
        distance_km_adjusted = distance_km * road_factor
        minutes = (distance_km_adjusted / speed_kmh) * 60.0
        
        return minutes
    
    return travel_minutes_fn
