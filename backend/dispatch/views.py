from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from orders.models import Order, OrderStatus
from orders.services import OrderService
from .services import DispatchEngine


class DispatchViewSet(viewsets.ViewSet):
    """ViewSet для диспетчеризации"""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['post'], url_path='assign/(?P<order_id>[^/.]+)')
    def assign_order(self, request, order_id=None):
        """Назначение заказа водителю"""
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Проверяем права доступа (только админы или диспетчеры)
        user = request.user
        if not user.is_staff and not hasattr(user, 'driver'):
            return Response(
                {'error': 'Нет прав для назначения заказов'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Проверяем статус заказа
        if order.status != OrderStatus.ACTIVE_QUEUE:
            return Response(
                {'error': f'Заказ должен быть в статусе {OrderStatus.ACTIVE_QUEUE}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Назначаем заказ
        engine = DispatchEngine()
        result = engine.assign_order(order)

        if result.driver_id:
            # Обновляем заказ
            from accounts.models import Driver
            try:
                driver = Driver.objects.get(id=result.driver_id)
                order.driver = driver
                order.assignment_reason = result.reason
                OrderService.update_status(order, OrderStatus.ASSIGNED, result.reason, user)
                
                return Response({
                    'success': True,
                    'driver_id': result.driver_id,
                    'reason': result.reason,
                    'order': {
                        'id': order.id,
                        'status': order.status,
                        'driver': {
                            'id': str(driver.id),
                            'name': driver.name,
                            'car_model': driver.car_model
                        }
                    }
                })
            except Driver.DoesNotExist:
                return Response(
                    {'error': 'Водитель не найден'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            return Response({
                'success': False,
                'reason': result.reason,
                'rejection_reason': result.rejection_reason
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='candidates/(?P<order_id>[^/.]+)')
    def get_candidates(self, request, order_id=None):
        """Получить кандидатов для заказа"""
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Проверяем права доступа
        user = request.user
        if not user.is_staff:
            return Response(
                {'error': 'Нет прав'},
                status=status.HTTP_403_FORBIDDEN
            )

        engine = DispatchEngine()
        candidates = engine.get_candidates(order)

        return Response({
            'order_id': order_id,
            'candidates': candidates,
            'count': len(candidates)
        })

