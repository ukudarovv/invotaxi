from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import Order, OrderStatus, PricingConfig, SurgeZone, PriceBreakdown, CancelPolicy
from .serializers import OrderSerializer, OrderStatusUpdateSerializer
from .services import OrderService, PriceCalculator
from .advanced_pricing import AdvancedPriceCalculator
from accounts.models import Passenger, Driver
from dispatch.services import DispatchEngine


class OrderViewSet(viewsets.ModelViewSet):
    """ViewSet для заказов"""
    queryset = Order.objects.select_related('passenger', 'driver', 'passenger__user', 'driver__user').all()
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = super().get_queryset()

        # Админы и диспетчеры видят все заказы
        if user.is_staff:
            # Не применяем фильтрацию для администраторов
            pass
        # Фильтрация по роли для обычных пользователей
        elif hasattr(user, 'passenger'):
            # Пассажир видит только свои заказы
            queryset = queryset.filter(passenger=user.passenger)
        elif hasattr(user, 'driver'):
            # Водитель видит только свои заказы
            queryset = queryset.filter(driver=user.driver)

        # Фильтры
        status_filter = self.request.query_params.get('status')
        if status_filter:
            # Поддерживаем множественные статусы через запятую
            statuses = [s.strip() for s in status_filter.split(',')]
            if len(statuses) > 1:
                queryset = queryset.filter(status__in=statuses)
            else:
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
        try:
            OrderService.update_status(order, new_status, reason, user)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Ошибка обновления статуса заказа {order.id}: {str(e)}')
            return Response(
                {'error': f'Ошибка обновления статуса: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Перезагружаем объект из базы данных для получения актуальных данных
        order.refresh_from_db()
        
        # Если заказ завершен, рассчитываем финальную цену
        if new_status == OrderStatus.COMPLETED:
            try:
                # Используем существующие значения или None (метод сам рассчитает)
                # Передаем None, если значение отсутствует, чтобы метод сам рассчитал
                actual_distance = order.distance_km if order.distance_km is not None else None
                actual_waiting_time = order.waiting_time_minutes if order.waiting_time_minutes is not None else None
                
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f'Начинаем расчет финальной цены для заказа {order.id}')
                
                price_data = PriceCalculator.calculate_final_price(
                    order,
                    actual_distance_km=actual_distance,
                    actual_waiting_time_minutes=actual_waiting_time
                )
                
                logger.info(f'Расчет цены завершен для заказа {order.id}, price_breakdown type: {type(price_data.get("price_breakdown"))}')
                
                # Убеждаемся, что price_breakdown содержит только сериализуемые типы
                if price_data.get('price_breakdown'):
                    breakdown = price_data['price_breakdown']
                    # Проверяем и преобразуем все Decimal в float
                    cleaned_breakdown = {}
                    for key, value in breakdown.items():
                        if isinstance(value, Decimal):
                            cleaned_breakdown[key] = float(value)
                        else:
                            cleaned_breakdown[key] = value
                    price_data['price_breakdown'] = cleaned_breakdown
                
                order.distance_km = price_data['distance_km']
                order.waiting_time_minutes = price_data['waiting_time_minutes']
                order.final_price = price_data['final_price']
                order.price_breakdown = price_data['price_breakdown']
                order.save()
                
                logger.info(f'Цена успешно сохранена для заказа {order.id}')
            except Exception as e:
                import logging
                import traceback
                logger = logging.getLogger(__name__)
                logger.error(f'Ошибка расчета финальной цены для заказа {order.id}: {str(e)}')
                logger.error(traceback.format_exc())
                # Не прерываем выполнение, просто логируем ошибку
                # Заказ уже обновлен, просто не рассчитана цена

        # Перезагружаем объект еще раз после всех изменений
        order.refresh_from_db()
        
        try:
            return Response(OrderSerializer(order).data)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Ошибка сериализации заказа {order.id}: {str(e)}')
            return Response(
                {'error': f'Ошибка сериализации данных: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'], url_path='calculate-price')
    def calculate_price(self, request, pk=None):
        """Ручной пересчет цены заказа"""
        order = self.get_object()
        
        # Проверяем права доступа (только админы и диспетчеры)
        if not request.user.is_staff:
            return Response(
                {'error': 'Нет прав для пересчета цены'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Получаем параметры из запроса (опционально)
        actual_distance = request.data.get('actual_distance_km')
        actual_waiting_time = request.data.get('actual_waiting_time_minutes')
        
        # Если заказ завершен, рассчитываем финальную цену
        if order.status == OrderStatus.COMPLETED:
            price_data = PriceCalculator.calculate_final_price(
                order,
                actual_distance_km=actual_distance,
                actual_waiting_time_minutes=actual_waiting_time
            )
            order.distance_km = price_data['distance_km']
            order.waiting_time_minutes = price_data['waiting_time_minutes']
            order.final_price = price_data['final_price']
            order.price_breakdown = price_data['price_breakdown']
        else:
            # Иначе пересчитываем предварительную цену
            price_data = PriceCalculator.calculate_estimated_price(order)
            order.distance_km = price_data['distance_km']
            order.waiting_time_minutes = price_data['waiting_time_minutes']
            order.estimated_price = price_data['estimated_price']
            order.price_breakdown = price_data['price_breakdown']
        
        order.save()
        
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
    
    @action(detail=True, methods=['post'], url_path='calculate-quote')
    def calculate_quote(self, request, pk=None):
        """Рассчитать предварительную цену (Quote) для заказа"""
        order = self.get_object()
        
        # Получаем маршрут
        dispatch_engine = DispatchEngine()
        route_data = dispatch_engine.calculate_order_route(order)
        
        if not route_data:
            return Response(
                {'error': 'Не удалось рассчитать маршрут'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        route_distance_km = route_data['distance_km']
        route_duration_min = route_data['duration_minutes']
        
        # Опции из запроса
        options = request.data.get('options', {})
        
        # Рассчитываем quote
        calculator = AdvancedPriceCalculator()
        result = calculator.calculate_quote(
            order,
            route_distance_km,
            route_duration_min,
            options
        )
        
        # Сохраняем quote в заказ
        order.quote = result['quote']
        order.quote_surge_multiplier = result['surge_multiplier']
        order.quote_calculated_at = timezone.now()
        order.save(update_fields=['quote', 'quote_surge_multiplier', 'quote_calculated_at'])
        
        # Фиксируем surge при назначении (если заказ уже назначен)
        if order.status == OrderStatus.ASSIGNED and not order.locked_surge_multiplier:
            order.locked_surge_multiplier = result['surge_multiplier']
            order.surge_locked_at = timezone.now()
            order.save(update_fields=['locked_surge_multiplier', 'surge_locked_at'])
        
        return Response({
            'quote': result['quote'],
            'surge_multiplier': result['surge_multiplier'],
            'details': result['details'],
            'breakdown_id': result['breakdown'].id
        })
    
    @action(detail=True, methods=['post'], url_path='calculate-final')
    def calculate_final(self, request, pk=None):
        """Рассчитать финальную цену для заказа"""
        order = self.get_object()
        
        # Проверяем права (только водитель или админ)
        user = request.user
        if not user.is_staff and not (hasattr(user, 'driver') and order.driver == user.driver):
            return Response(
                {'error': 'Нет прав для расчета финальной цены'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Получаем фактические данные из запроса или заказа
        actual_distance_km = request.data.get('actual_distance_km') or order.distance_km
        actual_duration_min = request.data.get('actual_duration_min')
        actual_waiting_min = request.data.get('actual_waiting_min') or order.waiting_time_minutes or 0
        
        if not actual_distance_km:
            return Response(
                {'error': 'Не указано фактическое расстояние'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # GPS точки для фильтрации (опционально)
        gps_points = request.data.get('gps_points')
        options = request.data.get('options', {})
        
        # Рассчитываем финальную цену
        calculator = AdvancedPriceCalculator()
        result = calculator.calculate_final(
            order,
            actual_distance_km,
            actual_duration_min or 0,
            actual_waiting_min,
            gps_points,
            options
        )
        
        # Сохраняем финальную цену
        order.final_price = result['final_price']
        order.distance_km = actual_distance_km
        order.waiting_time_minutes = int(actual_waiting_min)
        order.save(update_fields=['final_price', 'distance_km', 'waiting_time_minutes'])
        
        return Response({
            'final_price': result['final_price'],
            'surge_multiplier': result['surge_multiplier'],
            'details': result['details'],
            'breakdown_id': result['breakdown'].id
        })
    
    @action(detail=True, methods=['post'], url_path='calculate-cancel-fee')
    def calculate_cancel_fee(self, request, pk=None):
        """Рассчитать штраф за отмену заказа"""
        order = self.get_object()
        
        cancelled_by = request.data.get('cancelled_by', 'passenger')  # 'passenger' or 'driver'
        
        calculator = AdvancedPriceCalculator()
        result = calculator.calculate_cancel_fee(order, cancelled_by)
        
        return Response(result)
    
    @action(detail=True, methods=['get'], url_path='price-breakdown')
    def get_price_breakdown(self, request, pk=None):
        """Получить детализацию цены заказа"""
        order = self.get_object()
        
        price_type = request.query_params.get('type', 'quote')  # 'quote' or 'final'
        
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
            'zone_fees': float(breakdown.zone_fees),
            'options_fees': float(breakdown.options_fees),
            'toll_fees': float(breakdown.toll_fees),
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

