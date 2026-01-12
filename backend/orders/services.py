from django.utils import timezone
from django.db.models import Q
from decimal import Decimal
import math
from datetime import datetime, time
from .models import Order, OrderEvent, OrderStatus, PricingConfig


class OrderService:
    """Сервис для работы с заказами"""

    @staticmethod
    def update_status(order: Order, new_status: str, reason: str = None, user=None):
        """
        Обновляет статус заказа и создает событие
        """
        old_status = order.status
        order.status = new_status

        # Обновляем временные метки
        update_fields = ['status']
        if new_status == OrderStatus.ASSIGNED and not order.assigned_at:
            order.assigned_at = timezone.now()
            update_fields.append('assigned_at')
        elif new_status == OrderStatus.COMPLETED and not order.completed_at:
            order.completed_at = timezone.now()
            update_fields.append('completed_at')
        
        # Если водитель был назначен или очищен, добавляем его в поля для обновления
        driver_changed = False
        
        # Сначала проверяем, если водитель был установлен через order.driver
        if hasattr(order, 'driver') and order.driver and order.driver.id:
            # Убеждаемся, что driver_id установлен
            if not order.driver_id:
                order.driver_id = order.driver.id
            driver_changed = True
        
        # Проверяем изменение driver_id (включая очистку водителя)
        if order.driver_id is not None:
            try:
                old_order = Order.objects.get(pk=order.pk)
                # Если водитель изменился или был очищен (был, стал None)
                if old_order.driver_id != order.driver_id:
                    driver_changed = True
            except Order.DoesNotExist:
                # Заказ новый, driver нужно сохранить
                driver_changed = True
        elif hasattr(order, 'driver') and order.driver is None:
            # Проверяем, был ли водитель ранее (очистка водителя)
            try:
                old_order = Order.objects.get(pk=order.pk)
                if old_order.driver_id is not None:
                    driver_changed = True
            except Order.DoesNotExist:
                pass
        
        # Если статус ASSIGNED и водитель установлен, всегда сохраняем водителя
        # (даже если он не изменился, чтобы гарантировать сохранение)
        if new_status == OrderStatus.ASSIGNED and order.driver_id is not None:
            driver_changed = True
        
        if driver_changed and 'driver' not in update_fields:
            update_fields.append('driver')
        
        # Если assignment_reason был установлен, добавляем его
        if hasattr(order, 'assignment_reason') and order.assignment_reason:
            update_fields.append('assignment_reason')

        try:
            order.save(update_fields=update_fields)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Ошибка сохранения заказа {order.id}: {str(e)}')
            raise

        # Создаем событие
        try:
            OrderEvent.objects.create(
                order=order,
                status_from=old_status,
                status_to=new_status,
                description=reason or ''
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Ошибка создания события для заказа {order.id}: {str(e)}')
            # Не прерываем выполнение, если не удалось создать событие

        return order

    @staticmethod
    def validate_status_transition(old_status: str, new_status: str) -> bool:
        """
        Валидирует переход статуса
        """
        valid_transitions = {
            OrderStatus.DRAFT: [OrderStatus.SUBMITTED, OrderStatus.CANCELLED],
            OrderStatus.SUBMITTED: [
                OrderStatus.AWAITING_DISPATCHER_DECISION,
                OrderStatus.REJECTED,
                OrderStatus.CANCELLED,
                OrderStatus.CREATED,
                OrderStatus.MATCHING,
            ],
            OrderStatus.AWAITING_DISPATCHER_DECISION: [
                OrderStatus.ACTIVE_QUEUE,
                OrderStatus.MATCHING,
                OrderStatus.REJECTED,
                OrderStatus.CANCELLED
            ],
            OrderStatus.REJECTED: [
                OrderStatus.SUBMITTED,  # Восстановление отклоненного заказа
                OrderStatus.CANCELLED
            ],
            OrderStatus.CREATED: [
                OrderStatus.MATCHING,
                OrderStatus.CANCELLED
            ],
            OrderStatus.MATCHING: [
                OrderStatus.OFFERED,
                OrderStatus.ACTIVE_QUEUE,
                OrderStatus.CANCELLED
            ],
            OrderStatus.ACTIVE_QUEUE: [
                OrderStatus.MATCHING,
                OrderStatus.OFFERED,
                OrderStatus.ASSIGNED,
                OrderStatus.CANCELLED
            ],
            OrderStatus.OFFERED: [
                OrderStatus.ASSIGNED,
                OrderStatus.MATCHING,  # При отклонении/таймауте
                OrderStatus.CANCELLED
            ],
            OrderStatus.ASSIGNED: [
                OrderStatus.DRIVER_EN_ROUTE,
                OrderStatus.MATCHING,  # При реассайне
                OrderStatus.CANCELLED
            ],
            OrderStatus.DRIVER_EN_ROUTE: [
                OrderStatus.ARRIVED_WAITING,
                OrderStatus.CANCELLED
            ],
            OrderStatus.ARRIVED_WAITING: [
                OrderStatus.RIDE_ONGOING,
                OrderStatus.NO_SHOW,
                OrderStatus.CANCELLED
            ],
            OrderStatus.RIDE_ONGOING: [
                OrderStatus.COMPLETED,
                OrderStatus.INCIDENT,
                OrderStatus.CANCELLED
            ],
            OrderStatus.NO_SHOW: [OrderStatus.CANCELLED],
            OrderStatus.INCIDENT: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
            OrderStatus.CANCELLED: [
                OrderStatus.SUBMITTED,  # Восстановление отмененного заказа
                OrderStatus.ACTIVE_QUEUE,  # Восстановление в очередь
                OrderStatus.MATCHING  # Восстановление для повторного поиска
            ],
        }

        allowed = valid_transitions.get(old_status, [])
        return new_status in allowed


class PriceCalculator:
    """Сервис для расчета цены заказа"""

    @staticmethod
    def calculate_distance(pickup_coords: tuple, dropoff_coords: tuple) -> float:
        """
        Рассчитывает расстояние между двумя точками по формуле Haversine
        Возвращает расстояние в километрах
        """
        lat1, lon1 = pickup_coords
        lat2, lon2 = dropoff_coords
        
        # Радиус Земли в километрах
        R = 6371.0
        
        # Преобразуем градусы в радианы
        lat1_rad = math.radians(lat1)
        lon1_rad = math.radians(lon1)
        lat2_rad = math.radians(lat2)
        lon2_rad = math.radians(lon2)
        
        # Разница координат
        dlat = lat2_rad - lat1_rad
        dlon = lon2_rad - lon1_rad
        
        # Формула Haversine
        a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        distance = R * c
        return round(distance, 2)

    @staticmethod
    def get_pricing_config(region=None):
        """
        Получает активную конфигурацию ценообразования
        Сначала ищет конфигурацию для конкретного региона, затем общую
        """
        if region:
            config = PricingConfig.objects.filter(
                Q(region=region) | Q(region__isnull=True),
                is_active=True
            ).order_by('-region').first()
        else:
            config = PricingConfig.objects.filter(
                region__isnull=True,
                is_active=True
            ).first()
        
        # Если конфигурации нет, создаем дефолтную
        if not config:
            try:
                config = PricingConfig.objects.create(
                    price_per_km=Decimal('50.00'),
                    price_per_minute_waiting=Decimal('10.00'),
                    minimum_fare=Decimal('200.00'),
                    companion_fee=Decimal('100.00'),
                    disability_category_multiplier={
                        'I группа': 1.0,
                        'II группа': 1.0,
                        'III группа': 1.0,
                        'Ребенок-инвалид': 0.8
                    },
                    night_time_multiplier=Decimal('1.2'),
                    weekend_multiplier=Decimal('1.1'),
                    is_active=True
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f'Ошибка создания конфигурации ценообразования: {str(e)}')
                # Если не удалось создать, пробуем получить любую активную конфигурацию
                config = PricingConfig.objects.filter(is_active=True).first()
                if not config:
                    raise ValueError('Не удалось создать или найти конфигурацию ценообразования')
        
        # Убеждаемся, что disability_category_multiplier содержит только сериализуемые типы
        # Это важно, так как старые записи могут содержать Decimal объекты
        if config and config.disability_category_multiplier:
            multiplier_dict = config.disability_category_multiplier
            needs_update = False
            cleaned_multiplier = {}
            for key, value in multiplier_dict.items():
                if isinstance(value, Decimal):
                    cleaned_multiplier[key] = float(value)
                    needs_update = True
                else:
                    cleaned_multiplier[key] = value
            # Если были изменения, обновляем конфигурацию
            if needs_update:
                config.disability_category_multiplier = cleaned_multiplier
                try:
                    config.save(update_fields=['disability_category_multiplier'])
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f'Не удалось обновить disability_category_multiplier: {str(e)}')
                    # Продолжаем работу с очищенной версией в памяти
        
        return config

    @staticmethod
    def is_night_time(dt: datetime) -> bool:
        """Проверяет, является ли время ночным (22:00 - 06:00)"""
        hour = dt.hour
        return hour >= 22 or hour < 6

    @staticmethod
    def is_weekend(dt: datetime) -> bool:
        """Проверяет, является ли день выходным (суббота или воскресенье)"""
        return dt.weekday() >= 5  # 5 = суббота, 6 = воскресенье

    @staticmethod
    def calculate_estimated_price(order: Order, pricing_config: PricingConfig = None) -> dict:
        """
        Рассчитывает предварительную цену заказа
        Возвращает словарь с детализацией цены
        """
        if not pricing_config:
            region = None
            try:
                if hasattr(order.passenger, 'region') and order.passenger.region:
                    region = order.passenger.region
            except Exception:
                # Если не удалось получить регион, используем None (общая конфигурация)
                pass
            pricing_config = PriceCalculator.get_pricing_config(region)
        
        # Рассчитываем расстояние
        distance_km = PriceCalculator.calculate_distance(
            (order.pickup_lat, order.pickup_lon),
            (order.dropoff_lat, order.dropoff_lon)
        )
        
        # Базовая цена за расстояние
        base_distance_price = Decimal(str(distance_km)) * pricing_config.price_per_km
        
        # Цена за ожидание (предполагаем среднее время ожидания 5 минут для оценки)
        estimated_waiting_minutes = 5
        waiting_time_price = Decimal(str(estimated_waiting_minutes)) * pricing_config.price_per_minute_waiting
        
        # Доплата за сопровождение
        companion_fee = pricing_config.companion_fee if order.has_companion else Decimal('0')
        
        # Множитель для категории инвалидности
        disability_multiplier = Decimal('1.0')
        if hasattr(order.passenger, 'disability_category') and order.passenger.disability_category:
            multipliers = pricing_config.disability_category_multiplier or {}
            multiplier_value = multipliers.get(order.passenger.disability_category, 1.0)
            # Преобразуем в float, если это Decimal или другой тип
            if isinstance(multiplier_value, Decimal):
                multiplier_value = float(multiplier_value)
            disability_multiplier = Decimal(str(multiplier_value))
        
        # Множитель для ночного времени
        night_multiplier = Decimal('1.0')
        if PriceCalculator.is_night_time(order.desired_pickup_time):
            night_multiplier = pricing_config.night_time_multiplier
        
        # Множитель для выходных
        weekend_multiplier = Decimal('1.0')
        if PriceCalculator.is_weekend(order.desired_pickup_time):
            weekend_multiplier = pricing_config.weekend_multiplier
        
        # Промежуточная сумма
        subtotal = (base_distance_price + waiting_time_price + companion_fee) * disability_multiplier * night_multiplier * weekend_multiplier
        
        # Применяем минимальную стоимость
        minimum_fare_adjustment = Decimal('0')
        if subtotal < pricing_config.minimum_fare:
            minimum_fare_adjustment = pricing_config.minimum_fare - subtotal
            subtotal = pricing_config.minimum_fare
        
        total = subtotal
        
        breakdown = {
            'base_distance_price': float(base_distance_price),
            'waiting_time_price': float(waiting_time_price),
            'companion_fee': float(companion_fee),
            'disability_multiplier': float(disability_multiplier),
            'night_multiplier': float(night_multiplier),
            'weekend_multiplier': float(weekend_multiplier),
            'subtotal': float(subtotal),
            'minimum_fare_adjustment': float(minimum_fare_adjustment),
            'total': float(total)
        }
        
        return {
            'distance_km': distance_km,
            'waiting_time_minutes': estimated_waiting_minutes,
            'estimated_price': total,
            'price_breakdown': breakdown
        }

    @staticmethod
    def calculate_final_price(
        order: Order,
        actual_distance_km: float = None,
        actual_waiting_time_minutes: int = None,
        pricing_config: PricingConfig = None
    ) -> dict:
        """
        Рассчитывает финальную цену заказа с учетом реальных данных
        """
        if not pricing_config:
            region = None
            try:
                if hasattr(order.passenger, 'region') and order.passenger.region:
                    region = order.passenger.region
            except Exception:
                # Если не удалось получить регион, используем None (общая конфигурация)
                pass
            pricing_config = PriceCalculator.get_pricing_config(region)
        
        # Используем реальное расстояние или рассчитываем
        if actual_distance_km is None:
            distance_km = PriceCalculator.calculate_distance(
                (order.pickup_lat, order.pickup_lon),
                (order.dropoff_lat, order.dropoff_lon)
            )
        else:
            distance_km = actual_distance_km
        
        # Используем реальное время ожидания или берем из заказа
        if actual_waiting_time_minutes is None:
            waiting_minutes = order.waiting_time_minutes or 0
        else:
            waiting_minutes = actual_waiting_time_minutes
        
        # Базовая цена за расстояние
        base_distance_price = Decimal(str(distance_km)) * pricing_config.price_per_km
        
        # Цена за ожидание
        waiting_time_price = Decimal(str(waiting_minutes)) * pricing_config.price_per_minute_waiting
        
        # Доплата за сопровождение
        companion_fee = pricing_config.companion_fee if order.has_companion else Decimal('0')
        
        # Множитель для категории инвалидности
        disability_multiplier = Decimal('1.0')
        try:
            if hasattr(order.passenger, 'disability_category') and order.passenger.disability_category:
                multipliers = pricing_config.disability_category_multiplier or {}
                multiplier_value = multipliers.get(order.passenger.disability_category, 1.0)
                # Преобразуем в float, если это Decimal или другой тип
                if isinstance(multiplier_value, Decimal):
                    multiplier_value = float(multiplier_value)
                disability_multiplier = Decimal(str(multiplier_value))
        except Exception:
            # Если не удалось получить категорию инвалидности, используем дефолтный множитель
            disability_multiplier = Decimal('1.0')
        
        # Множитель для ночного времени (используем время начала поездки или желаемое время)
        pickup_time = order.assigned_at or order.desired_pickup_time
        night_multiplier = Decimal('1.0')
        try:
            if PriceCalculator.is_night_time(pickup_time):
                night_multiplier = pricing_config.night_time_multiplier
        except Exception:
            pass
        
        # Множитель для выходных
        weekend_multiplier = Decimal('1.0')
        try:
            if PriceCalculator.is_weekend(pickup_time):
                weekend_multiplier = pricing_config.weekend_multiplier
        except Exception:
            pass
        
        # Промежуточная сумма
        subtotal = (base_distance_price + waiting_time_price + companion_fee) * disability_multiplier * night_multiplier * weekend_multiplier
        
        # Применяем минимальную стоимость
        minimum_fare_adjustment = Decimal('0')
        if subtotal < pricing_config.minimum_fare:
            minimum_fare_adjustment = pricing_config.minimum_fare - subtotal
            subtotal = pricing_config.minimum_fare
        
        total = subtotal
        
        breakdown = {
            'base_distance_price': float(base_distance_price),
            'waiting_time_price': float(waiting_time_price),
            'companion_fee': float(companion_fee),
            'disability_multiplier': float(disability_multiplier),
            'night_multiplier': float(night_multiplier),
            'weekend_multiplier': float(weekend_multiplier),
            'subtotal': float(subtotal),
            'minimum_fare_adjustment': float(minimum_fare_adjustment),
            'total': float(total)
        }
        
        return {
            'distance_km': distance_km,
            'waiting_time_minutes': waiting_minutes,
            'final_price': total,
            'price_breakdown': breakdown
        }

