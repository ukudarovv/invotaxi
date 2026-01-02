from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone
from .models import Driver


def get_channel_layer_safe():
    """Безопасное получение channel layer"""
    try:
        return get_channel_layer()
    except Exception:
        return None


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
                async_to_sync(channel_layer.group_send)(
                    'dispatch_map',
                    {
                        'type': 'driver_location_update',
                        'data': {
                            'driver_id': str(instance.id),
                            'lat': float(instance.current_lat),
                            'lon': float(instance.current_lon),
                            'timestamp': instance.last_location_update.isoformat() if instance.last_location_update else timezone.now().isoformat(),
                            'name': instance.name,
                            'car_model': instance.car_model,
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
                async_to_sync(channel_layer.group_send)(
                    'dispatch_map',
                    {
                        'type': 'driver_location_update',
                        'data': {
                            'driver_id': str(instance.id),
                            'lat': float(instance.current_lat),
                            'lon': float(instance.current_lon),
                            'timestamp': instance.last_location_update.isoformat() if instance.last_location_update else timezone.now().isoformat(),
                            'name': instance.name,
                            'car_model': instance.car_model,
                            'is_online': instance.is_online,
                        }
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

