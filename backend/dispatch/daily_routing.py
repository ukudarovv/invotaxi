"""
Сервис распределения заказов на день между водителями.
Использует ML-скоринг из MatchingService (многофакторная модель):

  cost = w_eta * eta_norm
       + w_deadhead * deadhead_norm
       + w_reject * reject_norm
       + w_cancel * cancel_norm
       + w_fairness * fairness_norm
       + w_zone * zone_norm
       + w_quality * quality_norm

Адаптация для планирования на день:
- eta_norm → оценка «окна» между предыдущим заказом и desired_pickup_time
- deadhead_norm → холостой пробег от предыдущего dropoff до нового pickup
- reject/cancel_norm → из DriverStatistics (acceptance_rate, cancel_rate)
- fairness_norm → отклонение кол-ва заказов водителя от медианы
- quality_norm → штраф за низкий рейтинг
"""
from typing import List, Dict, Optional
from datetime import datetime, date, timedelta
from django.utils import timezone
from django.db.models import Q
from orders.models import Order, OrderStatus, DispatchConfig
from accounts.models import Driver, DriverStatus, DriverStatistics
from geo.services import Geo
import logging
import math

logger = logging.getLogger(__name__)

DROPOFF_BUFFER_MINUTES = 7.0  # Время высадки пассажира 5-10 мин
MIN_PER_KM_RIDE = 2.0  # ~30 км/ч в городе
MAX_DEADHEAD_KM = 20.0
MAX_GAP_MINUTES = 120.0


class DriverScore:
    """Результат ML-скоринга водителя для конкретного заказа"""
    def __init__(self, driver_id: int, cost: float, details: Dict):
        self.driver_id = driver_id
        self.cost = cost
        self.details = details


class DailyRoute:
    """Дневной маршрут одного водителя"""
    def __init__(self, driver: Driver, stats: Optional[DriverStatistics] = None):
        self.driver = driver
        self.stats = stats
        self.orders: List[Order] = []
        self.total_distance_km: float = 0
        self.total_orders: int = 0
        self.scores: List[Dict] = []

    def add_order(self, order: Order, score_details: Optional[Dict] = None):
        self.orders.append(order)
        self.total_orders += 1
        if score_details:
            self.scores.append({"order_id": order.id, **score_details})

    def last_dropoff_coords(self):
        if self.orders:
            last = self.orders[-1]
            return (last.dropoff_lat, last.dropoff_lon)
        if self.driver.current_lat and self.driver.current_lon:
            return (self.driver.current_lat, self.driver.current_lon)
        return None

    def last_end_time(self):
        """Время завершения последнего заказа: поездка + высадка (5-10 мин)"""
        if self.orders:
            last = self.orders[-1]
            ride_min = (last.distance_km or 5) * MIN_PER_KM_RIDE
            total_min = ride_min + DROPOFF_BUFFER_MINUTES
            return last.desired_pickup_time + timedelta(minutes=total_min)
        return None

    def can_take_order(self, order: Order) -> bool:
        if self.driver.capacity < order.seats_needed:
            return False
        end = self.last_end_time()
        if end and order.desired_pickup_time < end:
            return False
        return True

    def deadhead_km_to(self, order: Order) -> float:
        coords = self.last_dropoff_coords()
        if coords is None:
            return 0.0
        return Geo.calculate_distance(coords[0], coords[1], order.pickup_lat, order.pickup_lon) / 1000.0

    def gap_minutes_to(self, order: Order) -> float:
        end = self.last_end_time()
        if end is None:
            return 0.0
        delta = (order.desired_pickup_time - end).total_seconds() / 60.0
        return max(delta, 0.0)

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
                "rating": self.driver.rating,
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
            "scores": self.scores,
            "total_orders": self.total_orders,
            "total_distance_km": round(self.total_distance_km, 2),
        }


def _compute_ml_score(
    route: DailyRoute,
    order: Order,
    config: DispatchConfig,
    median_orders: float,
) -> DriverScore:
    """
    Вычисляет ML cost-score для назначения order водителю route.driver.
    Чем МЕНЬШЕ cost, тем ЛУЧШЕ кандидат.
    """
    driver = route.driver
    stats = route.stats

    # ── 1. gap_norm (аналог eta_norm) ─────────────────────────
    gap_min = route.gap_minutes_to(order)
    gap_norm = min(gap_min / MAX_GAP_MINUTES, 1.0)

    # ── 2. deadhead_norm ──────────────────────────────────────
    deadhead_km = route.deadhead_km_to(order)
    deadhead_norm = min(deadhead_km / MAX_DEADHEAD_KM, 1.0)

    # ── 3. reject_norm ────────────────────────────────────────
    acceptance_rate = stats.acceptance_rate if stats else 1.0
    reject_norm = 1.0 - acceptance_rate

    # ── 4. cancel_norm ────────────────────────────────────────
    cancel_norm = stats.cancel_rate if stats else 0.0

    # ── 5. fairness_norm: штраф только за перегруженность (предпочитаем менее загруженных) ──
    scale = getattr(config, 'fairness_scale', 2.0) or 2.0
    if median_orders >= 0 and scale > 0:
        diff = route.total_orders - median_orders
        fairness_norm = min(max(0.0, diff) / scale, 1.0)
    else:
        fairness_norm = 0.0

    # ── 6. zone_norm (упрощённая версия) ──────────────────────
    zone_norm = 0.0

    # ── 7. quality_norm ───────────────────────────────────────
    rating = driver.rating if driver.rating else 5.0
    if rating < 4.5:
        quality_norm = (4.5 - rating) / 1.5
    else:
        quality_norm = 0.0

    # ── Итоговый cost ──────────────────────────────────────────
    cost = (
        config.w_eta * gap_norm
        + config.w_deadhead * deadhead_norm
        + config.w_reject * reject_norm
        + config.w_cancel * cancel_norm
        + config.w_fairness * fairness_norm
        + config.w_zone * zone_norm
        + config.w_quality * quality_norm
    )

    details = {
        "cost": round(cost, 4),
        "gap_min": round(gap_min, 1),
        "gap_norm": round(gap_norm, 4),
        "deadhead_km": round(deadhead_km, 2),
        "deadhead_norm": round(deadhead_norm, 4),
        "reject_norm": round(reject_norm, 4),
        "cancel_norm": round(cancel_norm, 4),
        "fairness_norm": round(fairness_norm, 4),
        "zone_norm": round(zone_norm, 4),
        "quality_norm": round(quality_norm, 4),
        "acceptance_rate": round(acceptance_rate, 4),
        "cancel_rate": round(cancel_norm, 4),
        "rating": rating,
        "orders_so_far": route.total_orders,
        "weights": {
            "w_eta": config.w_eta,
            "w_deadhead": config.w_deadhead,
            "w_reject": config.w_reject,
            "w_cancel": config.w_cancel,
            "w_fairness": config.w_fairness,
            "w_zone": config.w_zone,
            "w_quality": config.w_quality,
        },
    }

    return DriverScore(driver.id, cost, details)


def _get_median(values: List[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    if n % 2 == 0:
        return (s[n // 2 - 1] + s[n // 2]) / 2.0
    return s[n // 2]


def distribute_orders_for_day(target_date: date, auto_assign: bool = False, user=None) -> Dict:
    """
    Распределяет заказы на день используя ML-скоринг (многофакторная модель).

    Алгоритм:
    1. Собирает незназначенные заказы на целевую дату, сортирует по desired_pickup_time.
    2. Загружает конфигурацию весов из DispatchConfig.
    3. Для каждого заказа считает ML cost-score для каждого водителя-кандидата:
         cost = w_eta·gap + w_deadhead·deadhead + w_reject·(1-AR) + w_cancel·CR
                + w_fairness·fairness + w_quality·quality
    4. Назначает заказ водителю с наименьшим cost.
    5. Возвращает маршруты с деталями скоринга.
    """

    config = DispatchConfig.get_active_config()

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

    # Загружаем статистику водителей
    stats_map: Dict[int, DriverStatistics] = {}
    for s in DriverStatistics.objects.filter(driver__in=drivers):
        stats_map[s.driver_id] = s

    routes: Dict[int, DailyRoute] = {}
    for drv in drivers:
        routes[drv.id] = DailyRoute(drv, stats_map.get(drv.id))

    for o in already_assigned:
        if o.driver_id in routes:
            routes[o.driver_id].add_order(o)

    assigned_orders: List[Dict] = []
    unassigned_orders: List[Dict] = []

    for order in orders:
        eligible: List[DriverScore] = []
        median_orders = _get_median([r.total_orders for r in routes.values()])

        max_deadhead = getattr(config, 'max_deadhead_km', None) or MAX_DEADHEAD_KM
        for drv_id, route in routes.items():
            if not route.can_take_order(order):
                continue
            deadhead_km = route.deadhead_km_to(order)
            if max_deadhead > 0 and deadhead_km > max_deadhead:
                continue
            score = _compute_ml_score(route, order, config, median_orders)
            eligible.append(score)

        if not eligible:
            unassigned_orders.append({
                "id": order.id,
                "reason": "Нет подходящего водителя (все заняты или не хватает вместимости)",
            })
            continue

        eligible.sort(key=lambda s: s.cost)
        best = eligible[0]
        route = routes[best.driver_id]

        deadhead = route.deadhead_km_to(order)
        route.add_order(order, best.details)
        route.total_distance_km += deadhead
        if order.distance_km:
            route.total_distance_km += order.distance_km

        assignment_info = {
            "order_id": order.id,
            "driver_id": best.driver_id,
            "driver_name": route.driver.name,
            "ml_cost": best.cost,
            "ml_details": best.details,
        }

        if auto_assign:
            try:
                driver = route.driver
                order.driver = driver
                order.driver_id = driver.id
                order.status = OrderStatus.ASSIGNED
                order.assigned_at = timezone.now()
                order.assignment_reason = (
                    f"ML-распределение на {target_date.isoformat()}: "
                    f"водитель {driver.name}, cost={best.cost:.4f}"
                )
                order.save(update_fields=[
                    "driver", "driver_id", "status", "assigned_at", "assignment_reason"
                ])
                assigned_orders.append(assignment_info)
            except Exception as e:
                logger.error(f"Ошибка назначения заказа {order.id}: {e}")
                unassigned_orders.append({"id": order.id, "reason": str(e)})
        else:
            assigned_orders.append(assignment_info)

    routes_list = []
    for drv_id in sorted(routes.keys()):
        r = routes[drv_id]
        if r.total_orders > 0:
            routes_list.append(r.to_dict())

    return {
        "date": target_date.isoformat(),
        "algorithm": "ml_scoring",
        "config": {
            "name": config.name,
            "w_eta": config.w_eta,
            "w_deadhead": config.w_deadhead,
            "w_reject": config.w_reject,
            "w_cancel": config.w_cancel,
            "w_fairness": config.w_fairness,
            "w_zone": config.w_zone,
            "w_quality": config.w_quality,
        },
        "total_orders": len(orders) + len(already_assigned),
        "unassigned_count": len(orders),
        "already_assigned_count": len(already_assigned),
        "distributed_count": len(assigned_orders),
        "failed_count": len(unassigned_orders),
        "drivers_count": len(drivers),
        "routes": routes_list,
        "assignments": assigned_orders,
        "unassigned_orders": unassigned_orders,
        "auto_assigned": auto_assign,
    }
