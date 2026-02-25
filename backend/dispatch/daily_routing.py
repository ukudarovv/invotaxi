"""
Сервис распределения заказов на день между водителями.
Строит маршрут на целый день для каждого водителя, учитывая:
- desired_pickup_time заказов
- расстояние между точками (для минимизации холостого пробега)
- вместимость водителя
- справедливое распределение (равномерная нагрузка)
"""
from typing import List, Dict, Optional
from datetime import datetime, date, timedelta
from django.utils import timezone
from django.db.models import Q, Count
from orders.models import Order, OrderStatus
from accounts.models import Driver, DriverStatus
from geo.services import Geo
import logging

logger = logging.getLogger(__name__)

ESTIMATED_ORDER_DURATION_MINUTES = 30


class DailyRoute:
    """Дневной маршрут одного водителя"""
    def __init__(self, driver: Driver):
        self.driver = driver
        self.orders: List[Order] = []
        self.total_distance_km: float = 0
        self.total_orders: int = 0

    def add_order(self, order: Order):
        self.orders.append(order)
        self.total_orders += 1

    def last_dropoff_coords(self):
        if self.orders:
            last = self.orders[-1]
            return (last.dropoff_lat, last.dropoff_lon)
        if self.driver.current_lat and self.driver.current_lon:
            return (self.driver.current_lat, self.driver.current_lon)
        return None

    def last_end_time(self):
        if self.orders:
            last = self.orders[-1]
            return last.desired_pickup_time + timedelta(minutes=ESTIMATED_ORDER_DURATION_MINUTES)
        return None

    def can_take_order(self, order: Order) -> bool:
        if self.driver.capacity < order.seats_needed:
            return False
        end = self.last_end_time()
        if end and order.desired_pickup_time < end:
            return False
        return True

    def deadhead_distance_to(self, order: Order) -> float:
        coords = self.last_dropoff_coords()
        if coords is None:
            return 0
        return Geo.calculate_distance(coords[0], coords[1], order.pickup_lat, order.pickup_lon) / 1000.0

    def to_dict(self) -> dict:
        return {
            "driver": {
                "id": self.driver.id,
                "name": self.driver.name,
                "car_model": self.driver.car_model,
                "plate_number": self.driver.plate_number,
                "phone": self.driver.user.phone if self.driver.user else None,
                "region": self.driver.region.title if self.driver.region else None,
                "capacity": self.driver.capacity,
            },
            "orders": [
                {
                    "id": o.id,
                    "pickup_title": o.pickup_title,
                    "dropoff_title": o.dropoff_title,
                    "pickup_lat": o.pickup_lat,
                    "pickup_lon": o.pickup_lon,
                    "dropoff_lat": o.dropoff_lat,
                    "dropoff_lon": o.dropoff_lon,
                    "desired_pickup_time": o.desired_pickup_time.isoformat() if o.desired_pickup_time else None,
                    "status": o.status,
                    "passenger_name": o.passenger.full_name if o.passenger else None,
                    "has_companion": o.has_companion,
                    "seats_needed": o.seats_needed,
                    "estimated_price": str(o.estimated_price) if o.estimated_price else None,
                    "distance_km": o.distance_km,
                    "note": o.note,
                }
                for o in self.orders
            ],
            "total_orders": self.total_orders,
            "total_distance_km": round(self.total_distance_km, 2),
        }


def distribute_orders_for_day(target_date: date, auto_assign: bool = False, user=None) -> Dict:
    """
    Распределяет все незназначенные заказы на указанную дату между онлайн-водителями.

    Алгоритм:
    1. Собирает все заказы на целевую дату (submitted / active_queue / awaiting_dispatcher_decision)
    2. Сортирует заказы по desired_pickup_time
    3. Для каждого заказа выбирает лучшего водителя:
       - У кого наименьшее количество заказов (fairness)
       - При равенстве — наименьший холостой пробег от последнего dropoff до нового pickup
       - При этом водитель должен успеть (desired_pickup_time > last_end_time)
    4. Возвращает результат распределения

    auto_assign: если True, фактически назначает заказы (меняет статус на assigned)
    """

    day_start = timezone.make_aware(datetime.combine(target_date, datetime.min.time()))
    day_end = timezone.make_aware(datetime.combine(target_date + timedelta(days=1), datetime.min.time()))

    unassigned_statuses = [
        OrderStatus.SUBMITTED,
        OrderStatus.ACTIVE_QUEUE,
        OrderStatus.AWAITING_DISPATCHER_DECISION,
    ]
    orders = list(
        Order.objects.filter(
            desired_pickup_time__gte=day_start,
            desired_pickup_time__lt=day_end,
            status__in=unassigned_statuses,
        )
        .select_related("passenger", "passenger__region")
        .order_by("desired_pickup_time")
    )

    already_assigned = list(
        Order.objects.filter(
            desired_pickup_time__gte=day_start,
            desired_pickup_time__lt=day_end,
            status=OrderStatus.ASSIGNED,
            driver__isnull=False,
        )
        .select_related("passenger", "driver", "driver__region")
        .order_by("desired_pickup_time")
    )

    drivers = list(
        Driver.objects.filter(is_online=True)
        .select_related("user", "region")
        .order_by("id")
    )

    if not drivers:
        drivers = list(
            Driver.objects.all()
            .select_related("user", "region")
            .order_by("id")
        )

    routes: Dict[int, DailyRoute] = {}
    for drv in drivers:
        routes[drv.id] = DailyRoute(drv)

    for o in already_assigned:
        if o.driver_id in routes:
            routes[o.driver_id].add_order(o)

    assigned_orders = []
    unassigned_orders = []

    for order in orders:
        best_driver_id = None
        best_score = None

        for drv_id, route in routes.items():
            if not route.can_take_order(order):
                continue

            deadhead = route.deadhead_distance_to(order)
            score = (route.total_orders, deadhead)

            if best_score is None or score < best_score:
                best_score = score
                best_driver_id = drv_id

        if best_driver_id is not None:
            route = routes[best_driver_id]
            route.add_order(order)
            route.total_distance_km += route.deadhead_distance_to(order)
            if order.distance_km:
                route.total_distance_km += order.distance_km

            if auto_assign:
                try:
                    driver = route.driver
                    order.driver = driver
                    order.driver_id = driver.id
                    order.status = OrderStatus.ASSIGNED
                    order.assigned_at = timezone.now()
                    order.assignment_reason = f"Автоматическое распределение на {target_date.isoformat()}: водитель {driver.name}"
                    order.save(update_fields=["driver", "driver_id", "status", "assigned_at", "assignment_reason"])
                    assigned_orders.append(order.id)
                except Exception as e:
                    logger.error(f"Ошибка назначения заказа {order.id}: {e}")
                    unassigned_orders.append({"id": order.id, "reason": str(e)})
            else:
                assigned_orders.append(order.id)
        else:
            unassigned_orders.append({
                "id": order.id,
                "reason": "Нет подходящего водителя (все заняты или не хватает вместимости)",
            })

    routes_list = []
    for drv_id in sorted(routes.keys()):
        r = routes[drv_id]
        if r.total_orders > 0:
            routes_list.append(r.to_dict())

    return {
        "date": target_date.isoformat(),
        "total_orders": len(orders) + len(already_assigned),
        "unassigned_count": len(orders),
        "already_assigned_count": len(already_assigned),
        "distributed_count": len(assigned_orders),
        "failed_count": len(unassigned_orders),
        "drivers_count": len(drivers),
        "routes": routes_list,
        "unassigned_orders": unassigned_orders,
        "auto_assigned": auto_assign,
    }
