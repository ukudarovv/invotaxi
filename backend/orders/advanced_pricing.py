"""
Продвинутый калькулятор цен для такси
Реализует детерминированный расчет + динамические множители + защиту от злоупотреблений
"""
from typing import Dict, Optional, List, Tuple
from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone
from django.db.models import Q, Count
from datetime import datetime, timedelta
import math
import logging

from orders.models import (
    PricingConfig, Order, OrderStatus, SurgeZone, PriceBreakdown, CancelPolicy
)
from accounts.models import Driver
from geo.services import Geo

logger = logging.getLogger(__name__)


class AdvancedPriceCalculator:
    """Продвинутый калькулятор цен с поддержкой surge pricing и защиты"""
    
    def __init__(self, tariff: Optional[PricingConfig] = None):
        self.tariff = tariff
    
    def calculate_quote(
        self,
        order: Order,
        route_distance_km: float,
        route_duration_min: float,
        options: Optional[Dict] = None
    ) -> Dict:
        """
        Рассчитывает предварительную цену (Quote)
        
        Args:
            order: Заказ
            route_distance_km: Расстояние маршрута в км
            route_duration_min: Длительность маршрута в минутах
            options: Дополнительные опции (детское кресло, багаж и т.д.)
        
        Returns:
            Словарь с quote, surge_multiplier и детализацией
        """
        if not self.tariff:
            region = order.passenger.region if hasattr(order.passenger, 'region') and order.passenger.region else None
            self.tariff = PricingConfig.get_pricing_config(region)
        
        options = options or {}
        
        # 1. Рассчитываем "сырой" тариф
        billable_km = max(Decimal('0'), Decimal(str(route_distance_km)) - self.tariff.included_km)
        billable_min = max(Decimal('0'), Decimal(str(route_duration_min)) - self.tariff.included_min)
        
        # 2. Базовая стоимость
        raw = (
            self.tariff.base_fare +
            billable_km * self.tariff.price_per_km +
            billable_min * self.tariff.price_per_minute
        )
        
        # 3. Минимальная стоимость
        raw = max(raw, self.tariff.minimum_fare)
        
        # 4. Фиксированные сборы
        booking_fee = self.tariff.booking_fee
        companion_fee = self.tariff.companion_fee if order.has_companion else Decimal('0')
        zone_fees = self._calculate_zone_fees(order)
        options_fees = self._calculate_options_fees(options)
        
        raw += booking_fee + companion_fee + zone_fees + options_fees
        
        # 5. Множители времени
        pickup_time = order.desired_pickup_time or timezone.now()
        night_multiplier = self._get_night_multiplier(pickup_time)
        weekend_multiplier = self._get_weekend_multiplier(pickup_time)
        disability_multiplier = self._get_disability_multiplier(order)
        
        raw_with_time = raw * night_multiplier * weekend_multiplier * disability_multiplier
        
        # 6. Динамический множитель (surge)
        surge_multiplier = self._calculate_surge(order)
        quote_before_surge = raw_with_time
        
        # Применяем surge (по умолчанию ко всей сумме)
        if self.tariff.surge_enabled:
            quote = quote_before_surge * surge_multiplier
        else:
            quote = quote_before_surge
            surge_multiplier = Decimal('1.0')
        
        # 7. Округление
        quote = self._round_price(quote, self.tariff.rounding_rule)
        
        # Сохраняем детализацию
        breakdown = PriceBreakdown(
            order=order,
            price_type='quote',
            base_fare=self.tariff.base_fare,
            distance_km=Decimal(str(route_distance_km)),
            distance_cost=billable_km * self.tariff.price_per_km,
            duration_min=Decimal(str(route_duration_min)),
            duration_cost=billable_min * self.tariff.price_per_minute,
            booking_fee=booking_fee,
            companion_fee=companion_fee,
            zone_fees=zone_fees,
            options_fees=options_fees,
            night_multiplier=night_multiplier,
            weekend_multiplier=weekend_multiplier,
            disability_multiplier=disability_multiplier,
            surge_multiplier=surge_multiplier,
            surge_applied_to='all',
            subtotal_before_surge=quote_before_surge,
            subtotal_after_surge=quote,
            minimum_fare_adjustment=max(Decimal('0'), self.tariff.minimum_fare - raw),
            total=quote
        )
        breakdown.save()
        
        return {
            'quote': float(quote),
            'surge_multiplier': float(surge_multiplier),
            'breakdown': breakdown,
            'details': {
                'base_fare': float(self.tariff.base_fare),
                'distance_km': route_distance_km,
                'distance_cost': float(billable_km * self.tariff.price_per_km),
                'duration_min': route_duration_min,
                'duration_cost': float(billable_min * self.tariff.price_per_minute),
                'booking_fee': float(booking_fee),
                'companion_fee': float(companion_fee),
                'zone_fees': float(zone_fees),
                'options_fees': float(options_fees),
                'night_multiplier': float(night_multiplier),
                'weekend_multiplier': float(weekend_multiplier),
                'disability_multiplier': float(disability_multiplier),
                'subtotal_before_surge': float(quote_before_surge),
                'surge_multiplier': float(surge_multiplier),
                'subtotal_after_surge': float(quote),
                'minimum_fare_adjustment': float(max(Decimal('0'), self.tariff.minimum_fare - raw)),
            }
        }
    
    def calculate_final(
        self,
        order: Order,
        actual_distance_km: float,
        actual_duration_min: float,
        actual_waiting_min: float = 0,
        gps_points: Optional[List[Tuple[float, float]]] = None,
        options: Optional[Dict] = None
    ) -> Dict:
        """
        Рассчитывает финальную цену (Final Fare)
        
        Args:
            order: Заказ
            actual_distance_km: Фактическое расстояние в км (после фильтрации GPS)
            actual_duration_min: Фактическая длительность в минутах
            actual_waiting_min: Фактическое время ожидания в минутах
            gps_points: Список GPS точек для проверки (опционально)
            options: Дополнительные опции
        
        Returns:
            Словарь с final_price и детализацией
        """
        if not self.tariff:
            region = order.passenger.region if hasattr(order.passenger, 'region') and order.passenger.region else None
            self.tariff = PricingConfig.get_pricing_config(region)
        
        options = options or {}
        
        # Фильтруем GPS точки от шумов
        if gps_points:
            actual_distance_km = self._filter_gps_noise(gps_points, actual_distance_km)
        
        # Используем зафиксированный surge (если есть) или текущий
        if order.locked_surge_multiplier:
            surge_multiplier = order.locked_surge_multiplier
        else:
            surge_multiplier = Decimal(str(order.quote_surge_multiplier)) if order.quote_surge_multiplier else Decimal('1.0')
            # Фиксируем surge при расчете финальной цены
            order.locked_surge_multiplier = surge_multiplier
            order.surge_locked_at = timezone.now()
            order.save(update_fields=['locked_surge_multiplier', 'surge_locked_at'])
        
        # 1. Считаем базовую стоимость
        billable_km = max(Decimal('0'), Decimal(str(actual_distance_km)) - self.tariff.included_km)
        billable_min = max(Decimal('0'), Decimal(str(actual_duration_min)) - self.tariff.included_min)
        
        raw_final = (
            self.tariff.base_fare +
            billable_km * self.tariff.price_per_km +
            billable_min * self.tariff.price_per_minute
        )
        
        # 2. Ожидание
        paid_wait_min = max(Decimal('0'), Decimal(str(actual_waiting_min)) - Decimal(str(self.tariff.wait_free_min)))
        waiting_cost = paid_wait_min * self.tariff.wait_per_min
        
        raw_final += waiting_cost
        
        # 3. Сборы/опции
        booking_fee = self.tariff.booking_fee
        companion_fee = self.tariff.companion_fee if order.has_companion else Decimal('0')
        zone_fees = self._calculate_zone_fees(order)
        options_fees = self._calculate_options_fees(options)
        toll_fees = Decimal('0')  # TODO: реализовать расчет платных дорог
        
        raw_final += booking_fee + companion_fee + zone_fees + options_fees + toll_fees
        
        # 4. Множители времени
        pickup_time = order.assigned_at or order.desired_pickup_time or timezone.now()
        night_multiplier = self._get_night_multiplier(pickup_time)
        weekend_multiplier = self._get_weekend_multiplier(pickup_time)
        disability_multiplier = self._get_disability_multiplier(order)
        
        raw_with_time = raw_final * night_multiplier * weekend_multiplier * disability_multiplier
        
        # 5. Применяем зафиксированный surge
        if self.tariff.surge_enabled:
            final = raw_with_time * surge_multiplier
        else:
            final = raw_with_time
        
        # 6. Округление
        final = self._round_price(final, self.tariff.rounding_rule)
        
        # 7. Защита от "улета" цены
        if order.quote and not order.route_changed:
            max_final = Decimal(str(order.quote)) * self.tariff.final_price_cap_multiplier
            if final > max_final:
                logger.warning(
                    f'Финальная цена {final} превышает лимит {max_final} для заказа {order.id}. '
                    f'Применяется лимит.'
                )
                final = max_final
        
        # Сохраняем детализацию
        breakdown = PriceBreakdown(
            order=order,
            price_type='final',
            base_fare=self.tariff.base_fare,
            distance_km=Decimal(str(actual_distance_km)),
            distance_cost=billable_km * self.tariff.price_per_km,
            duration_min=Decimal(str(actual_duration_min)),
            duration_cost=billable_min * self.tariff.price_per_minute,
            waiting_min=Decimal(str(actual_waiting_min)),
            waiting_free_min=Decimal(str(self.tariff.wait_free_min)),
            waiting_cost=waiting_cost,
            booking_fee=booking_fee,
            companion_fee=companion_fee,
            zone_fees=zone_fees,
            options_fees=options_fees,
            toll_fees=toll_fees,
            night_multiplier=night_multiplier,
            weekend_multiplier=weekend_multiplier,
            disability_multiplier=disability_multiplier,
            surge_multiplier=surge_multiplier,
            surge_applied_to='all',
            subtotal_before_surge=raw_with_time,
            subtotal_after_surge=final,
            minimum_fare_adjustment=max(Decimal('0'), self.tariff.minimum_fare - raw_final),
            total=final
        )
        breakdown.save()
        
        return {
            'final_price': float(final),
            'surge_multiplier': float(surge_multiplier),
            'breakdown': breakdown,
            'details': {
                'base_fare': float(self.tariff.base_fare),
                'distance_km': actual_distance_km,
                'distance_cost': float(billable_km * self.tariff.price_per_km),
                'duration_min': actual_duration_min,
                'duration_cost': float(billable_min * self.tariff.price_per_minute),
                'waiting_min': actual_waiting_min,
                'waiting_cost': float(waiting_cost),
                'booking_fee': float(booking_fee),
                'companion_fee': float(companion_fee),
                'zone_fees': float(zone_fees),
                'options_fees': float(options_fees),
                'toll_fees': float(toll_fees),
                'night_multiplier': float(night_multiplier),
                'weekend_multiplier': float(weekend_multiplier),
                'disability_multiplier': float(disability_multiplier),
                'subtotal_before_surge': float(raw_with_time),
                'surge_multiplier': float(surge_multiplier),
                'subtotal_after_surge': float(final),
            }
        }
    
    def _calculate_surge(self, order: Order) -> Decimal:
        """Рассчитывает surge multiplier для заказа"""
        if not self.tariff.surge_enabled:
            return Decimal('1.0')
        
        # Определяем зону заказа
        zone = self._get_zone_for_order(order)
        if not zone:
            return Decimal('1.0')
        
        # Обновляем метрики зоны
        self._update_zone_metrics(zone)
        
        # Рассчитываем ratio
        demand = zone.demand_count
        supply = max(1, zone.supply_count)  # Избегаем деления на 0
        
        ratio = Decimal(str(demand)) / Decimal(str(supply))
        
        # Преобразуем ratio в multiplier
        if ratio <= Decimal('1.0'):
            mult_raw = Decimal('1.0')
        else:
            k = self.tariff.surge_sensitivity
            mult_raw = Decimal('1.0') + k * (ratio - Decimal('1.0'))
        
        # Ограничиваем диапазон
        mult_raw = max(self.tariff.surge_min_multiplier, min(mult_raw, self.tariff.surge_max_multiplier))
        
        # Округляем до шага
        step = self.tariff.surge_step
        mult_raw = (mult_raw / step).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * step
        
        # Сглаживание
        alpha = self.tariff.surge_smoothing_alpha
        smoothed = alpha * zone.smoothed_multiplier + (Decimal('1') - alpha) * mult_raw
        
        # Обновляем зону
        zone.current_multiplier = mult_raw
        zone.smoothed_multiplier = smoothed
        zone.save(update_fields=['current_multiplier', 'smoothed_multiplier', 'last_updated'])
        
        return smoothed
    
    def _get_zone_for_order(self, order: Order) -> Optional[SurgeZone]:
        """Получает зону surge для заказа"""
        # Ищем зону по региону или по координатам
        if hasattr(order.passenger, 'region') and order.passenger.region:
            zone = SurgeZone.objects.filter(
                region=order.passenger.region,
                is_active=True
            ).first()
            if zone:
                return zone
        
        # Ищем зону по координатам (ближайшую)
        zones = SurgeZone.objects.filter(is_active=True)
        pickup_lat, pickup_lon = order.pickup_lat, order.pickup_lon
        
        for zone in zones:
            if zone.radius_meters:
                # Круговая зона
                distance = Geo.calculate_distance(
                    pickup_lat, pickup_lon,
                    zone.center_lat, zone.center_lon
                )
                if distance <= zone.radius_meters:
                    return zone
            elif zone.polygon_coordinates:
                # Полигональная зона (упрощенная проверка - можно улучшить)
                if self._point_in_polygon(pickup_lat, pickup_lon, zone.polygon_coordinates):
                    return zone
        
        return None
    
    def _point_in_polygon(self, lat: float, lon: float, polygon: List[List[float]]) -> bool:
        """Проверяет, находится ли точка внутри полигона (упрощенная версия)"""
        # TODO: Реализовать правильный алгоритм point-in-polygon
        # Пока возвращаем False
        return False
    
    def _update_zone_metrics(self, zone: SurgeZone):
        """Обновляет метрики спроса и предложения для зоны"""
        # Спрос: количество заказов в статусе MATCHING/OFFERED за последние 5 минут
        five_min_ago = timezone.now() - timedelta(minutes=5)
        demand = Order.objects.filter(
            pickup_lat__isnull=False,
            pickup_lon__isnull=False,
            status__in=[OrderStatus.MATCHING, OrderStatus.OFFERED, OrderStatus.CREATED],
            created_at__gte=five_min_ago
        ).count()
        
        # Предложение: количество доступных водителей в зоне
        # Упрощенная версия - считаем всех онлайн водителей
        # TODO: Улучшить расчет с учетом ETA до зоны
        supply = Driver.objects.filter(
            is_online=True,
            status__in=['online_idle', 'paused'],
            current_lat__isnull=False,
            current_lon__isnull=False
        ).count()
        
        zone.demand_count = demand
        zone.supply_count = supply
        zone.last_updated = timezone.now()
        zone.save(update_fields=['demand_count', 'supply_count', 'last_updated'])
    
    def _filter_gps_noise(
        self,
        gps_points: List[Tuple[float, float]],
        raw_distance_km: float
    ) -> float:
        """
        Фильтрует GPS шумы и "телепорты"
        
        Args:
            gps_points: Список GPS точек [(lat, lon), ...]
            raw_distance_km: Сырое расстояние
        
        Returns:
            Отфильтрованное расстояние
        """
        if len(gps_points) < 2:
            return raw_distance_km
        
        # Фильтруем точки с плохой точностью (если есть информация о точности)
        # Пока просто проверяем на "телепорты"
        
        filtered_points = [gps_points[0]]
        MAX_SPEED_KMH = 120.0  # Максимальная скорость в км/ч
        MAX_SPEED_MS = MAX_SPEED_KMH / 3.6  # м/с
        
        for i in range(1, len(gps_points)):
            prev_lat, prev_lon = gps_points[i-1]
            curr_lat, curr_lon = gps_points[i]
            
            # Расстояние между точками в метрах
            distance_m = Geo.calculate_distance(prev_lat, prev_lon, curr_lat, curr_lon)
            
            # Предполагаем, что точки с интервалом 1 секунда
            # Если скорость превышает MAX_SPEED - это "телепорт", пропускаем точку
            if distance_m <= MAX_SPEED_MS:
                filtered_points.append((curr_lat, curr_lon))
            else:
                logger.warning(f'Обнаружен GPS "телепорт": расстояние {distance_m}m за 1 сек')
        
        # Пересчитываем расстояние по отфильтрованным точкам
        filtered_distance = 0.0
        for i in range(1, len(filtered_points)):
            prev_lat, prev_lon = filtered_points[i-1]
            curr_lat, curr_lon = filtered_points[i]
            filtered_distance += Geo.calculate_distance(prev_lat, prev_lon, curr_lat, curr_lon)
        
        return filtered_distance / 1000.0  # Конвертируем в км
    
    def _calculate_zone_fees(self, order: Order) -> Decimal:
        """Рассчитывает зональные сборы"""
        # TODO: Реализовать расчет зональных сборов
        return Decimal('0')
    
    def _calculate_options_fees(self, options: Dict) -> Decimal:
        """Рассчитывает стоимость дополнительных опций"""
        total = Decimal('0')
        
        # Примеры опций
        if options.get('child_seat'):
            total += Decimal('200')  # Детское кресло
        if options.get('large_luggage'):
            total += Decimal('100')  # Большой багаж
        
        return total
    
    def _get_night_multiplier(self, dt: datetime) -> Decimal:
        """Проверяет, является ли время ночным"""
        hour = dt.hour
        if hour >= 22 or hour < 6:
            return self.tariff.night_time_multiplier
        return Decimal('1.0')
    
    def _get_weekend_multiplier(self, dt: datetime) -> Decimal:
        """Проверяет, является ли день выходным"""
        if dt.weekday() >= 5:  # 5 = суббота, 6 = воскресенье
            return self.tariff.weekend_multiplier
        return Decimal('1.0')
    
    def _get_disability_multiplier(self, order: Order) -> Decimal:
        """Получает множитель для категории инвалидности"""
        if not hasattr(order.passenger, 'disability_category'):
            return Decimal('1.0')
        
        multipliers = self.tariff.disability_category_multiplier or {}
        multiplier_value = multipliers.get(order.passenger.disability_category, 1.0)
        
        if isinstance(multiplier_value, Decimal):
            return multiplier_value
        return Decimal(str(multiplier_value))
    
    def _round_price(self, price: Decimal, rounding_rule: str) -> Decimal:
        """Округляет цену согласно правилу"""
        rule_map = {
            '1': Decimal('1'),
            '5': Decimal('5'),
            '10': Decimal('10'),
            '50': Decimal('50'),
        }
        
        step = rule_map.get(rounding_rule, Decimal('10'))
        
        # Округляем до ближайшего шага
        rounded = (price / step).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * step
        
        return rounded
    
    def calculate_cancel_fee(
        self,
        order: Order,
        cancelled_by: str,  # 'passenger' or 'driver'
        cancel_time: Optional[datetime] = None
    ) -> Dict:
        """
        Рассчитывает штраф за отмену заказа
        
        Args:
            order: Заказ
            cancelled_by: Кто отменил ('passenger' or 'driver')
            cancel_time: Время отмены (если None, используется текущее время)
        
        Returns:
            Словарь с fee и деталями
        """
        cancel_time = cancel_time or timezone.now()
        policy = CancelPolicy.get_active_policy(
            order.passenger.region if hasattr(order.passenger, 'region') else None
        )
        
        fee = Decimal('0')
        reason = ''
        
        if cancelled_by == 'passenger':
            if order.status == OrderStatus.CANCELLED:
                # Уже отменен
                return {'fee': 0, 'reason': 'Заказ уже отменен'}
            
            if order.status in [OrderStatus.DRAFT, OrderStatus.SUBMITTED, OrderStatus.CREATED, OrderStatus.MATCHING]:
                # До назначения водителя
                fee = policy.cancel_before_assigned_fee
                reason = 'Отмена до назначения водителя'
            
            elif order.status == OrderStatus.OFFERED or (order.status == OrderStatus.ASSIGNED and order.assigned_at):
                # После назначения, но до прибытия
                if order.assigned_at:
                    time_since_assigned = (cancel_time - order.assigned_at).total_seconds()
                    if time_since_assigned <= policy.grace_cancel_seconds:
                        fee = Decimal('0')
                        reason = 'Отмена в льготный период'
                    else:
                        fee = policy.cancel_after_assigned_fee
                        reason = 'Отмена после назначения водителя'
                else:
                    fee = policy.cancel_after_assigned_fee
                    reason = 'Отмена после назначения водителя'
            
            elif order.status in [OrderStatus.DRIVER_EN_ROUTE, OrderStatus.ARRIVED_WAITING]:
                # После прибытия водителя
                fee = policy.cancel_after_arrived_fee
                if policy.cancel_after_arrived_include_waiting and order.waiting_time_minutes:
                    waiting_cost = max(
                        Decimal('0'),
                        Decimal(str(order.waiting_time_minutes)) - Decimal(str(policy.wait_free_min or 0))
                    ) * Decimal('30')  # Примерная ставка ожидания
                    fee += waiting_cost
                reason = 'Отмена после прибытия водителя'
        
        elif cancelled_by == 'driver':
            # Отмена водителем - обычно без штрафа для клиента
            fee = Decimal('0')
            reason = 'Отмена водителем'
        
        return {
            'fee': float(fee),
            'reason': reason,
            'policy': policy.name
        }
