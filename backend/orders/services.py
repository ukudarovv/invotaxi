from django.utils import timezone
from .models import Order, OrderEvent, OrderStatus


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
        if new_status == OrderStatus.ASSIGNED and not order.assigned_at:
            order.assigned_at = timezone.now()
        elif new_status == OrderStatus.COMPLETED and not order.completed_at:
            order.completed_at = timezone.now()

        order.save()

        # Создаем событие
        OrderEvent.objects.create(
            order=order,
            status_from=old_status,
            status_to=new_status,
            description=reason
        )

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
                OrderStatus.CANCELLED
            ],
            OrderStatus.AWAITING_DISPATCHER_DECISION: [
                OrderStatus.ACTIVE_QUEUE,
                OrderStatus.REJECTED,
                OrderStatus.CANCELLED
            ],
            OrderStatus.ACTIVE_QUEUE: [
                OrderStatus.ASSIGNED,
                OrderStatus.CANCELLED
            ],
            OrderStatus.ASSIGNED: [
                OrderStatus.DRIVER_EN_ROUTE,
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
        }

        allowed = valid_transitions.get(old_status, [])
        return new_status in allowed

