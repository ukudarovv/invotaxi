"""
Middleware для автоматической обработки заказов
"""
from django.utils import timezone
from .models import Order, OrderStatus
from .services import OrderService


class OrderStatusMiddleware:
    """Middleware для автоматического обновления статусов заказов"""
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Проверяем заказы, которые требуют автоматического обновления
        self._check_expired_waiting_orders()
        
        response = self.get_response(request)
        return response
    
    def _check_expired_waiting_orders(self):
        """Проверяет заказы с истекшим временем ожидания"""
        # Заказы в статусе arrived_waiting более 20 минут
        from datetime import timedelta
        expired_time = timezone.now() - timedelta(minutes=20)
        
        expired_orders = Order.objects.filter(
            status=OrderStatus.ARRIVED_WAITING,
            assigned_at__lt=expired_time
        )
        
        for order in expired_orders:
            OrderService.update_status(
                order,
                OrderStatus.NO_SHOW,
                'Время ожидания истекло (20 минут)'
            )

