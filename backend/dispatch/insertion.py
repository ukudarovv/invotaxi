"""
Модуль Best Insertion - поиск оптимальной позиции вставки заказа в маршрут
"""
from typing import List, Optional, Dict, Tuple
from datetime import datetime
import pandas as pd
import logging

from accounts.models import Driver
from orders.models import Order
from dispatch.simulator import simulate_route, create_travel_minutes_function
from dispatch.utils import (
    is_city_driver,
    is_remote_driver,
    is_order_in_driver_region,
    is_order_in_remote_region
)
from dispatch.config import DispatchParams

logger = logging.getLogger(__name__)


def best_insertion(
    driver: Driver,
    current_route: List[Order],
    new_order: Order,
    start_time: datetime,
    params: Optional[DispatchParams] = None,
    regions_df: Optional[pd.DataFrame] = None
) -> Tuple[Optional[int], Optional[pd.DataFrame], float, Dict]:
    """
    Находит лучшую позицию для вставки нового заказа в существующий маршрут водителя.
    
    Args:
        driver: Объект Driver
        current_route: Текущий маршрут водителя (список Order объектов)
        new_order: Новый заказ для вставки (Order объект)
        start_time: Время начала работы водителя
        params: Параметры алгоритма
        regions_df: DataFrame с регионами (опционально)
    
    Returns:
        best_position: Лучшая позиция вставки (int или None)
        best_schedule_df: Расписание для лучшей вставки (DataFrame или None)
        best_cost: Стоимость лучшей вставки (float или float('inf'))
        debug_info: Информация для отладки (словарь)
    """
    if params is None:
        params = DispatchParams.get_default()
    
    # Проверка базовых условий
    if driver.capacity < new_order.seats_needed:
        logger.debug(f'Водитель {driver.id} не подходит: недостаточная вместимость')
        return None, None, float('inf'), {'reason': 'insufficient_capacity'}
    
    max_orders = params.max_orders_per_driver
    if len(current_route) >= max_orders:
        logger.debug(f'Водитель {driver.id} не подходит: достигнут лимит заказов')
        return None, None, float('inf'), {'reason': 'max_orders_reached'}
    
    if driver.current_lat is None or driver.current_lng is None:
        logger.debug(f'Водитель {driver.id} не подходит: нет координат')
        return None, None, float('inf'), {'reason': 'no_coordinates'}
    
    # Создаем функцию расчета времени переезда
    travel_minutes_fn = create_travel_minutes_function(params=params)
    
    # Определяем начальные координаты водителя
    driver_start_lat = driver.current_lat
    driver_start_lng = driver.current_lng
    
    # Инициализация
    best_position = None
    best_schedule_df = None
    best_cost = float('inf')
    debug_info = {
        'positions_tried': 0,
        'valid_positions': 0,
        'invalid_positions': 0,
        'reasons': []
    }
    
    # Перебор позиций вставки
    num_positions = len(current_route) + 1
    
    for pos in range(num_positions):
        debug_info['positions_tried'] += 1
        
        # Создание новой последовательности
        new_sequence = current_route[:pos] + [new_order] + current_route[pos:]
        
        # Проверка региональных ограничений
        regional_check_result = _check_regional_constraints(
            driver, new_order, current_route, pos, params
        )
        
        if not regional_check_result['allowed']:
            debug_info['invalid_positions'] += 1
            debug_info['reasons'].append({
                'position': pos,
                'reason': regional_check_result['reason']
            })
            logger.debug(f'Позиция {pos} не подходит: {regional_check_result["reason"]}')
            continue
        
        # Симуляция маршрута
        try:
            schedule_df, is_valid, violations, total_time_min = simulate_route(
                driver_start_lat=driver_start_lat,
                driver_start_lng=driver_start_lng,
                driver_start_time=start_time,
                orders_sequence=new_sequence,
                travel_minutes_fn=travel_minutes_fn,
                wait_limit_min=params.wait_limit_min,
                wait_period_min=params.wait_period_min,
                use_ml=params.use_ml_eta,
                ml_predictor=None,  # TODO: добавить ML предсказатель
                params=params
            )
        except Exception as e:
            logger.error(f'Ошибка симуляции маршрута для позиции {pos}: {e}')
            debug_info['invalid_positions'] += 1
            continue
        
        if not is_valid:
            debug_info['invalid_positions'] += 1
            debug_info['reasons'].append({
                'position': pos,
                'reason': f'invalid_route_violations: {violations}'
            })
            logger.debug(f'Позиция {pos} не валидна: нарушения дедлайнов')
            continue
        
        # Расчет стоимости вставки
        # 1. Увеличение времени маршрута
        original_total_time_min = 0.0
        if len(current_route) > 0:
            _, _, _, original_total_time_min = simulate_route(
                driver_start_lat=driver_start_lat,
                driver_start_lng=driver_start_lng,
                driver_start_time=start_time,
                orders_sequence=current_route,
                travel_minutes_fn=travel_minutes_fn,
                wait_limit_min=params.wait_limit_min,
                wait_period_min=params.wait_period_min,
                params=params
            )
        
        delta_total_time_min = total_time_min - original_total_time_min
        
        # 2. Штраф за регион
        region_penalty = _calculate_region_penalty(
            driver, new_order, current_route, pos, params
        )
        
        # 3. Штраф за риск опоздания
        risk_penalty = _calculate_risk_penalty(
            schedule_df, new_order, params
        )
        
        # 4. Штраф за перегруз
        imbalance_penalty = params.imbalance_weight * len(current_route)
        
        # 5. Штраф за первый/последний заказ вне региона
        first_last_penalty = _calculate_first_last_penalty(
            driver, new_order, current_route, pos, params
        )
        
        # Общая стоимость
        cost = (
            delta_total_time_min +
            region_penalty +
            risk_penalty +
            imbalance_penalty +
            first_last_penalty
        )
        
        debug_info['valid_positions'] += 1
        
        # Обновление лучшей позиции
        if cost < best_cost:
            best_position = pos
            best_schedule_df = schedule_df
            best_cost = cost
            logger.debug(f'Найдена лучшая позиция {pos} со стоимостью {cost:.2f}')
    
    if best_position is None:
        logger.debug(f'Не найдено валидных позиций для водителя {driver.id}')
        return None, None, float('inf'), debug_info
    
    return best_position, best_schedule_df, best_cost, debug_info


def _check_regional_constraints(
    driver: Driver,
    new_order: Order,
    current_route: List[Order],
    position: int,
    params: DispatchParams
) -> Dict[str, any]:
    """
    Проверяет региональные ограничения для позиции вставки
    
    Returns:
        Словарь с ключами 'allowed' (bool) и 'reason' (str)
    """
    driver_region = driver.region
    order_region = new_order.pickup_region
    
    if not driver_region or not order_region:
        return {'allowed': True, 'reason': 'no_region_info'}
    
    is_city = is_city_driver(driver)
    is_remote = is_remote_driver(driver)
    is_order_remote = is_order_in_remote_region(new_order)
    
    # Городские водители не могут брать заказы из отдаленных регионов
    if is_city and is_order_remote and not params.allow_city_drivers_to_remote_regions:
        return {
            'allowed': False,
            'reason': 'city_driver_cannot_take_remote_order'
        }
    
    # Отдаленные водители: первый заказ должен быть из их региона
    if is_remote and len(current_route) == 0 and position == 0:
        if driver_region.id != order_region.id:
            if not params.allow_remote_driver_first_order_outside_region:
                return {
                    'allowed': False,
                    'reason': 'remote_driver_first_order_must_be_in_region'
                }
    
    # Отдаленные водители: последний заказ должен возвращать в регион
    if is_remote and len(current_route) > 0 and position == len(current_route):
        # Проверяем, что drop точка нового заказа в регионе водителя
        drop_region = None
        if hasattr(new_order, 'dropoff_region'):
            drop_region = new_order.dropoff_region
        else:
            # Используем регион по координатам dropoff
            from regions.services import get_region_by_coordinates
            if new_order.dropoff_lat and new_order.dropoff_lon:
                drop_region = get_region_by_coordinates(
                    new_order.dropoff_lat, new_order.dropoff_lon
                )
        
        if drop_region and drop_region.id != driver_region.id:
            # Проверяем, есть ли еще заказы после этого
            # Если это последний заказ, то drop должен быть в регионе водителя
            return {
                'allowed': False,
                'reason': 'remote_driver_last_order_must_return_to_region'
            }
    
    return {'allowed': True, 'reason': 'ok'}


def _calculate_region_penalty(
    driver: Driver,
    new_order: Order,
    current_route: List[Order],
    position: int,
    params: DispatchParams
) -> float:
    """Рассчитывает штраф за несовпадение региона"""
    driver_region = driver.region
    order_region = new_order.pickup_region
    
    if not driver_region or not order_region:
        return 0.0
    
    if driver_region.id == order_region.id:
        return 0.0
    
    # Базовый штраф
    penalty = params.region_penalty
    
    # Если водитель уже имеет заказы
    if len(current_route) > 0:
        # Если новый заказ из другого региона
        penalty *= 2.5
        
        # Если водитель работает в своем регионе
        driver_orders_in_region = sum(
            1 for order in current_route
            if order.pickup_region and order.pickup_region.id == driver_region.id
        )
        if driver_orders_in_region > 0:
            penalty += params.region_penalty * 1.5
    
    # Множитель для водителей без заказов
    if len(current_route) == 0:
        penalty *= params.zero_load_driver_region_penalty_multiplier
    
    return penalty


def _calculate_risk_penalty(
    schedule_df: pd.DataFrame,
    new_order: Order,
    params: DispatchParams
) -> float:
    """Рассчитывает штраф за риск опоздания"""
    if schedule_df.empty:
        return 0.0
    
    # Находим строку для нового заказа
    order_rows = schedule_df[schedule_df['order_id'] == str(new_order.id)]
    if order_rows.empty:
        return 0.0
    
    order_row = order_rows.iloc[0]
    start_time = order_row['start_time']
    deadline_time = order_row['deadline_time']
    
    # Расчет slack
    slack_min = (deadline_time - start_time).total_seconds() / 60.0
    
    if slack_min < params.risk_slack_min:
        return params.risk_penalty
    
    return 0.0


def _calculate_first_last_penalty(
    driver: Driver,
    new_order: Order,
    current_route: List[Order],
    position: int,
    params: DispatchParams
) -> float:
    """
    Рассчитывает штраф за первый/последний заказ вне региона.
    Для всех водителей: первый заказ желательно из региона, последний — возврат в регион.
    """
    driver_region = driver.region
    order_region = new_order.pickup_region
    
    if not driver_region or not order_region:
        return 0.0
    
    penalty = 0.0
    is_remote = is_remote_driver(driver)
    fl_penalty = params.first_last_order_region_penalty
    fl_bonus = getattr(params, 'first_last_order_region_bonus', 0.0)
    remote_first = params.remote_driver_first_order_penalty
    remote_last = params.remote_driver_last_order_penalty
    
    # Первый заказ: штраф вне региона, бонус в регионе
    if position == 0 and len(current_route) == 0:
        if driver_region.id != order_region.id:
            penalty += remote_first if is_remote else fl_penalty
        elif fl_bonus < 0:
            penalty += fl_bonus  # бонус для первого заказа в регионе
    
    # Последний заказ: штраф если drop вне региона, бонус если в регионе
    if position == len(current_route) and len(current_route) > 0:
        drop_region = None
        if hasattr(new_order, 'dropoff_region'):
            drop_region = new_order.dropoff_region
        else:
            from regions.services import get_region_by_coordinates
            if new_order.dropoff_lat and new_order.dropoff_lon:
                drop_region = get_region_by_coordinates(
                    new_order.dropoff_lat, new_order.dropoff_lon
                )
        
        if drop_region and drop_region.id != driver_region.id:
            penalty += remote_last if is_remote else fl_penalty
        elif drop_region and drop_region.id == driver_region.id and fl_bonus < 0:
            penalty += fl_bonus  # бонус за последний заказ с возвратом в регион
    
    return penalty
