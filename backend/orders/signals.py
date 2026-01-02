from django.db.models.signals import post_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Order
from .serializers import OrderSerializer


def get_channel_layer_safe():
    """Безопасное получение channel layer"""
    try:
        return get_channel_layer()
    except Exception:
        return None


@receiver(post_save, sender=Order)
def order_updated(sender, instance, **kwargs):
    """Отправляет обновление заказа через WebSocket"""
    channel_layer = get_channel_layer_safe()
    if not channel_layer:
        return

    try:
        # Отправляем обновление в группу заказа
        order_data = OrderSerializer(instance).data
        
        async_to_sync(channel_layer.group_send)(
            f'order_{instance.id}',
            {
                'type': 'order_update',
                'data': order_data
            }
        )

        # Отправляем обновление водителю, если заказ назначен
        if instance.driver:
            async_to_sync(channel_layer.group_send)(
                f'driver_{instance.driver.id}',
                {
                    'type': 'order_update',
                    'data': order_data
                }
            )

        # Отправляем обновление пассажиру
        async_to_sync(channel_layer.group_send)(
            f'passenger_{instance.passenger.id}',
            {
                'type': 'order_update',
                'data': order_data
            }
        )

        # Если статус изменился, отправляем специальное событие
        if 'status' in kwargs.get('update_fields', []):
            async_to_sync(channel_layer.group_send)(
                f'order_{instance.id}',
                {
                    'type': 'order_status_changed',
                    'data': {
                        'order_id': str(instance.id),
                        'status': instance.status,
                        'status_display': instance.get_status_display()
                    }
                }
            )

        # Если водитель назначен, отправляем уведомление
        if instance.driver and 'driver' in kwargs.get('update_fields', []):
            async_to_sync(channel_layer.group_send)(
                f'order_{instance.id}',
                {
                    'type': 'driver_assigned',
                    'data': {
                        'order_id': str(instance.id),
                        'driver': {
                            'id': str(instance.driver.id),
                            'name': instance.driver.name,
                            'car_model': instance.driver.car_model,
                            'plate_number': instance.driver.plate_number
                        }
                    }
                }
            )

        # Отправляем обновление в dispatch_map группу для карты диспетчеризации
        # Отправляем только для активных заказов (не draft, не rejected, not completed, not cancelled)
        active_statuses = [
            'submitted', 'awaiting_dispatcher_decision', 'active_queue',
            'assigned', 'driver_en_route', 'arrived_waiting', 'ride_ongoing'
        ]
        inactive_statuses = ['completed', 'cancelled', 'rejected', 'draft']
        
        order_data = OrderSerializer(instance).data
        
        # Если заказ стал неактивным (завершен или отменен), отправляем обновление для удаления с карты
        if instance.status in inactive_statuses and 'status' in kwargs.get('update_fields', []):
            async_to_sync(channel_layer.group_send)(
                'dispatch_map',
                {
                    'type': 'order_update',
                    'data': order_data
                }
            )
        elif instance.status in active_statuses:
            # Если это новый заказ
            if kwargs.get('created'):
                async_to_sync(channel_layer.group_send)(
                    'dispatch_map',
                    {
                        'type': 'order_created',
                        'data': order_data
                    }
                )
            else:
                # Обновление существующего заказа
                async_to_sync(channel_layer.group_send)(
                    'dispatch_map',
                    {
                        'type': 'order_update',
                        'data': order_data
                    }
                )
    except Exception:
        # Игнорируем ошибки WebSocket в production
        pass

