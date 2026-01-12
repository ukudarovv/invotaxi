from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from django.contrib.auth import get_user_model
from .models import Passenger, Driver
from .serializers import PassengerSerializer, DriverSerializer, PhoneLoginSerializer, VerifyOTPSerializer, UserSerializer
from .services import OTPService, UserService
from orders.models import Order, OrderStatus, OrderOffer
from orders.serializers import OrderSerializer
from dispatch.services import DispatchEngine
from regions.models import Region

User = get_user_model()


class MobileAuthViewSet(viewsets.ViewSet):
    """Мобильные endpoint'ы для авторизации и регистрации"""
    permission_classes = [AllowAny]

    @action(detail=False, methods=['post'], url_path='phone-login')
    def phone_login(self, request):
        """Запрос OTP кода для авторизации/регистрации"""
        serializer = PhoneLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone = serializer.validated_data['phone']
        otp = OTPService.create_otp(phone)

        return Response({
            'message': 'OTP код отправлен',
            'expires_at': otp.expires_at.isoformat(),
            'expires_in_seconds': int((otp.expires_at - timezone.now()).total_seconds())
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='verify-otp')
    def verify_otp(self, request):
        """Проверка OTP и выдача токена (авторизация/регистрация)"""
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone = serializer.validated_data['phone']
        code = serializer.validated_data['code']

        is_valid, otp = OTPService.verify_otp(phone, code)

        if not is_valid:
            return Response(
                {'error': 'Неверный или истекший код'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Получаем или создаем пользователя
        user, created = OTPService.get_or_create_user(phone)

        # Генерируем JWT токены
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)

        # Определяем роль и дополнительные данные
        role = UserService.get_user_role(user)
        response_data = {
            'access': access_token,
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
            'role': role,
            'is_new_user': created,
            'has_profile': False,
        }

        # Добавляем данные пассажира или водителя если профиль существует
        if role == 'passenger' and hasattr(user, 'passenger'):
            response_data['passenger'] = PassengerSerializer(user.passenger).data
            response_data['passenger_id'] = user.passenger.id
            response_data['has_profile'] = True
        elif role == 'driver' and hasattr(user, 'driver'):
            response_data['driver'] = DriverSerializer(user.driver).data
            response_data['driver_id'] = user.driver.id
            response_data['has_profile'] = True

        return Response(response_data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='register-passenger', permission_classes=[IsAuthenticated])
    def register_passenger(self, request):
        """Регистрация профиля пассажира (после авторизации)"""
        user = request.user

        # Проверяем, что пользователь еще не имеет профиля пассажира
        if hasattr(user, 'passenger'):
            return Response(
                {'error': 'Профиль пассажира уже существует'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Проверяем, что пользователь не является водителем
        if hasattr(user, 'driver'):
            return Response(
                {'error': 'Пользователь уже зарегистрирован как водитель'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Валидация данных
        full_name = request.data.get('full_name')
        region_id = request.data.get('region_id')
        disability_category = request.data.get('disability_category')
        allowed_companion = request.data.get('allowed_companion', False)

        if not full_name:
            return Response(
                {'error': 'Требуется полное имя'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not region_id:
            return Response(
                {'error': 'Требуется регион'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not disability_category:
            return Response(
                {'error': 'Требуется категория инвалидности'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Проверяем валидность категории инвалидности
        valid_categories = ['I группа', 'II группа', 'III группа', 'Ребенок-инвалид']
        if disability_category not in valid_categories:
            return Response(
                {'error': f'Неверная категория инвалидности. Допустимые: {", ".join(valid_categories)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Получаем регион
        try:
            region = Region.objects.get(id=region_id)
        except Region.DoesNotExist:
            return Response(
                {'error': 'Регион не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Создаем профиль пассажира
        try:
            passenger = Passenger.objects.create(
                user=user,
                full_name=full_name,
                region=region,
                disability_category=disability_category,
                allowed_companion=allowed_companion
            )

            # Обновляем роль пользователя
            user.role = 'passenger'
            user.save(update_fields=['role'])

            serializer = PassengerSerializer(passenger)
            return Response({
                'success': True,
                'message': 'Профиль пассажира успешно создан',
                'passenger': serializer.data
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response(
                {'error': f'Ошибка создания профиля: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'], url_path='refresh-token')
    def refresh_token(self, request):
        """Обновление access токена"""
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'error': 'Требуется refresh токен'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            refresh = RefreshToken(refresh_token)
            access_token = str(refresh.access_token)
            return Response({
                'access': access_token,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': 'Неверный или истекший refresh токен'},
                status=status.HTTP_401_UNAUTHORIZED
            )

    @action(detail=False, methods=['post'], url_path='logout', permission_classes=[IsAuthenticated])
    def logout(self, request):
        """Выход из системы"""
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass

        return Response({'message': 'Выход выполнен'}, status=status.HTTP_200_OK)


class MobilePassengerViewSet(viewsets.ViewSet):
    """Мобильные endpoint'ы для пассажиров"""
    permission_classes = [IsAuthenticated]

    def get_passenger(self):
        """Получить пассажира из текущего пользователя"""
        if not hasattr(self.request.user, 'passenger'):
            raise PermissionDenied('Пользователь не является пассажиром')
        return self.request.user.passenger

    @action(detail=False, methods=['get'], url_path='profile')
    def get_profile(self, request):
        """Получить профиль пассажира"""
        try:
            passenger = self.get_passenger()
            serializer = PassengerSerializer(passenger)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['patch'], url_path='profile')
    def update_profile(self, request):
        """Обновить профиль пассажира"""
        try:
            passenger = self.get_passenger()
            serializer = PassengerSerializer(passenger, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='orders')
    def get_orders(self, request):
        """Получить список заказов пассажира"""
        try:
            passenger = self.get_passenger()
            
            # Фильтры
            status_filter = request.query_params.get('status')
            limit = int(request.query_params.get('limit', 20))
            
            queryset = Order.objects.filter(passenger=passenger).select_related(
                'driver', 'driver__user', 'passenger__user'
            ).order_by('-created_at')
            
            if status_filter:
                statuses = [s.strip() for s in status_filter.split(',')]
                queryset = queryset.filter(status__in=statuses)
            
            orders = queryset[:limit]
            serializer = OrderSerializer(orders, many=True)
            return Response({
                'count': len(orders),
                'results': serializer.data
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='active-order')
    def get_active_order(self, request):
        """Получить активный заказ пассажира"""
        try:
            passenger = self.get_passenger()
            
            # Активные статусы заказа
            active_statuses = [
                OrderStatus.SUBMITTED,
                OrderStatus.AWAITING_DISPATCHER_DECISION,
                OrderStatus.CREATED,
                OrderStatus.MATCHING,
                OrderStatus.ACTIVE_QUEUE,
                OrderStatus.OFFERED,
                OrderStatus.ASSIGNED,
                OrderStatus.DRIVER_EN_ROUTE,
                OrderStatus.ARRIVED_WAITING,
                OrderStatus.RIDE_ONGOING,
            ]
            
            order = Order.objects.filter(
                passenger=passenger,
                status__in=active_statuses
            ).select_related(
                'driver', 'driver__user', 'passenger__user'
            ).order_by('-created_at').first()
            
            if not order:
                return Response({
                    'has_active_order': False,
                    'order': None
                })
            
            serializer = OrderSerializer(order)
            
            # Добавляем дополнительную информацию для мобильного приложения
            response_data = serializer.data
            response_data['has_active_order'] = True
            
            # Если есть водитель, добавляем его позицию и ETA
            if order.driver and order.driver.current_lat and order.driver.current_lon:
                response_data['driver_position'] = {
                    'lat': order.driver.current_lat,
                    'lon': order.driver.current_lon,
                    'last_update': order.driver.last_location_update.isoformat() if order.driver.last_location_update else None
                }
                
                # Рассчитываем ETA если водитель в пути
                if order.status in [OrderStatus.DRIVER_EN_ROUTE, OrderStatus.ASSIGNED]:
                    try:
                        engine = DispatchEngine()
                        eta_data = engine.calculate_eta(order.driver, order)
                        if eta_data:
                            response_data['eta'] = {
                                'seconds': eta_data.get('eta_seconds'),
                                'distance_km': eta_data.get('distance_km'),
                                'formatted': eta_data.get('eta_formatted')
                            }
                    except Exception:
                        pass
            
            return Response(response_data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='order/(?P<order_id>[^/.]+)')
    def get_order(self, request, order_id=None):
        """Получить детали конкретного заказа"""
        try:
            passenger = self.get_passenger()
            
            try:
                order = Order.objects.get(id=order_id, passenger=passenger)
            except Order.DoesNotExist:
                return Response(
                    {'error': 'Заказ не найден'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            serializer = OrderSerializer(order)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class MobileDriverViewSet(viewsets.ViewSet):
    """Мобильные endpoint'ы для водителей"""
    permission_classes = [IsAuthenticated]

    def get_driver(self):
        """Получить водителя из текущего пользователя"""
        if not hasattr(self.request.user, 'driver'):
            raise PermissionDenied('Пользователь не является водителем')
        return self.request.user.driver

    @action(detail=False, methods=['get'], url_path='profile')
    def get_profile(self, request):
        """Получить профиль водителя"""
        try:
            driver = self.get_driver()
            serializer = DriverSerializer(driver)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['patch'], url_path='profile')
    def update_profile(self, request):
        """Обновить профиль водителя"""
        try:
            driver = self.get_driver()
            serializer = DriverSerializer(driver, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['patch'], url_path='location')
    def update_location(self, request):
        """Обновить позицию водителя"""
        try:
            driver = self.get_driver()
            
            lat = request.data.get('lat')
            lon = request.data.get('lon')
            
            if lat is None or lon is None:
                return Response(
                    {'error': 'Требуются lat и lon'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Валидация координат
            try:
                lat = float(lat)
                lon = float(lon)
                
                if not (-90 <= lat <= 90):
                    return Response(
                        {'error': 'Широта должна быть в диапазоне от -90 до 90'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                if not (-180 <= lon <= 180):
                    return Response(
                        {'error': 'Долгота должна быть в диапазоне от -180 до 180'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except (ValueError, TypeError):
                return Response(
                    {'error': 'Неверный формат координат'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            driver.current_lat = lat
            driver.current_lon = lon
            driver.last_location_update = timezone.now()
            driver.save(update_fields=['current_lat', 'current_lon', 'last_location_update'])
            
            serializer = DriverSerializer(driver)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['patch'], url_path='online-status')
    def update_online_status(self, request):
        """Обновить онлайн статус водителя"""
        try:
            driver = self.get_driver()
            
            is_online = request.data.get('is_online')
            if is_online is None:
                return Response(
                    {'error': 'Требуется is_online'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            from accounts.models import DriverStatus
            
            driver.is_online = bool(is_online)
            
            if driver.is_online:
                if driver.status == DriverStatus.OFFLINE or driver.status is None:
                    driver.status = DriverStatus.ONLINE_IDLE
                    driver.idle_since = timezone.now()
            else:
                driver.status = DriverStatus.OFFLINE
                driver.idle_since = None
            
            driver.save(update_fields=['is_online', 'status', 'idle_since'])
            
            serializer = DriverSerializer(driver)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='offers')
    def get_offers(self, request):
        """Получить список предложений заказов для водителя"""
        try:
            driver = self.get_driver()
            
            # Получаем активные предложения
            offers = OrderOffer.objects.filter(
                driver=driver,
                status='pending',
                expires_at__gt=timezone.now()
            ).select_related(
                'order', 'order__passenger', 'order__passenger__user'
            ).order_by('-created_at')
            
            offers_data = []
            for offer in offers:
                order = offer.order
                offers_data.append({
                    'offer_id': offer.id,
                    'order_id': order.id,
                    'pickup_title': order.pickup_title,
                    'dropoff_title': order.dropoff_title,
                    'pickup_lat': order.pickup_lat,
                    'pickup_lon': order.pickup_lon,
                    'dropoff_lat': order.dropoff_lat,
                    'dropoff_lon': order.dropoff_lon,
                    'desired_pickup_time': order.desired_pickup_time.isoformat() if order.desired_pickup_time else None,
                    'has_companion': order.has_companion,
                    'distance_km': offer.distance_km,
                    'eta_seconds': offer.eta_seconds,
                    'cost_score': offer.cost_score,
                    'created_at': offer.created_at.isoformat(),
                    'expires_at': offer.expires_at.isoformat(),
                    'expires_in_seconds': int((offer.expires_at - timezone.now()).total_seconds()),
                    'passenger': {
                        'id': order.passenger.id,
                        'full_name': order.passenger.full_name,
                        'disability_category': order.passenger.disability_category,
                    } if order.passenger else None,
                })
            
            return Response({
                'count': len(offers_data),
                'results': offers_data
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'], url_path='offer/(?P<offer_id>[^/.]+)/accept')
    def accept_offer(self, request, offer_id=None):
        """Принять предложение заказа"""
        try:
            driver = self.get_driver()
            
            try:
                offer = OrderOffer.objects.get(id=offer_id, driver=driver)
            except OrderOffer.DoesNotExist:
                return Response(
                    {'error': 'Предложение не найдено'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Проверяем, что оффер еще активен
            if offer.status != 'pending':
                return Response(
                    {'error': 'Предложение уже обработано'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if offer.is_expired:
                return Response(
                    {'error': 'Предложение истекло'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Используем MatchingService для обработки принятия
            from dispatch.matching_service import MatchingService
            matching_service = MatchingService()
            result = matching_service.handle_offer_accepted(offer)
            
            if result.get('success'):
                return Response(result, status=status.HTTP_200_OK)
            else:
                return Response(result, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'], url_path='offer/(?P<offer_id>[^/.]+)/decline')
    def decline_offer(self, request, offer_id=None):
        """Отклонить предложение заказа"""
        try:
            driver = self.get_driver()
            
            try:
                offer = OrderOffer.objects.get(id=offer_id, driver=driver)
            except OrderOffer.DoesNotExist:
                return Response(
                    {'error': 'Предложение не найдено'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Используем MatchingService для обработки отклонения
            from dispatch.matching_service import MatchingService
            matching_service = MatchingService()
            result = matching_service.handle_offer_declined(offer)
            
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='orders')
    def get_orders(self, request):
        """Получить список заказов водителя"""
        try:
            driver = self.get_driver()
            
            # Фильтры
            status_filter = request.query_params.get('status')
            limit = int(request.query_params.get('limit', 20))
            
            queryset = Order.objects.filter(driver=driver).select_related(
                'passenger', 'passenger__user'
            ).order_by('-created_at')
            
            if status_filter:
                statuses = [s.strip() for s in status_filter.split(',')]
                queryset = queryset.filter(status__in=statuses)
            
            orders = queryset[:limit]
            serializer = OrderSerializer(orders, many=True)
            return Response({
                'count': len(orders),
                'results': serializer.data
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='active-order')
    def get_active_order(self, request):
        """Получить активный заказ водителя"""
        try:
            driver = self.get_driver()
            
            # Активные статусы заказа
            active_statuses = [
                OrderStatus.ASSIGNED,
                OrderStatus.DRIVER_EN_ROUTE,
                OrderStatus.ARRIVED_WAITING,
                OrderStatus.RIDE_ONGOING,
            ]
            
            order = Order.objects.filter(
                driver=driver,
                status__in=active_statuses
            ).select_related(
                'passenger', 'passenger__user'
            ).order_by('-created_at').first()
            
            if not order:
                return Response({
                    'has_active_order': False,
                    'order': None
                })
            
            serializer = OrderSerializer(order)
            
            # Добавляем дополнительную информацию для мобильного приложения
            response_data = serializer.data
            response_data['has_active_order'] = True
            
            # Добавляем маршрут если нужно
            if order.status in [OrderStatus.DRIVER_EN_ROUTE, OrderStatus.ASSIGNED]:
                try:
                    engine = DispatchEngine()
                    route_data = engine.calculate_driver_route(driver, order)
                    if route_data:
                        response_data['route_to_pickup'] = {
                            'distance_km': route_data.get('distance_km'),
                            'duration_minutes': route_data.get('duration_minutes'),
                            'eta': route_data.get('eta').isoformat() if route_data.get('eta') else None,
                        }
                except Exception:
                    pass
            
            # Если поездка началась, добавляем маршрут поездки
            if order.status == OrderStatus.RIDE_ONGOING:
                try:
                    engine = DispatchEngine()
                    route_data = engine.calculate_order_route(order)
                    if route_data:
                        response_data['route'] = {
                            'distance_km': route_data.get('distance_km'),
                            'duration_minutes': route_data.get('duration_minutes'),
                            'eta': route_data.get('eta').isoformat() if route_data.get('eta') else None,
                        }
                except Exception:
                    pass
            
            return Response(response_data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='order/(?P<order_id>[^/.]+)')
    def get_order(self, request, order_id=None):
        """Получить детали конкретного заказа"""
        try:
            driver = self.get_driver()
            
            try:
                order = Order.objects.get(id=order_id, driver=driver)
            except Order.DoesNotExist:
                return Response(
                    {'error': 'Заказ не найден'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            serializer = OrderSerializer(order)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='statistics')
    def get_statistics(self, request):
        """Получить статистику водителя"""
        try:
            driver = self.get_driver()
            
            # Статистика за сегодня
            today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            
            today_orders = Order.objects.filter(
                driver=driver,
                completed_at__gte=today_start,
                status=OrderStatus.COMPLETED
            )
            
            total_orders = Order.objects.filter(
                driver=driver,
                status=OrderStatus.COMPLETED
            ).count()
            
            # Статистика из DriverStatistics если есть
            stats_data = {
                'total_completed_orders': total_orders,
                'today_completed_orders': today_orders.count(),
                'rating': driver.rating,
                'is_online': driver.is_online,
                'status': driver.status,
            }
            
            if hasattr(driver, 'statistics'):
                stats = driver.statistics
                stats_data.update({
                    'acceptance_rate': stats.acceptance_rate,
                    'cancel_rate': stats.cancel_rate,
                    'offers_last_60min': stats.offers_last_60min,
                    'orders_last_60min': stats.orders_last_60min,
                })
            
            return Response(stats_data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
