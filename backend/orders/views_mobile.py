from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import Order, OrderStatus
from .serializers import OrderSerializer, OrderStatusUpdateSerializer
from .services import OrderService
from dispatch.services import DispatchEngine
from .advanced_pricing import AdvancedPriceCalculator


class MobileOrderViewSet(viewsets.ViewSet):
    """Мобильные endpoint'ы для заказов"""
    permission_classes = [IsAuthenticated]

    def check_passenger_access(self, order):
        """Проверить доступ пассажира к заказу"""
        if hasattr(self.request.user, 'passenger'):
            if order.passenger != self.request.user.passenger:
                return False
        return True

    def check_driver_access(self, order):
        """Проверить доступ водителя к заказу"""
        if hasattr(self.request.user, 'driver'):
            if order.driver != self.request.user.driver:
                return False
        return True

    @action(detail=False, methods=['post'], url_path='create')
    def create_order(self, request):
        """Создать новый заказ (для пассажира)"""
        if not hasattr(request.user, 'passenger'):
            return Response(
                {'error': 'Только пассажиры могут создавать заказы'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = OrderSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='quote')
    def calculate_quote(self, request):
        """Рассчитать предварительную цену (Quote) для заказа"""
        # Получаем данные заказа из запроса
        pickup_lat = request.query_params.get('pickup_lat')
        pickup_lon = request.query_params.get('pickup_lon')
        dropoff_lat = request.query_params.get('dropoff_lat')
        dropoff_lon = request.query_params.get('dropoff_lon')
        has_companion = request.query_params.get('has_companion', 'false').lower() == 'true'
        
        if not all([pickup_lat, pickup_lon, dropoff_lat, dropoff_lon]):
            return Response(
                {'error': 'Требуются координаты pickup и dropoff'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            pickup_lat = float(pickup_lat)
            pickup_lon = float(pickup_lon)
            dropoff_lat = float(dropoff_lat)
            dropoff_lon = float(dropoff_lon)
        except ValueError:
            return Response(
                {'error': 'Неверный формат координат'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Рассчитываем маршрут
        engine = DispatchEngine()
        route_data = engine.calculate_route(pickup_lat, pickup_lon, dropoff_lat, dropoff_lon)
        
        if not route_data:
            return Response(
                {'error': 'Не удалось рассчитать маршрут'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Создаем временный заказ для расчета цены
        # (или используем данные пассажира если он авторизован)
        passenger = None
        if hasattr(request.user, 'passenger'):
            passenger = request.user.passenger
        
        if not passenger:
            return Response(
                {'error': 'Требуется авторизация пассажира'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Создаем временный заказ
        temp_order = Order(
            id=f'temp_{int(timezone.now().timestamp() * 1000)}',
            passenger=passenger,
            pickup_lat=pickup_lat,
            pickup_lon=pickup_lon,
            dropoff_lat=dropoff_lat,
            dropoff_lon=dropoff_lon,
            pickup_title=request.query_params.get('pickup_title', ''),
            dropoff_title=request.query_params.get('dropoff_title', ''),
            has_companion=has_companion,
            desired_pickup_time=timezone.now(),
            status=OrderStatus.DRAFT
        )
        
        # Рассчитываем quote
        calculator = AdvancedPriceCalculator()
        result = calculator.calculate_quote(
            temp_order,
            route_data['distance_km'],
            route_data['duration_minutes'],
            {}
        )
        
        return Response({
            'quote': float(result['quote']),
            'surge_multiplier': float(result['surge_multiplier']),
            'distance_km': route_data['distance_km'],
            'duration_minutes': route_data['duration_minutes'],
            'details': result['details'],
        })

    @action(detail=False, methods=['post'], url_path='(?P<order_id>[^/.]+)/cancel')
    def cancel_order(self, request, order_id=None):
        """Отменить заказ"""
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Проверяем права доступа
        user = request.user
        can_cancel = False
        
        if hasattr(user, 'passenger'):
            can_cancel = (order.passenger == user.passenger)
        elif hasattr(user, 'driver'):
            can_cancel = (order.driver == user.driver)
        elif user.is_staff:
            can_cancel = True
        
        if not can_cancel:
            return Response(
                {'error': 'Нет прав для отмены этого заказа'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Проверяем, можно ли отменить заказ
        if order.status in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]:
            return Response(
                {'error': 'Заказ уже завершен или отменен'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Рассчитываем штраф за отмену
        cancelled_by = 'passenger' if hasattr(user, 'passenger') else 'driver'
        calculator = AdvancedPriceCalculator()
        cancel_fee_data = calculator.calculate_cancel_fee(order, cancelled_by)
        
        # Обновляем статус заказа
        reason = request.data.get('reason', 'Отменено пользователем')
        OrderService.update_status(order, OrderStatus.CANCELLED, reason, user)
        
        order.refresh_from_db()
        serializer = OrderSerializer(order)
        
        return Response({
            'order': serializer.data,
            'cancel_fee': cancel_fee_data.get('cancel_fee'),
            'cancel_fee_details': cancel_fee_data.get('details'),
        })

    @action(detail=False, methods=['patch'], url_path='(?P<order_id>[^/.]+)/status')
    def update_order_status(self, request, order_id=None):
        """Обновить статус заказа"""
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = OrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        new_status = serializer.validated_data['status']
        reason = serializer.validated_data.get('reason', '')
        
        # Проверяем права доступа
        user = request.user
        can_update = False
        
        if hasattr(user, 'passenger'):
            # Пассажир может только отменять
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
        try:
            OrderService.update_status(order, new_status, reason, user)
        except Exception as e:
            return Response(
                {'error': f'Ошибка обновления статуса: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Если заказ завершен, рассчитываем финальную цену
        if new_status == OrderStatus.COMPLETED:
            try:
                from .services import PriceCalculator
                actual_distance = order.distance_km if order.distance_km is not None else None
                actual_waiting_time = order.waiting_time_minutes if order.waiting_time_minutes is not None else None
                
                price_data = PriceCalculator.calculate_final_price(
                    order,
                    actual_distance_km=actual_distance,
                    actual_waiting_time_minutes=actual_waiting_time
                )
                
                order.distance_km = price_data['distance_km']
                order.waiting_time_minutes = price_data['waiting_time_minutes']
                order.final_price = price_data['final_price']
                order.price_breakdown = price_data['price_breakdown']
                order.save()
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f'Ошибка расчета финальной цены: {str(e)}')
        
        order.refresh_from_db()
        return Response(OrderSerializer(order).data)

    @action(detail=False, methods=['get'], url_path='(?P<order_id>[^/.]+)/route')
    def get_order_route(self, request, order_id=None):
        """Получить маршрут заказа"""
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Проверяем права доступа
        if not (self.check_passenger_access(order) or 
                self.check_driver_access(order) or 
                request.user.is_staff):
            return Response(
                {'error': 'Нет доступа к этому заказу'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        engine = DispatchEngine()
        route_data = engine.calculate_order_route(order)
        
        if not route_data:
            return Response(
                {'error': 'Не удалось рассчитать маршрут'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Преобразуем datetime в строку
        if route_data.get('eta'):
            route_data['eta'] = route_data['eta'].isoformat()
        
        return Response(route_data)

    @action(detail=False, methods=['get'], url_path='(?P<order_id>[^/.]+)/price-breakdown')
    def get_price_breakdown(self, request, order_id=None):
        """Получить детализацию цены заказа"""
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Проверяем права доступа
        if not (self.check_passenger_access(order) or 
                self.check_driver_access(order) or 
                request.user.is_staff):
            return Response(
                {'error': 'Нет доступа к этому заказу'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        price_type = request.query_params.get('type', 'quote')  # 'quote' or 'final'
        
        from .models import PriceBreakdown
        breakdown = PriceBreakdown.objects.filter(
            order=order,
            price_type=price_type
        ).order_by('-created_at').first()
        
        if not breakdown:
            return Response(
                {'error': f'Детализация цены типа {price_type} не найдена'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response({
            'order_id': order.id,
            'price_type': breakdown.price_type,
            'base_fare': float(breakdown.base_fare),
            'distance_km': float(breakdown.distance_km),
            'distance_cost': float(breakdown.distance_cost),
            'duration_min': float(breakdown.duration_min),
            'duration_cost': float(breakdown.duration_cost),
            'waiting_min': float(breakdown.waiting_min),
            'waiting_cost': float(breakdown.waiting_cost),
            'booking_fee': float(breakdown.booking_fee),
            'companion_fee': float(breakdown.companion_fee),
            'night_multiplier': float(breakdown.night_multiplier),
            'weekend_multiplier': float(breakdown.weekend_multiplier),
            'disability_multiplier': float(breakdown.disability_multiplier),
            'surge_multiplier': float(breakdown.surge_multiplier),
            'subtotal_before_surge': float(breakdown.subtotal_before_surge),
            'subtotal_after_surge': float(breakdown.subtotal_after_surge),
            'minimum_fare_adjustment': float(breakdown.minimum_fare_adjustment),
            'total': float(breakdown.total),
            'created_at': breakdown.created_at.isoformat()
        })
