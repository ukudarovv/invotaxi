from typing import List, Optional, Tuple
from django.utils import timezone
from datetime import date
from orders.models import Order, OrderStatus
from accounts.models import Driver
from geo.services import Geo


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

        # Получаем всех онлайн водителей
        online_drivers = Driver.objects.filter(is_online=True)

        candidates = []
        for driver in online_drivers:
            # Проверяем вместимость
            if driver.capacity < seats_needed:
                continue

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

