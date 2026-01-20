from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.http import HttpResponse
from .models import Order, OrderStatus, PricingConfig, SurgeZone, PriceBreakdown, CancelPolicy
from .serializers import OrderSerializer, OrderStatusUpdateSerializer
from .services import OrderService, PriceCalculator
from .advanced_pricing import AdvancedPriceCalculator
from accounts.models import Passenger, Driver
from dispatch.services import DispatchEngine
import csv
import io
import zipfile
import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)


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
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            order = self.get_object()
            logger.info(f'Обновление статуса заказа {order.id}: текущий статус = {order.status}, запрос = {request.data}')
        except Exception as e:
            logger.error(f'Ошибка получения заказа {pk}: {str(e)}')
            return Response(
                {'error': f'Заказ не найден: {str(e)}'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Валидация входных данных
        serializer = OrderStatusUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(f'Невалидные данные для заказа {order.id}: {serializer.errors}, получено: {request.data}')
            return Response(
                {
                    'error': 'Неверные данные запроса',
                    'details': serializer.errors,
                    'received_data': request.data
                },
                status=status.HTTP_400_BAD_REQUEST
            )

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
                {
                    'error': 'Нет прав для изменения статуса',
                    'current_user_role': 'passenger' if hasattr(user, 'passenger') else ('driver' if hasattr(user, 'driver') else 'admin'),
                    'order_status': order.status,
                    'requested_status': new_status
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # Валидируем переход статуса
        if not OrderService.validate_status_transition(order.status, new_status):
            # Получаем допустимые переходы для текущего статуса
            valid_transitions = OrderService.get_valid_transitions(order.status)
            logger.warning(
                f'Недопустимый переход статуса для заказа {order.id}: '
                f'{order.status} -> {new_status}. Допустимые переходы: {valid_transitions}'
            )
            return Response(
                {
                    'error': f'Недопустимый переход статуса: {order.status} -> {new_status}',
                    'current_status': order.status,
                    'requested_status': new_status,
                    'valid_transitions': valid_transitions,
                    'order_id': order.id
                },
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
    
    @action(detail=False, methods=['post'], url_path='import')
    def import_orders(self, request):
        """
        Импорт заказов из CSV файла
        """
        # Проверяем права (только админы и диспетчеры)
        if not request.user.is_staff:
            return Response(
                {'error': 'Нет прав для импорта заказов'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if 'file' not in request.FILES:
            return Response(
                {'error': 'Не передан файл'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        csv_file = request.FILES['file']
        if not csv_file.name.endswith('.csv'):
            return Response(
                {'error': 'Файл должен быть в формате CSV'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        dry_run = request.data.get('dry_run', 'false').lower() == 'true'
        skip_errors = request.data.get('skip_errors', 'false').lower() == 'true'
        
        # Читаем CSV файл
        try:
            # Декодируем файл как UTF-8 с BOM или без
            content = csv_file.read()
            if content.startswith(b'\xef\xbb\xbf'):  # UTF-8 BOM
                content = content[3:]
            
            text_content = content.decode('utf-8')
            csv_reader = csv.DictReader(io.StringIO(text_content))
            
            success_count = 0
            failed_count = 0
            errors = []
            imported_ids = []
            
            for row_num, row in enumerate(csv_reader, start=2):  # Начинаем с 2, так как строка 1 - заголовки
                try:
                    # Валидация и создание заказа
                    order_data = self._parse_order_row(row, row_num)
                    
                    if dry_run:
                        # Только валидация, не создаем заказ
                        success_count += 1
                        continue
                    
                    # Создаем заказ через сериализатор
                    serializer = OrderSerializer(data=order_data)
                    if serializer.is_valid():
                        order = serializer.save()
                        success_count += 1
                        imported_ids.append(order.id)
                    else:
                        raise ValueError(f"Валидация не пройдена: {serializer.errors}")
                        
                except Exception as e:
                    failed_count += 1
                    error_msg = {
                        'row': row_num,
                        'message': str(e)
                    }
                    errors.append(error_msg)
                    
                    if not skip_errors:
                        # Если не пропускать ошибки, останавливаемся
                        return Response({
                            'success': False,
                            'success_count': success_count,
                            'failed_count': failed_count,
                            'errors': errors,
                            'message': f'Ошибка в строке {row_num}: {str(e)}'
                        }, status=status.HTTP_400_BAD_REQUEST)
            
            result = {
                'success': True,
                'success_count': success_count,
                'failed_count': failed_count,
                'errors': errors,
                'imported_ids': imported_ids,
                'dry_run': dry_run
            }
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f'Ошибка импорта заказов: {e}', exc_info=True)
            return Response(
                {'error': f'Ошибка обработки файла: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _parse_order_row(self, row: Dict, row_num: int) -> Dict:
        """Парсит строку CSV и возвращает данные для создания заказа"""
        # Обязательные поля (приводим ключи к lowercase для унификации)
        row_normalized = {k.lower().strip(): v for k, v in row.items() if v and str(v).strip()}
        passenger_id = row_normalized.get('passenger_id', '').strip()
        passenger_phone = row_normalized.get('passenger_phone', '').strip()
        
        if not passenger_id and not passenger_phone:
            raise ValueError('Не указан passenger_id или passenger_phone')
        
        # Находим пассажира
        passenger = None
        if passenger_id:
            try:
                passenger = Passenger.objects.get(id=int(passenger_id))
            except (Passenger.DoesNotExist, ValueError):
                raise ValueError(f'Пассажир с ID {passenger_id} не найден')
        elif passenger_phone:
            try:
                from accounts.models import User
                user = User.objects.get(phone=passenger_phone)
                if hasattr(user, 'passenger'):
                    passenger = user.passenger
                else:
                    raise ValueError(f'Пользователь с телефоном {passenger_phone} не является пассажиром')
            except User.DoesNotExist:
                raise ValueError(f'Пользователь с телефоном {passenger_phone} не найден')
        
        # Координаты
        try:
            pickup_lat = float(row_normalized.get('pickup_lat', '0') or '0')
            pickup_lon = float(row_normalized.get('pickup_lon', '0') or '0')
            dropoff_lat = float(row_normalized.get('dropoff_lat', '0') or '0')
            dropoff_lon = float(row_normalized.get('dropoff_lon', '0') or '0')
        except (ValueError, TypeError):
            raise ValueError('Неверный формат координат (должны быть числа)')
        
        if not pickup_lat or not pickup_lon or not dropoff_lat or not dropoff_lon:
            raise ValueError('Не указаны координаты pickup или dropoff')
        
        # Адреса
        pickup_title = row_normalized.get('pickup_title', '').strip() or f'{pickup_lat}, {pickup_lon}'
        dropoff_title = row_normalized.get('dropoff_title', '').strip() or f'{dropoff_lat}, {dropoff_lon}'
        
        # Время забора
        desired_pickup_time_str = row_normalized.get('desired_pickup_time', '').strip()
        if desired_pickup_time_str:
            try:
                # Пытаемся распарсить через Django parse_datetime
                parsed = parse_datetime(desired_pickup_time_str)
                if parsed:
                    desired_pickup_time = parsed
                else:
                    # Если не удалось, пробуем ISO формат
                    if 'T' in desired_pickup_time_str:
                        desired_pickup_time = datetime.fromisoformat(desired_pickup_time_str.replace('Z', '+00:00'))
                        if timezone.is_naive(desired_pickup_time):
                            desired_pickup_time = timezone.make_aware(desired_pickup_time)
                    else:
                        # Только дата
                        from datetime import datetime as dt
                        date_part = dt.strptime(desired_pickup_time_str.split()[0], '%Y-%m-%d').date()
                        desired_pickup_time = timezone.make_aware(dt.combine(date_part, dt.min.time()))
            except Exception as e:
                raise ValueError(f'Неверный формат даты: {desired_pickup_time_str} ({str(e)})')
        else:
            desired_pickup_time = timezone.now()
        
        # Опциональные поля
        has_companion_str = row_normalized.get('has_companion', 'false').strip().lower()
        has_companion = has_companion_str in ('true', '1', 'yes', 'да')
        note = row_normalized.get('note', '').strip()
        
        # Начальный статус
        status_str = row_normalized.get('status', '').strip()
        if status_str and status_str in dict(OrderStatus.choices):
            initial_status = status_str
        else:
            initial_status = OrderStatus.CREATED
        
        return {
            'passenger': passenger.id,
            'pickup_title': pickup_title,
            'dropoff_title': dropoff_title,
            'pickup_lat': pickup_lat,
            'pickup_lon': pickup_lon,
            'dropoff_lat': dropoff_lat,
            'dropoff_lon': dropoff_lon,
            'desired_pickup_time': desired_pickup_time.isoformat(),
            'has_companion': has_companion,
            'note': note,
            'status': initial_status
        }
    
    @action(detail=False, methods=['post'], url_path='create-batch')
    def create_batch_orders(self, request):
        """
        Массовое создание заказов для пассажира.
        Принимает простой формат данных и автоматически создает пассажира и заказы.
        
        Формат запроса:
        {
            "passenger_phone": "775 970 36 64",
            "passenger_name": "Ахметова Бакытгуль",
            "orders": [
                {
                    "pickup_address": "Аксай 2, 11-я улица, 15",
                    "dropoff_address": "проспект Абулхаир Хана, 58",
                    "time": "8:20",
                    "has_companion": false
                },
                ...
            ]
        }
        
        Или можно передать просто список заказов, данные пассажира возьмутся из первого заказа.
        """
        from accounts.models import Passenger, User
        from regions.models import Region
        from regions.services import get_region_by_coordinates
        from .geocoding_service import geocode_order_addresses, geocode_address
        from django.contrib.auth.hashers import make_password
        import time as time_module
        
        # Поддерживаем разные форматы данных
        orders_data = None
        passenger_phone = None
        passenger_name = None
        passenger_disability_category = 'III группа'
        passenger_allowed_companion = False
        
        # Формат 1: объект с полем "orders"
        if isinstance(request.data, dict) and 'orders' in request.data:
            orders_data = request.data.get('orders', [])
            passenger_phone = request.data.get('passenger_phone')
            passenger_name = request.data.get('passenger_name')
            passenger_disability_category = request.data.get('passenger_disability_category', 'III группа')
            passenger_allowed_companion = request.data.get('passenger_allowed_companion', False)
        # Формат 2: просто массив заказов
        elif isinstance(request.data, list):
            orders_data = request.data
        # Формат 3: один заказ как объект
        elif isinstance(request.data, dict):
            orders_data = [request.data]
        else:
            return Response(
                {'error': 'Некорректный формат данных. Ожидается объект с полем "orders" или массив заказов'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not orders_data or len(orders_data) == 0:
            return Response(
                {'error': 'Список заказов пуст'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Извлекаем данные пассажира из первого заказа (если не указаны на верхнем уровне)
        first_order = orders_data[0]
        if not passenger_phone:
            passenger_phone = (
                first_order.get('passenger_phone') or
                first_order.get('phone') or
                first_order.get('телефон')
            )
        if not passenger_name:
            passenger_name = (
                first_order.get('passenger_name') or
                first_order.get('passenger') or
                first_order.get('name') or
                first_order.get('имя') or
                first_order.get('пассажир')
            )
        
        passenger_disability_category = (
            first_order.get('passenger_disability_category') or
            first_order.get('disability_category') or
            first_order.get('категория') or
            'III группа'
        )
        
        # Проверяем сопровождение (СОПР в таблице означает has_companion)
        passenger_allowed_companion = bool(
            first_order.get('passenger_allowed_companion') or
            first_order.get('has_companion') or
            first_order.get('companion') or
            first_order.get('сопр') or
            first_order.get('СОПР') or
            False
        )
        
        if not passenger_phone:
            return Response(
                {'error': 'Не указан телефон пассажира (passenger_phone)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Проверяем, существует ли пассажир
        passenger = None
        try:
            user = User.objects.get(phone=passenger_phone)
            if hasattr(user, 'passenger'):
                passenger = user.passenger
                logger.info(f'Найден существующий пассажир: {passenger.full_name}')
        except User.DoesNotExist:
            pass
        
        # Если пассажира нет, создаем его на основе первого заказа
        if not passenger:
            logger.info(f'Пассажир с телефоном {passenger_phone} не найден, создаем нового')
            
            # Геокодируем первый заказ, чтобы определить регион
            first_order_data = orders_data[0]
            first_pickup_address = (
                first_order_data.get('pickup_title') or 
                first_order_data.get('pickup_address') or
                first_order_data.get('pickup') or
                first_order_data.get('from')
            )
            first_pickup_lat = first_order_data.get('pickup_lat')
            first_pickup_lon = first_order_data.get('pickup_lon')
            
            # Геокодируем адрес отправления первого заказа, если координаты не указаны
            if (not first_pickup_lat or not first_pickup_lon) and first_pickup_address:
                logger.info(f'Геокодирование адреса первого заказа для определения региона: {first_pickup_address}')
                geocode_result = geocode_address(first_pickup_address)
                if geocode_result['status'] == 'ok':
                    first_pickup_lat = geocode_result['lat']
                    first_pickup_lon = geocode_result['lon']
                    logger.info(f'Адрес геокодирован: ({first_pickup_lat}, {first_pickup_lon})')
                    # Соблюдаем rate limit
                    time_module.sleep(1.0)
                else:
                    logger.warning(f'Не удалось геокодировать адрес первого заказа: {geocode_result.get("error", "Адрес не найден")}')
            
            # Определяем регион по координатам первого заказа
            region = None
            if first_pickup_lat and first_pickup_lon:
                try:
                    region = get_region_by_coordinates(first_pickup_lat, first_pickup_lon)
                    if region:
                        logger.info(f'Регион определен по координатам первого заказа: {region.id} ({region.title})')
                except Exception as e:
                    logger.warning(f'Ошибка определения региона по координатам: {e}')
            
            # Если регион не определен, используем первый доступный
            if not region:
                try:
                    region = Region.objects.first()
                    if region:
                        logger.warning(f'Использован первый доступный регион: {region.id} ({region.title})')
                except Exception as e:
                    logger.error(f'Ошибка получения региона из БД: {e}')
            
            if not region:
                logger.error('Не удалось определить регион для пассажира')
                return Response(
                    {'error': 'Не удалось определить регион для пассажира. Убедитесь, что в БД есть регионы.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Создаем пользователя
            username = f'passenger_{passenger_phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")}'
            try:
                user = User.objects.create(
                    username=username,
                    phone=passenger_phone,
                    role='passenger',
                    password=make_password(None)
                )
            except Exception as e:
                # Пользователь уже существует (race condition)
                logger.warning(f'Пользователь {passenger_phone} уже существует: {e}')
                user = User.objects.get(phone=passenger_phone)
            
            # Создаем пассажира
            full_name = passenger_name or f'Пассажир {passenger_phone}'
            try:
                passenger = Passenger.objects.create(
                    user=user,
                    full_name=full_name,
                    region=region,
                    disability_category=passenger_disability_category,
                    allowed_companion=passenger_allowed_companion
                )
                logger.info(f'Создан новый пассажир: {passenger.full_name} (регион: {region.title if region else "не указан"})')
            except Exception as e:
                logger.error(f'Ошибка создания пассажира: {e}', exc_info=True)
                return Response(
                    {'error': f'Ошибка создания пассажира: {str(e)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        # Создаем заказы
        created_orders = []
        errors = []
        
        for idx, order_data in enumerate(orders_data, start=1):
            try:
                # Подготовка данных заказа (поддерживаем разные форматы полей)
                pickup_address = (
                    order_data.get('pickup_title') or 
                    order_data.get('pickup_address') or
                    order_data.get('pickup') or
                    order_data.get('from') or
                    order_data.get('откуда')
                )
                dropoff_address = (
                    order_data.get('dropoff_title') or 
                    order_data.get('dropoff_address') or
                    order_data.get('dropoff') or
                    order_data.get('to') or
                    order_data.get('куда')
                )
                
                order_dict = {
                    'passenger_id': passenger.id,
                    'pickup_title': pickup_address,
                    'dropoff_title': dropoff_address,
                    'pickup_lat': order_data.get('pickup_lat'),
                    'pickup_lon': order_data.get('pickup_lon'),
                    'dropoff_lat': order_data.get('dropoff_lat'),
                    'dropoff_lon': order_data.get('dropoff_lon'),
                    'has_companion': (
                        order_data.get('has_companion') or 
                        order_data.get('companion') or
                        order_data.get('сопр') or
                        passenger_allowed_companion
                    ) if isinstance(order_data.get('has_companion'), bool) or order_data.get('companion') or order_data.get('сопр') else passenger_allowed_companion,
                    'note': order_data.get('note') or order_data.get('примечание') or '',
                }
                
                # Время забора (поддерживаем разные форматы)
                desired_pickup_time_str = (
                    order_data.get('desired_pickup_time') or 
                    order_data.get('time') or
                    order_data.get('время') or
                    order_data.get('pickup_time')
                )
                if desired_pickup_time_str:
                    # Пытаемся распарсить время
                    try:
                        if isinstance(desired_pickup_time_str, str):
                            if 'T' in desired_pickup_time_str:
                                desired_pickup_time = parse_datetime(desired_pickup_time_str)
                            elif ':' in desired_pickup_time_str and len(desired_pickup_time_str) <= 5:
                                # Формат "HH:MM"
                                from datetime import datetime, date
                                time_parts = desired_pickup_time_str.split(':')
                                hour = int(time_parts[0])
                                minute = int(time_parts[1])
                                today = date.today()
                                desired_pickup_time = timezone.make_aware(datetime.combine(today, datetime.min.time().replace(hour=hour, minute=minute)))
                            else:
                                desired_pickup_time = parse_datetime(desired_pickup_time_str)
                        else:
                            desired_pickup_time = timezone.now()
                        
                        if not desired_pickup_time:
                            desired_pickup_time = timezone.now()
                    except Exception as e:
                        logger.warning(f'Ошибка парсинга времени для заказа {idx}: {e}, используется текущее время')
                        desired_pickup_time = timezone.now()
                else:
                    desired_pickup_time = timezone.now()
                
                order_dict['desired_pickup_time'] = desired_pickup_time.isoformat()
                
                # Создаем заказ через сериализатор
                serializer = OrderSerializer(data=order_dict, context={'request': request})
                if serializer.is_valid():
                    order = serializer.save()
                    created_orders.append({
                        'id': order.id,
                        'pickup_title': order.pickup_title,
                        'dropoff_title': order.dropoff_title,
                    })
                    logger.info(f'Заказ {idx}/{len(orders_data)} создан: {order.id}')
                else:
                    raise ValueError(f"Валидация не пройдена: {serializer.errors}")
                    
            except Exception as e:
                error_msg = f'Ошибка создания заказа {idx}: {str(e)}'
                logger.error(error_msg, exc_info=True)
                errors.append({
                    'order_index': idx,
                    'message': str(e)
                })
        
        result = {
            'success': len(errors) == 0,
            'passenger': {
                'id': passenger.id,
                'name': passenger.full_name,
                'phone': passenger.user.phone,
                'region': passenger.region.title
            },
            'created_orders_count': len(created_orders),
            'total_orders': len(orders_data),
            'errors_count': len(errors),
            'orders': created_orders,
            'errors': errors
        }
        
        status_code = status.HTTP_201_CREATED if len(errors) == 0 else status.HTTP_207_MULTI_STATUS
        return Response(result, status=status_code)
    
    @action(detail=False, methods=['get'], url_path='export-by-drivers')
    def export_orders_by_drivers(self, request):
        """
        Экспорт заказов по водителям (отдельный CSV для каждого водителя)
        Возвращает ZIP архив с CSV файлами
        """
        # Проверяем права (только админы и диспетчеры)
        if not request.user.is_staff:
            return Response(
                {'error': 'Нет прав для экспорта заказов'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Фильтры
        status_filter = request.query_params.get('status')
        driver_id = request.query_params.get('driver_id')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        format_type = request.query_params.get('format', 'zip')  # 'zip' or 'json'
        
        # Получаем заказы
        queryset = Order.objects.filter(driver__isnull=False).select_related(
            'passenger', 'driver', 'passenger__user', 'driver__user'
        )
        
        # Фильтр по статусу
        if status_filter:
            statuses = [s.strip() for s in status_filter.split(',')]
            queryset = queryset.filter(status__in=statuses)
        
        # Фильтр по водителю
        if driver_id:
            queryset = queryset.filter(driver_id=int(driver_id))
        
        # Фильтр по дате
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)
        
        # Группируем по водителям
        drivers_orders = {}
        for order in queryset:
            if order.driver:
                driver_id = order.driver.id
                if driver_id not in drivers_orders:
                    drivers_orders[driver_id] = {
                        'driver': order.driver,
                        'orders': []
                    }
                drivers_orders[driver_id]['orders'].append(order)
        
        if format_type == 'json':
            # JSON формат
            result = {}
            for driver_id, data in drivers_orders.items():
                driver = data['driver']
                orders = data['orders']
                result[driver_id] = {
                    'driver_id': driver.id,
                    'driver_name': driver.name,
                    'driver_phone': driver.user.phone if driver.user else None,
                    'orders_count': len(orders),
                    'orders': [OrderSerializer(order).data for order in orders]
                }
            return Response(result)
        
        # ZIP формат с CSV файлами
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for driver_id, data in drivers_orders.items():
                driver = data['driver']
                orders = data['orders']
                
                # Создаем CSV для водителя
                csv_buffer = io.StringIO()
                csv_buffer.write('\ufeff')  # BOM для UTF-8
                writer = csv.writer(csv_buffer)
                
                # Заголовки
                writer.writerow([
                    'order_id',
                    'passenger_name',
                    'passenger_phone',
                    'pickup_title',
                    'pickup_lat',
                    'pickup_lon',
                    'dropoff_title',
                    'dropoff_lat',
                    'dropoff_lon',
                    'desired_pickup_time',
                    'status',
                    'assigned_at',
                    'has_companion',
                    'distance_km',
                    'estimated_price',
                    'final_price'
                ])
                
                # Данные
                for order in orders:
                    writer.writerow([
                        order.id,
                        order.passenger.full_name if order.passenger else '',
                        order.passenger.user.phone if order.passenger and order.passenger.user else '',
                        order.pickup_title,
                        order.pickup_lat,
                        order.pickup_lon,
                        order.dropoff_title,
                        order.dropoff_lat,
                        order.dropoff_lon,
                        order.desired_pickup_time.isoformat() if order.desired_pickup_time else '',
                        order.status,
                        order.assigned_at.isoformat() if order.assigned_at else '',
                        'Да' if order.has_companion else 'Нет',
                        order.distance_km or '',
                        float(order.estimated_price) if order.estimated_price else '',
                        float(order.final_price) if order.final_price else ''
                    ])
                
                # Добавляем в ZIP
                filename = f'orders_driver_{driver.id}_{driver.name.replace(" ", "_")}.csv'
                zip_file.writestr(filename, csv_buffer.getvalue().encode('utf-8'))
        
        zip_buffer.seek(0)
        
        # Создаем HTTP ответ
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        response = HttpResponse(zip_buffer.read(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="orders_export_{timestamp}.zip"'
        return response

    @action(detail=False, methods=['post'], url_path='geocode')
    def geocode_address(self, request):
        """Геокодировать адрес через Nominatim API"""
        try:
            address = request.data.get('address')
            
            # Проверяем, что адрес передан и это строка
            if not address:
                return Response(
                    {'error': 'Адрес не указан'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Преобразуем в строку, если это не строка
            if not isinstance(address, str):
                address = str(address)
            
            # Убираем пробелы
            address = address.strip()
            
            if not address:
                return Response(
                    {'error': 'Адрес не может быть пустым'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            from .geocoding_service import geocode_address_with_fallback
            result = geocode_address_with_fallback(address)
            
            if result['status'] == 'ok':
                return Response({
                    'status': 'ok',
                    'lat': result['lat'],
                    'lon': result['lon'],
                    'display_name': result.get('display_name')
                })
            else:
                return Response({
                    'status': result['status'],
                    'error': result.get('error', 'Адрес не найден')
                }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f'Ошибка при геокодировании адреса: {str(e)}', exc_info=True)
            return Response(
                {'error': f'Ошибка при геокодировании: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

