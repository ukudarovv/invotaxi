from typing import List, Optional, Tuple, Dict
from django.utils import timezone
from datetime import date, timedelta
from orders.models import Order, OrderStatus
from accounts.models import Driver
from geo.services import Geo
import logging
import requests
import json

logger = logging.getLogger(__name__)


class AssignmentResult:
    """Результат назначения заказа"""
    def __init__(self, driver_id: Optional[str] = None, reason: str = '', rejection_reason: Optional[str] = None):
        self.driver_id = driver_id
        self.reason = reason
        self.rejection_reason = rejection_reason


class DispatchEngine:
    """Движок диспетчеризации заказов"""
    
    # Счетчик заказов водителей за сегодня (в памяти, для production нужен Redis)
    _driver_order_counts = {}
    _last_reset_date = date.today()

    def _reset_daily_counts_if_needed(self):
        """Сбрасывает счетчики, если наступил новый день"""
        today = date.today()
        if today > self._last_reset_date:
            self._driver_order_counts.clear()
            self._last_reset_date = today

    def assign_order(self, order: Order) -> AssignmentResult:
        """
        Назначает заказ водителю
        """
        if order.status != OrderStatus.ACTIVE_QUEUE:
            return AssignmentResult(
                reason='Заказ не в статусе active_queue',
                rejection_reason='Неверный статус заказа'
            )

        self._reset_daily_counts_if_needed()

        candidates = self._find_candidates(order)

        if not candidates:
            return AssignmentResult(
                reason='Нет подходящих водителей',
                rejection_reason='Нет онлайн водителей с достаточной вместимостью'
            )

        # Получаем регион пассажира
        passenger = order.passenger
        if not passenger:
            return AssignmentResult(
                reason='Пассажир не найден',
                rejection_reason=f'Пассажир с ID {order.passenger_id} не найден в базе'
            )

        # Сортируем по приоритету
        candidates.sort(key=lambda d: self._calculate_priority(d, order, passenger))

        selected_driver = candidates[0]

        # Обновляем счетчик
        driver_id_str = str(selected_driver.id)
        self._driver_order_counts[driver_id_str] = self._driver_order_counts.get(driver_id_str, 0) + 1

        return AssignmentResult(
            driver_id=str(selected_driver.id),
            reason=f'Назначен водитель {selected_driver.name} из региона {selected_driver.region.title}'
        )

    def _find_candidates(self, order: Order) -> List[Driver]:
        """
        Находит кандидатов для заказа
        """
        seats_needed = order.seats_needed

        # Получаем всех онлайн водителей с правильным статусом
        # Используем старые проверки для совместимости, но также проверяем новые статусы если они есть
        from accounts.models import DriverStatus
        
        # Фильтруем водителей: онлайн и доступные (не в поездке, не едут к подаче, не получили оффер)
        online_drivers = Driver.objects.filter(is_online=True)
        
        # Исключаем занятых водителей
        excluded_statuses = [DriverStatus.ON_TRIP, DriverStatus.ENROUTE_TO_PICKUP, DriverStatus.OFFERED]
        # Используем exclude только если поле status существует
        try:
            online_drivers = online_drivers.exclude(status__in=excluded_statuses)
        except Exception:
            # Если поле status не существует (старая схема БД), просто используем is_online
            pass

        candidates = []
        for driver in online_drivers:
            # Проверяем вместимость
            if driver.capacity < seats_needed:
                continue
            
            # Дополнительная проверка статуса (для совместимости со старыми данными)
            # Если статус не установлен или OFFLINE, но is_online=True, пропускаем
            if hasattr(driver, 'status'):
                if driver.status == DriverStatus.OFFLINE:
                    continue
                # Если водитель в статусе OFFERED, можно попробовать, но лучше пропустить для надежности
                # if driver.status == DriverStatus.OFFERED:
                #     continue

            candidates.append(driver)

        return candidates

    def _calculate_priority(self, driver: Driver, order: Order, passenger) -> tuple:
        """
        Вычисляет приоритет водителя для заказа
        Возвращает кортеж для сортировки (меньше = выше приоритет)
        """
        # 1. Приоритет региона - водители из того же региона имеют приоритет
        region_match = 0 if driver.region.id == passenger.region.id else 1

        # 2. Fairness penalty (кто меньше заказов взял сегодня)
        driver_id_str = str(driver.id)
        order_count = self._driver_order_counts.get(driver_id_str, 0)

        # 3. Расстояние до точки забора
        if driver.current_lat is not None and driver.current_lon is not None:
            distance = Geo.calculate_distance(
                driver.current_lat, driver.current_lon,
                order.pickup_lat, order.pickup_lon
            )
        else:
            distance = float('inf')

        # Возвращаем кортеж для сортировки
        return (region_match, order_count, distance)

    def get_candidates(self, order: Order, include_offline: bool = True) -> List[dict]:
        """
        Возвращает список кандидатов с приоритетами
        include_offline: если True, включает офлайн водителей для ручного назначения
        """
        seats_needed = order.seats_needed
        passenger = order.passenger

        # Получаем водителей (онлайн и офлайн, если разрешено)
        if include_offline:
            drivers = Driver.objects.filter(capacity__gte=seats_needed)
        else:
            drivers = Driver.objects.filter(is_online=True, capacity__gte=seats_needed)

        result = []
        for driver in drivers:
            priority = self._calculate_priority(driver, order, passenger)
            result.append({
                'driver_id': str(driver.id),
                'name': driver.name,
                'region_id': driver.region.id,
                'car_model': driver.car_model,
                'capacity': driver.capacity,
                'is_online': driver.is_online,
                'priority': {
                    'region_match': priority[0] == 0,
                    'order_count': priority[1],
                    'distance': priority[2] if priority[2] != float('inf') else None
                }
            })

        # Сортируем по приоритету: сначала онлайн, потом по региону, количеству заказов и расстоянию
        result.sort(key=lambda x: (
            not x['is_online'],  # Онлайн водители в начале
            not x['priority']['region_match'],
            x['priority']['order_count'],
            x['priority']['distance'] or float('inf')
        ))

        return result

    def reset_daily_counts(self):
        """Сбрасывает счетчики заказов (для тестирования или cron)"""
        self._driver_order_counts.clear()
        self._last_reset_date = date.today()

    def calculate_route(self, lat1: float, lon1: float, lat2: float, lon2: float) -> Dict:
        """
        Вычисляет маршрут между двумя точками по дорогам используя OSRM API
        Возвращает словарь с координатами маршрута, расстоянием и временем в пути
        """
        # Список OSRM серверов для попытки подключения
        osrm_servers = [
            "http://router.project-osrm.org",  # Публичный OSRM сервер
            "https://router.project-osrm.org",  # HTTPS версия
        ]
        
        for server_url in osrm_servers:
            try:
                # Формат: lon,lat (OSRM использует обратный порядок координат)
                url = f"{server_url}/route/v1/driving/{lon1},{lat1};{lon2},{lat2}"
                params = {
                    'overview': 'full',  # Полный обзор маршрута со всеми точками
                    'geometries': 'geojson',  # Формат GeoJSON для координат
                    'steps': 'false'  # Не нужны пошаговые инструкции
                }
                
                response = requests.get(url, params=params, timeout=5)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if data.get('code') == 'Ok' and len(data.get('routes', [])) > 0:
                        route = data['routes'][0]
                        geometry = route.get('geometry', {})
                        coordinates = geometry.get('coordinates', [])
                        
                        if not coordinates or len(coordinates) == 0:
                            continue  # Пробуем следующий сервер
                        
                        # Преобразуем координаты из [lon, lat] в [lat, lon]
                        route_points = [[coord[1], coord[0]] for coord in coordinates]
                        
                        # Расстояние в метрах
                        distance_m = int(route.get('distance', 0))
                        # Время в секундах
                        duration_seconds = int(route.get('duration', 0))
                        
                        logger.info(f"Маршрут успешно рассчитан через OSRM: {distance_m}м, {duration_seconds}с")
                        
                        return {
                            'route': route_points,
                            'distance_m': distance_m,
                            'distance_km': round(distance_m / 1000.0, 2),
                            'duration_seconds': duration_seconds,
                            'duration_minutes': int(duration_seconds / 60),
                            'eta': timezone.now() + timedelta(seconds=duration_seconds)
                        }
                    elif data.get('code') == 'NoRoute':
                        logger.warning(f"OSRM не нашел маршрут между точками {lat1},{lon1} -> {lat2},{lon2}")
                        break  # Не пробуем другие серверы, если маршрут не найден
                        
            except requests.exceptions.Timeout:
                logger.warning(f"Таймаут при подключении к OSRM серверу {server_url}")
                continue  # Пробуем следующий сервер
            except requests.exceptions.RequestException as e:
                logger.warning(f"Ошибка подключения к OSRM серверу {server_url}: {e}")
                continue  # Пробуем следующий сервер
            except Exception as e:
                logger.error(f"Неожиданная ошибка при расчете маршрута через OSRM ({server_url}): {e}")
                continue  # Пробуем следующий сервер
        
        # Если все серверы недоступны, используем fallback на прямую линию
        logger.warning(f"Все OSRM серверы недоступны, используем прямую линию для маршрута {lat1},{lon1} -> {lat2},{lon2}")
        return self._calculate_straight_line_route(lat1, lon1, lat2, lon2)
    
    def _calculate_straight_line_route(self, lat1: float, lon1: float, lat2: float, lon2: float) -> Dict:
        """
        Вычисляет прямую линию между двумя точками (fallback метод)
        """
        distance_m = Geo.calculate_distance(lat1, lon1, lat2, lon2)
        
        # Приблизительная скорость движения в городе (км/ч)
        AVERAGE_SPEED_KMH = 40.0
        AVERAGE_SPEED_MS = AVERAGE_SPEED_KMH / 3.6  # м/с
        
        # Время в пути в секундах
        duration_seconds = distance_m / AVERAGE_SPEED_MS if AVERAGE_SPEED_MS > 0 else 0
        
        # Генерируем промежуточные точки для визуализации маршрута
        num_points = max(10, int(distance_m / 100))  # Одна точка каждые 100 метров, минимум 10
        route_points = []
        
        for i in range(num_points + 1):
            ratio = i / num_points if num_points > 0 else 0
            lat = lat1 + (lat2 - lat1) * ratio
            lon = lon1 + (lon2 - lon1) * ratio
            route_points.append([lat, lon])
        
        return {
            'route': route_points,
            'distance_m': int(distance_m),
            'distance_km': round(distance_m / 1000.0, 2),
            'duration_seconds': int(duration_seconds),
            'duration_minutes': int(duration_seconds / 60),
            'eta': timezone.now() + timedelta(seconds=int(duration_seconds))
        }

    def calculate_driver_route(self, driver: Driver, order: Order) -> Optional[Dict]:
        """
        Вычисляет маршрут от водителя до точки забора заказа
        """
        if not driver.current_lat or not driver.current_lon:
            return None
        
        if not order.pickup_lat or not order.pickup_lon:
            return None
        
        return self.calculate_route(
            driver.current_lat, driver.current_lon,
            order.pickup_lat, order.pickup_lon
        )

    def calculate_order_route(self, order: Order) -> Optional[Dict]:
        """
        Вычисляет маршрут от точки забора до точки высадки заказа
        """
        if not order.pickup_lat or not order.pickup_lon:
            return None
        
        if not order.dropoff_lat or not order.dropoff_lon:
            return None
        
        return self.calculate_route(
            order.pickup_lat, order.pickup_lon,
            order.dropoff_lat, order.dropoff_lon
        )

    def calculate_eta(self, driver: Driver, order: Order) -> Optional[Dict]:
        """
        Вычисляет расчетное время прибытия (ETA) водителя к точке забора
        """
        route = self.calculate_driver_route(driver, order)
        if not route:
            return None
        
        return {
            'eta': route['eta'].isoformat(),
            'eta_timestamp': route['eta'].timestamp(),
            'distance_m': route['distance_m'],
            'distance_km': route['distance_km'],
            'duration_minutes': route['duration_minutes'],
            'duration_seconds': route['duration_seconds']
        }
