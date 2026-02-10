from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone
from datetime import timedelta
from .models import Driver
import logging

logger = logging.getLogger(__name__)

# Кэш для дебаунсинга обновлений локаций
# В production лучше использовать Redis
_location_update_cache = {}
_last_location_cache = {}

# Минимальное расстояние изменения для отправки обновления (в метрах)
MIN_DISTANCE_CHANGE_M = 10.0  # 10 метров

# Минимальный интервал между обновлениями (в секундах)
MIN_UPDATE_INTERVAL_SECONDS = 0.5  # 500ms


def get_channel_layer_safe():
    """Безопасное получение channel layer"""
    try:
        return get_channel_layer()
    except Exception:
        return None


def should_send_location_update(driver_id: str, new_lat: float, new_lon: float) -> bool:
    """
    Проверяет, нужно ли отправлять обновление локации
    Возвращает True если:
    1. Прошло достаточно времени с последнего обновления
    2. Позиция изменилась значительно
    """
    now = timezone.now()
    driver_id_str = str(driver_id)
    
    # Проверяем время последнего обновления
    last_update_time = _location_update_cache.get(driver_id_str)
    if last_update_time:
        time_diff = (now - last_update_time).total_seconds()
        if time_diff < MIN_UPDATE_INTERVAL_SECONDS:
            return False
    
    # Проверяем значимость изменения позиции
    last_location = _last_location_cache.get(driver_id_str)
    if last_location:
        from geo.services import Geo
        distance = Geo.calculate_distance(
            last_location['lat'], last_location['lon'],
            new_lat, new_lon
        )
        if distance < MIN_DISTANCE_CHANGE_M:
            return False
    
    # Обновляем кэш
    _location_update_cache[driver_id_str] = now
    _last_location_cache[driver_id_str] = {'lat': new_lat, 'lon': new_lon}
    
    return True


@receiver(post_save, sender=Driver)
def driver_updated(sender, instance, **kwargs):
    """Отправляет обновления водителя через WebSocket в dispatch_map группу"""
    channel_layer = get_channel_layer_safe()
    if not channel_layer:
        return

    try:
        # Отправляем обновление локации, если она изменилась
        if 'current_lat' in kwargs.get('update_fields', []) or 'current_lon' in kwargs.get('update_fields', []):
            if instance.current_lat is not None and instance.current_lon is not None:
                # Проверяем, нужно ли отправлять обновление (дебаунсинг)
                if not should_send_location_update(instance.id, instance.current_lat, instance.current_lon):
                    return
                
                # Получаем ETA для активного заказа, если есть
                eta_data = None
                from orders.models import Order, OrderStatus
                active_statuses = [
                    OrderStatus.ASSIGNED,
                    OrderStatus.DRIVER_EN_ROUTE,
                    OrderStatus.ARRIVED_WAITING,
                    OrderStatus.RIDE_ONGOING,
                ]
                active_order = Order.objects.filter(
                    driver=instance,
                    status__in=active_statuses
                ).first()
                
                if active_order:
                    from dispatch.services import DispatchEngine
                    engine = DispatchEngine()
                    eta_data = engine.calculate_eta(instance, active_order)
                
                location_data = {
                    'driver_id': str(instance.id),
                    'lat': float(instance.current_lat),
                    'lon': float(instance.current_lon),
                    'timestamp': instance.last_location_update.isoformat() if instance.last_location_update else timezone.now().isoformat(),
                    'name': instance.name,
                    'car_model': instance.car_model,
                }
                
                if eta_data:
                    location_data['eta'] = eta_data
                
                async_to_sync(channel_layer.group_send)(
                    'dispatch_map',
                    {
                        'type': 'driver_location_update',
                        'data': location_data
                    }
                )
                
                # Отправляем обновление ETA отдельным событием
                if eta_data:
                    async_to_sync(channel_layer.group_send)(
                        'dispatch_map',
                        {
                            'type': 'driver_eta_update',
                            'data': {
                                'driver_id': str(instance.id),
                                'order_id': str(active_order.id),
                                **eta_data
                            }
                        }
                    )

        # Отправляем обновление статуса онлайн/оффлайн
        if 'is_online' in kwargs.get('update_fields', []):
            async_to_sync(channel_layer.group_send)(
                'dispatch_map',
                {
                    'type': 'driver_status_update',
                    'data': {
                        'driver_id': str(instance.id),
                        'is_online': instance.is_online,
                        'name': instance.name,
                        'car_model': instance.car_model,
                    }
                }
            )

        # Если это создание нового водителя или обновление всех полей, отправляем полное обновление
        if kwargs.get('created') or not kwargs.get('update_fields'):
            # Отправляем обновление локации, если она есть
            if instance.current_lat is not None and instance.current_lon is not None:
                # Для новых водителей или полных обновлений всегда отправляем (без дебаунсинга)
                location_data = {
                    'driver_id': str(instance.id),
                    'lat': float(instance.current_lat),
                    'lon': float(instance.current_lon),
                    'timestamp': instance.last_location_update.isoformat() if instance.last_location_update else timezone.now().isoformat(),
                    'name': instance.name,
                    'car_model': instance.car_model,
                    'is_online': instance.is_online,
                }
                
                # Получаем ETA для активного заказа, если есть
                from orders.models import Order, OrderStatus
                active_statuses = [
                    OrderStatus.ASSIGNED,
                    OrderStatus.DRIVER_EN_ROUTE,
                    OrderStatus.ARRIVED_WAITING,
                    OrderStatus.RIDE_ONGOING,
                ]
                active_order = Order.objects.filter(
                    driver=instance,
                    status__in=active_statuses
                ).first()
                
                if active_order:
                    from dispatch.services import DispatchEngine
                    engine = DispatchEngine()
                    eta_data = engine.calculate_eta(instance, active_order)
                    if eta_data:
                        location_data['eta'] = eta_data
                
                async_to_sync(channel_layer.group_send)(
                    'dispatch_map',
                    {
                        'type': 'driver_location_update',
                        'data': location_data
                    }
                )
            # Отправляем обновление статуса при создании или полном обновлении
            async_to_sync(channel_layer.group_send)(
                'dispatch_map',
                {
                    'type': 'driver_status_update',
                    'data': {
                        'driver_id': str(instance.id),
                        'is_online': instance.is_online,
                        'name': instance.name,
                        'car_model': instance.car_model,
                    }
                }
            )
    except Exception as e:
        # Игнорируем ошибки WebSocket в production
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error sending driver update to dispatch_map: {e}")

