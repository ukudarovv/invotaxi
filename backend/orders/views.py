from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import Order, OrderStatus
from .serializers import OrderSerializer, OrderStatusUpdateSerializer
from .services import OrderService
from accounts.models import Passenger, Driver


class OrderViewSet(viewsets.ModelViewSet):
    """ViewSet для заказов"""
    queryset = Order.objects.select_related('passenger', 'driver', 'passenger__user', 'driver__user').all()
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = super().get_queryset()

        # Фильтрация по роли
        if hasattr(user, 'passenger'):
            # Пассажир видит только свои заказы
            queryset = queryset.filter(passenger=user.passenger)
        elif hasattr(user, 'driver'):
            # Водитель видит только свои заказы
            queryset = queryset.filter(driver=user.driver)
        # Админы видят все заказы

        # Фильтры
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        passenger_id = self.request.query_params.get('passenger_id')
        if passenger_id:
            queryset = queryset.filter(passenger_id=passenger_id)

        driver_id = self.request.query_params.get('driver_id')
        if driver_id:
            queryset = queryset.filter(driver_id=driver_id)

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        
        # Если пользователь - пассажир, автоматически устанавливаем его
        if hasattr(user, 'passenger'):
            serializer.save(passenger=user.passenger, status=OrderStatus.SUBMITTED)
        else:
            serializer.save(status=OrderStatus.SUBMITTED)

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        """Обновление статуса заказа"""
        order = self.get_object()
        serializer = OrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']
        reason = serializer.validated_data.get('reason', '')

        # Проверяем права доступа
        user = request.user
        can_update = False

        if hasattr(user, 'passenger'):
            # Пассажир может отменять свои заказы
            can_update = (order.passenger == user.passenger and 
                         new_status == OrderStatus.CANCELLED)
        elif hasattr(user, 'driver'):
            # Водитель может обновлять статусы своих заказов
            can_update = (order.driver == user.driver and 
                         new_status in [
                             OrderStatus.DRIVER_EN_ROUTE,
                             OrderStatus.ARRIVED_WAITING,
                             OrderStatus.RIDE_ONGOING,
                             OrderStatus.COMPLETED,
                             OrderStatus.CANCELLED
                         ])
        elif user.is_staff:
            # Админ может все
            can_update = True

        if not can_update:
            return Response(
                {'error': 'Нет прав для изменения статуса'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Валидируем переход статуса
        if not OrderService.validate_status_transition(order.status, new_status):
            return Response(
                {'error': f'Недопустимый переход статуса: {order.status} -> {new_status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Обновляем статус
        OrderService.update_status(order, new_status, reason, user)

        return Response(OrderSerializer(order).data)

    @action(detail=False, methods=['get'], url_path='passenger/(?P<passenger_id>[^/.]+)')
    def get_by_passenger(self, request, passenger_id=None):
        """Получить заказы пассажира"""
        user = request.user
        
        # Проверяем права доступа
        if hasattr(user, 'passenger') and str(user.passenger.id) != str(passenger_id):
            return Response(
                {'error': 'Нет доступа'},
                status=status.HTTP_403_FORBIDDEN
            )

        orders = self.get_queryset().filter(passenger_id=passenger_id)
        serializer = self.get_serializer(orders, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='driver/(?P<driver_id>[^/.]+)')
    def get_by_driver(self, request, driver_id=None):
        """Получить заказы водителя"""
        user = request.user
        
        # Проверяем права доступа
        if hasattr(user, 'driver') and str(user.driver.id) != str(driver_id):
            return Response(
                {'error': 'Нет доступа'},
                status=status.HTTP_403_FORBIDDEN
            )

        orders = self.get_queryset().filter(driver_id=driver_id)
        serializer = self.get_serializer(orders, many=True)
        return Response(serializer.data)

