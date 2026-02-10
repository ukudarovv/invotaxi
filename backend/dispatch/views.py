from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
import logging
from orders.models import Order, OrderStatus, OrderOffer
from orders.services import OrderService
from orders.serializers import OrderSerializer
from accounts.models import Driver
from accounts.serializers import DriverSerializer
from .services import DispatchEngine
from .matching_service import MatchingService

logger = logging.getLogger(__name__)


class DispatchViewSet(viewsets.ViewSet):
    """ViewSet для диспетчеризации"""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['post'], url_path='assign/(?P<order_id>[^/.]+)')
    def assign_order(self, request, order_id=None):
        """Назначение заказа водителю"""
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            order = Order.objects.get(id=order_id)
            logger.info(f'Назначение заказа {order_id}: текущий статус = {order.status}, driver_id = {request.data.get("driver_id")}')
        except Order.DoesNotExist:
            logger.error(f'Заказ {order_id} не найден')
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Проверяем права доступа (только админы или диспетчеры)
        user = request.user
        if not user.is_staff and not hasattr(user, 'driver'):
            logger.warning(f'Пользователь {user.id} не имеет прав для назначения заказов')
            return Response(
                {'error': 'Нет прав для назначения заказов'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Получаем driver_id из запроса, если указан
        driver_id = request.data.get('driver_id')
        logger.info(f'Назначение заказа {order_id}: driver_id = {driver_id}, текущий статус = {order.status}')
        
        # Проверяем статус заказа и автоматически переводим в active_queue если нужно
        if order.status != OrderStatus.ACTIVE_QUEUE:
            # Автоматически переводим в очередь, если заказ в подходящем статусе
            # Проверяем, можно ли перевести в active_queue согласно валидации переходов
            valid_statuses_for_queue = [
                OrderStatus.SUBMITTED,
                OrderStatus.AWAITING_DISPATCHER_DECISION,
                OrderStatus.MATCHING,
                OrderStatus.CANCELLED,  # Можно восстановить отмененный заказ
                OrderStatus.ASSIGNED,  # Может быть переназначен (через MATCHING)
            ]
            
            # Проверяем, можно ли перевести в active_queue
            can_transition_to_queue = False
            if order.status in valid_statuses_for_queue:
                # Дополнительно проверяем через валидацию переходов
                if OrderService.validate_status_transition(order.status, OrderStatus.ACTIVE_QUEUE):
                    can_transition_to_queue = True
                elif order.status == OrderStatus.ASSIGNED:
                    # Для ASSIGNED сначала переводим в MATCHING, затем в ACTIVE_QUEUE
                    if OrderService.validate_status_transition(order.status, OrderStatus.MATCHING):
                        OrderService.update_status(order, OrderStatus.MATCHING, 'Перевод в поиск для переназначения', user)
                        order.refresh_from_db()
                        can_transition_to_queue = True
            
            if can_transition_to_queue:
                # Очищаем водителя при переводе в очередь для нового назначения
                if order.driver_id:
                    order.driver = None
                    order.driver_id = None
                    order.assignment_reason = None
                OrderService.update_status(order, OrderStatus.ACTIVE_QUEUE, 'Автоматический перевод в очередь для назначения водителя', user)
                order.refresh_from_db()
            else:
                # Получаем допустимые переходы для информативного сообщения
                valid_transitions = OrderService.get_valid_transitions(order.status)
                
                # Формируем понятное сообщение в зависимости от статуса
                if order.status == OrderStatus.COMPLETED:
                    error_message = 'Нельзя назначить водителя на завершенный заказ. Заказ уже выполнен.'
                elif order.status == OrderStatus.CANCELLED:
                    error_message = 'Нельзя назначить водителя на отмененный заказ. Сначала восстановите заказ.'
                else:
                    error_message = f'Заказ должен быть в статусе {OrderStatus.ACTIVE_QUEUE} для назначения. Текущий статус: {order.status}'
                
                logger.warning(
                    f'Не удалось перевести заказ {order_id} в очередь: '
                    f'текущий статус = {order.status}, допустимые переходы = {valid_transitions}'
                )
                
                response_data = {
                    'success': False,
                    'error': error_message,
                    'current_status': order.status,
                    'order_id': order_id
                }
                
                if valid_transitions:
                    response_data['valid_transitions'] = valid_transitions
                    response_data['suggestion'] = 'Сначала переведите заказ в один из допустимых статусов'
                elif order.status == OrderStatus.COMPLETED:
                    response_data['suggestion'] = 'Завершенный заказ нельзя изменить. Создайте новый заказ.'
                elif order.status == OrderStatus.CANCELLED:
                    response_data['suggestion'] = 'Отмененный заказ можно восстановить, переведя его в статус submitted или active_queue'
                
                return Response(
                    response_data,
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Назначаем заказ
        engine = DispatchEngine()
        
        # Если указан конкретный водитель, используем его
        if driver_id:
            from accounts.models import Driver
            try:
                # Пробуем найти водителя (сначала без проверки онлайн статуса)
                try:
                    driver = Driver.objects.get(id=int(driver_id))
                except (Driver.DoesNotExist, ValueError) as e:
                    logger.error(f'Водитель с ID {driver_id} не найден: {str(e)}')
                    return Response(
                        {
                            'success': False,
                            'error': f'Водитель с ID {driver_id} не найден',
                            'driver_id': driver_id
                        },
                        status=status.HTTP_404_NOT_FOUND
                    )
                
                # Проверяем онлайн статус
                if not driver.is_online:
                    logger.warning(f'Водитель {driver.id} ({driver.name}) не онлайн')
                    return Response(
                        {
                            'success': False,
                            'error': f'Водитель {driver.name} не онлайн. Включите онлайн статус для назначения заказов.',
                            'driver_id': driver.id,
                            'driver_name': driver.name,
                            'is_online': driver.is_online
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Проверяем, что водитель подходит для заказа
                if driver.capacity < order.seats_needed:
                    logger.warning(
                        f'Водитель {driver.id} не подходит для заказа {order.id}: '
                        f'вместимость {driver.capacity} < требуется {order.seats_needed}'
                    )
                    return Response(
                        {
                            'success': False,
                            'error': f'Водитель {driver.name} не подходит: недостаточная вместимость (есть {driver.capacity}, требуется {order.seats_needed})',
                            'driver_id': driver.id,
                            'driver_capacity': driver.capacity,
                            'required_seats': order.seats_needed
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Проверяем статус водителя (не должен быть занят)
                from accounts.models import DriverStatus
                if hasattr(driver, 'status') and driver.status in [
                    DriverStatus.ON_TRIP,
                    DriverStatus.ENROUTE_TO_PICKUP,
                    DriverStatus.OFFERED
                ]:
                    logger.warning(f'Водитель {driver.id} занят (статус: {driver.status})')
                    return Response(
                        {
                            'success': False,
                            'error': f'Водитель {driver.name} занят (статус: {driver.status})',
                            'driver_id': driver.id,
                            'driver_status': driver.status
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Назначаем указанного водителя
                logger.info(f'Назначаем водителя {driver.id} ({driver.name}) на заказ {order.id}')
                # Важно: сначала устанавливаем driver_id, затем driver для правильной работы Django ORM
                order.driver_id = driver.id
                order.driver = driver
                order.assignment_reason = f'Назначен водитель {driver.name} вручную'
                OrderService.update_status(order, OrderStatus.ASSIGNED, order.assignment_reason, user)
                
                # Обновляем статус водителя
                driver.status = DriverStatus.ENROUTE_TO_PICKUP
                driver.idle_since = None
                driver.save(update_fields=['status', 'idle_since'])
                
                logger.info(f'Заказ {order.id} успешно назначен водителю {driver.id}')
                
                return Response({
                    'success': True,
                    'driver_id': str(driver.id),
                    'reason': order.assignment_reason,
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
            except Exception as e:
                logger.error(f'Ошибка при назначении водителя {driver_id} на заказ {order_id}: {str(e)}', exc_info=True)
                return Response(
                    {
                        'success': False,
                        'error': f'Ошибка назначения водителя: {str(e)}',
                        'driver_id': driver_id,
                        'order_id': order_id
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        # Иначе используем автоматический алгоритм
        result = engine.assign_order(order)

        if result.driver_id:
            # Обновляем заказ
            from accounts.models import Driver
            try:
                # Преобразуем driver_id в int, если это строка
                driver_id = int(result.driver_id) if isinstance(result.driver_id, str) else result.driver_id
                driver = Driver.objects.get(id=driver_id)
                
                # Устанавливаем водителя и причину назначения
                # Важно: сначала устанавливаем driver_id, затем driver для правильной работы Django ORM
                order.driver_id = driver.id
                order.driver = driver
                order.assignment_reason = result.reason
                
                # Сохраняем заказ с обновленным статусом, водителем и причиной
                OrderService.update_status(order, OrderStatus.ASSIGNED, result.reason, user)
                
                # Обновляем статус водителя на ENROUTE_TO_PICKUP
                from accounts.models import DriverStatus
                if hasattr(driver, 'status'):
                    driver.status = DriverStatus.ENROUTE_TO_PICKUP
                    driver.idle_since = None
                    driver.save(update_fields=['status', 'idle_since'])
                
                # Обновляем заказ из БД для проверки
                order.refresh_from_db()
                
                # Проверяем, что водитель действительно сохранен
                if not order.driver_id or str(order.driver_id) != str(driver.id):
                    logger.error(f'Водитель не был сохранен в заказе {order.id}. Ожидался ID {driver.id}, получен {order.driver_id}')
                    return Response({
                        'success': False,
                        'reason': 'Ошибка сохранения водителя в заказе',
                        'rejection_reason': f'Водитель не был сохранен в заказе. Ожидался ID {driver.id}, получен {order.driver_id}'
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
                return Response({
                    'success': True,
                    'driver_id': str(driver.id),
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
            except (Driver.DoesNotExist, ValueError) as e:
                logger.error(f'Ошибка при назначении водителя: {str(e)}')
                return Response(
                    {'error': f'Водитель не найден: {str(e)}'},
                    status=status.HTTP_404_NOT_FOUND
                )
            except Exception as e:
                import traceback
                logger.error(f'Неожиданная ошибка при назначении водителя: {str(e)}')
                logger.error(traceback.format_exc())
                return Response({
                    'success': False,
                    'reason': f'Ошибка назначения водителя: {str(e)}',
                    'rejection_reason': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
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

    @action(detail=False, methods=['post'], url_path='auto-assign-all')
    def auto_assign_all(self, request):
        """Массовое автоматическое назначение всех заказов в очереди"""
        # Проверяем права доступа (только админы)
        user = request.user
        if not user.is_staff:
            return Response(
                {'error': 'Нет прав для массового назначения заказов'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Получаем все заказы в очереди
        queue_orders = Order.objects.filter(status=OrderStatus.ACTIVE_QUEUE)
        
        if not queue_orders.exists():
            return Response({
                'success': True,
                'assigned': 0,
                'failed': 0,
                'message': 'Нет заказов в очереди'
            })

        engine = DispatchEngine()
        assigned_count = 0
        failed_count = 0
        failed_orders = []

        for order in queue_orders:
            try:
                # Обновляем заказ из БД перед обработкой
                order.refresh_from_db()
                
                result = engine.assign_order(order)
                if result.driver_id:
                    from accounts.models import Driver
                    try:
                        driver = Driver.objects.get(id=result.driver_id)
                        
                        # Проверяем, что водитель все еще доступен
                        if not driver.is_online:
                            failed_count += 1
                            failed_orders.append({
                                'order_id': order.id,
                                'reason': f'Водитель {driver.name} больше не онлайн'
                            })
                            continue
                        
                        # Проверяем статус водителя
                        from accounts.models import DriverStatus
                        if hasattr(driver, 'status') and driver.status in [
                            DriverStatus.ON_TRIP, 
                            DriverStatus.ENROUTE_TO_PICKUP,
                            DriverStatus.OFFERED
                        ]:
                            failed_count += 1
                            failed_orders.append({
                                'order_id': order.id,
                                'reason': f'Водитель {driver.name} занят (статус: {driver.status})'
                            })
                            continue
                        
                        # Назначаем водителя
                        # Важно: сначала устанавливаем driver_id, затем driver для правильной работы Django ORM
                        order.driver_id = driver.id
                        order.driver = driver
                        order.assignment_reason = result.reason
                        
                        # Обновляем статус водителя
                        driver.status = DriverStatus.ENROUTE_TO_PICKUP
                        driver.idle_since = None
                        driver.save(update_fields=['status', 'idle_since'])
                        
                        # Обновляем статус заказа (update_status теперь сохранит driver и assignment_reason)
                        OrderService.update_status(order, OrderStatus.ASSIGNED, result.reason, user)
                        
                        # Перезагружаем заказ из БД для проверки
                        order.refresh_from_db()
                        
                        # Проверяем, что водитель действительно сохранен
                        if not order.driver_id or str(order.driver_id) != str(driver.id):
                            raise Exception(f'Водитель не был сохранен в заказе. Ожидался ID {driver.id}, получен {order.driver_id}')
                        
                        assigned_count += 1
                    except Driver.DoesNotExist:
                        failed_count += 1
                        failed_orders.append({
                            'order_id': order.id,
                            'reason': f'Водитель с ID {result.driver_id} не найден'
                        })
                else:
                    failed_count += 1
                    failed_orders.append({
                        'order_id': order.id,
                        'reason': result.reason or 'Не удалось назначить водителя'
                    })
            except Exception as e:
                import traceback
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f'Ошибка при назначении заказа {order.id}: {str(e)}')
                logger.error(traceback.format_exc())
                
                failed_count += 1
                failed_orders.append({
                    'order_id': order.id,
                    'reason': f'Ошибка: {str(e)}'
                })

        return Response({
            'success': True,
            'assigned': assigned_count,
            'failed': failed_count,
            'total': queue_orders.count(),
            'failed_orders': failed_orders,
            'message': f'Обработано заказов: {queue_orders.count()}, назначено: {assigned_count}, ошибок: {failed_count}'
        })

    @action(detail=False, methods=['get'], url_path='map-data')
    def map_data(self, request):
        """Получить данные для карты диспетчеризации: водители и активные заказы"""
        # Проверяем права доступа
        user = request.user
        if not user.is_staff:
            return Response(
                {'error': 'Нет прав'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Получаем всех водителей с локациями
        drivers = Driver.objects.select_related('user', 'region').all()
        drivers_data = []
        for driver in drivers:
            driver_data = DriverSerializer(driver).data
            # Добавляем только если есть локация
            if driver.current_lat is not None and driver.current_lon is not None:
                drivers_data.append({
                    'id': str(driver.id),
                    'name': driver.name,
                    'lat': float(driver.current_lat),
                    'lon': float(driver.current_lon),
                    'is_online': driver.is_online,
                    'car_model': driver.car_model,
                    'plate_number': driver.plate_number,
                    'region': driver.region.title if driver.region else None,
                    'last_location_update': driver.last_location_update.isoformat() if driver.last_location_update else None,
                })

        # Получаем активные заказы (не завершенные и не отмененные)
        active_statuses = [
            OrderStatus.SUBMITTED,
            OrderStatus.AWAITING_DISPATCHER_DECISION,
            OrderStatus.ACTIVE_QUEUE,
            OrderStatus.ASSIGNED,
            OrderStatus.DRIVER_EN_ROUTE,
            OrderStatus.ARRIVED_WAITING,
            OrderStatus.RIDE_ONGOING,
        ]
        orders = Order.objects.filter(status__in=active_statuses).select_related('passenger', 'driver', 'passenger__user', 'driver__user')
        orders_data = []
        for order in orders:
            order_data = OrderSerializer(order).data
            orders_data.append({
                'id': order.id,
                'pickup_lat': float(order.pickup_lat) if order.pickup_lat else None,
                'pickup_lon': float(order.pickup_lon) if order.pickup_lon else None,
                'dropoff_lat': float(order.dropoff_lat) if order.dropoff_lat else None,
                'dropoff_lon': float(order.dropoff_lon) if order.dropoff_lon else None,
                'pickup_title': order.pickup_title,
                'dropoff_title': order.dropoff_title,
                'status': order.status,
                'driver_id': str(order.driver.id) if order.driver else None,
                'passenger': {
                    'id': str(order.passenger.id),
                    'full_name': order.passenger.full_name,
                } if order.passenger else None,
                'created_at': order.created_at.isoformat() if order.created_at else None,
            })

        return Response({
            'drivers': drivers_data,
            'orders': orders_data,
            'drivers_count': len(drivers_data),
            'orders_count': len(orders_data),
        })

    @action(detail=False, methods=['get'], url_path='route')
    def get_route(self, request):
        """Получить маршрут между двумя точками"""
        # Разрешаем доступ всем авторизованным пользователям
        # (права проверяются на уровне permission_classes = [IsAuthenticated])

        lat1 = request.query_params.get('lat1')
        lon1 = request.query_params.get('lon1')
        lat2 = request.query_params.get('lat2')
        lon2 = request.query_params.get('lon2')

        if not all([lat1, lon1, lat2, lon2]):
            return Response(
                {'error': 'Требуются параметры: lat1, lon1, lat2, lon2'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            lat1 = float(lat1)
            lon1 = float(lon1)
            lat2 = float(lat2)
            lon2 = float(lon2)
        except ValueError:
            return Response(
                {'error': 'Неверный формат координат'},
                status=status.HTTP_400_BAD_REQUEST
            )

        engine = DispatchEngine()
        route_data = engine.calculate_route(lat1, lon1, lat2, lon2)
        
        # Преобразуем datetime в строку для JSON
        route_data['eta'] = route_data['eta'].isoformat()
        
        return Response(route_data)

    @action(detail=False, methods=['get'], url_path='driver-route/(?P<driver_id>[^/.]+)')
    def get_driver_route(self, request, driver_id=None):
        """Получить маршрут водителя до активного заказа"""
        # Разрешаем доступ всем авторизованным пользователям
        # (права проверяются на уровне permission_classes = [IsAuthenticated])

        try:
            driver = Driver.objects.get(id=driver_id)
        except Driver.DoesNotExist:
            return Response(
                {'error': 'Водитель не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Ищем активный заказ водителя
        active_statuses = [
            OrderStatus.ASSIGNED,
            OrderStatus.DRIVER_EN_ROUTE,
            OrderStatus.ARRIVED_WAITING,
            OrderStatus.RIDE_ONGOING,
        ]
        order = Order.objects.filter(
            driver=driver,
            status__in=active_statuses
        ).first()

        if not order:
            return Response(
                {'error': 'У водителя нет активного заказа'},
                status=status.HTTP_404_NOT_FOUND
            )

        engine = DispatchEngine()
        route_data = engine.calculate_driver_route(driver, order)
        
        if not route_data:
            return Response(
                {'error': 'Не удалось рассчитать маршрут (отсутствуют координаты)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Преобразуем datetime в строку для JSON
        route_data['eta'] = route_data['eta'].isoformat()
        route_data['order_id'] = str(order.id)
        
        return Response(route_data)

    @action(detail=False, methods=['get'], url_path='order-route/(?P<order_id>[^/.]+)')
    def get_order_route(self, request, order_id=None):
        """Получить маршрут заказа (от точки забора до точки высадки)"""
        # Разрешаем доступ всем авторизованным пользователям
        # (права проверяются на уровне permission_classes = [IsAuthenticated])

        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

        engine = DispatchEngine()
        route_data = engine.calculate_order_route(order)
        
        if not route_data:
            return Response(
                {'error': 'Не удалось рассчитать маршрут (отсутствуют координаты)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Преобразуем datetime в строку для JSON
        route_data['eta'] = route_data['eta'].isoformat()
        
        return Response(route_data)

    @action(detail=False, methods=['get'], url_path='eta/(?P<driver_id>[^/.]+)/(?P<order_id>[^/.]+)')
    def get_eta(self, request, driver_id=None, order_id=None):
        """Получить расчетное время прибытия (ETA) водителя к заказу"""
        # Проверяем права доступа
        user = request.user
        if not user.is_staff:
            return Response(
                {'error': 'Нет прав'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            driver = Driver.objects.get(id=driver_id)
        except Driver.DoesNotExist:
            return Response(
                {'error': 'Водитель не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

        engine = DispatchEngine()
        eta_data = engine.calculate_eta(driver, order)
        
        if not eta_data:
            return Response(
                {'error': 'Не удалось рассчитать ETA (отсутствуют координаты)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return Response(eta_data)
    
    @action(detail=False, methods=['post'], url_path='smart-assign/(?P<order_id>[^/.]+)')
    def smart_assign_order(self, request, order_id=None):
        """Умное назначение заказа с использованием продвинутого алгоритма"""
        # Проверяем права доступа
        user = request.user
        if not user.is_staff:
            return Response(
                {'error': 'Нет прав для назначения заказов'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Используем новый алгоритм распределения
        matching_service = MatchingService()
        result = matching_service.assign_order(order)
        
        if result.get('success'):
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'], url_path='offer/(?P<offer_id>[^/.]+)/accept')
    def accept_offer(self, request, offer_id=None):
        """Принять оффер заказа"""
        try:
            offer = OrderOffer.objects.get(id=offer_id)
        except OrderOffer.DoesNotExist:
            return Response(
                {'error': 'Оффер не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Проверяем права (водитель может принять только свой оффер)
        user = request.user
        if hasattr(user, 'driver') and offer.driver != user.driver:
            return Response(
                {'error': 'Нет прав для принятия этого оффера'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        matching_service = MatchingService()
        result = matching_service.handle_offer_accepted(offer)
        
        if result.get('success'):
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'], url_path='offer/(?P<offer_id>[^/.]+)/decline')
    def decline_offer(self, request, offer_id=None):
        """Отклонить оффер заказа"""
        try:
            offer = OrderOffer.objects.get(id=offer_id)
        except OrderOffer.DoesNotExist:
            return Response(
                {'error': 'Оффер не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Проверяем права
        user = request.user
        if hasattr(user, 'driver') and offer.driver != user.driver:
            return Response(
                {'error': 'Нет прав для отклонения этого оффера'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        matching_service = MatchingService()
        result = matching_service.handle_offer_declined(offer)
        
        return Response(result, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'], url_path='candidates-scored/(?P<order_id>[^/.]+)')
    def get_candidates_scored(self, request, order_id=None):
        """Получить кандидатов с детальными скорингами"""
        # Проверяем права доступа
        user = request.user
        if not user.is_staff:
            return Response(
                {'error': 'Нет прав'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        limit = int(request.query_params.get('limit', 10))
        matching_service = MatchingService()
        candidates = matching_service.get_candidates_with_scores(order, limit)
        
        return Response({
            'order_id': order_id,
            'candidates': candidates,
            'count': len(candidates)
        })
    
    @action(detail=False, methods=['get'], url_path='offers/(?P<order_id>[^/.]+)')
    def get_order_offers(self, request, order_id=None):
        """Получить все офферы для заказа"""
        # Проверяем права доступа
        user = request.user
        if not user.is_staff and not (hasattr(user, 'driver')):
            return Response(
                {'error': 'Нет прав'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Заказ не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        offers = OrderOffer.objects.filter(order=order).order_by('-created_at')
        offers_data = []
        for offer in offers:
            offers_data.append({
                'id': offer.id,
                'driver_id': offer.driver.id,
                'driver_name': offer.driver.name,
                'status': offer.status,
                'created_at': offer.created_at.isoformat(),
                'expires_at': offer.expires_at.isoformat(),
                'responded_at': offer.responded_at.isoformat() if offer.responded_at else None,
                'eta_seconds': offer.eta_seconds,
                'distance_km': offer.distance_km,
                'cost_score': offer.cost_score,
                'selection_reason': offer.selection_reason,
                'is_expired': offer.is_expired
            })
        
        return Response({
            'order_id': order_id,
            'offers': offers_data,
            'count': len(offers_data)
        })
    
    @action(detail=False, methods=['post'], url_path='check-timeouts')
    def check_timeouts(self, request):
        """Проверить и обработать истекшие офферы (для cron/celery)"""
        # Проверяем права доступа (только админы)
        user = request.user
        if not user.is_staff:
            return Response(
                {'error': 'Нет прав'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        expired_offers = OrderOffer.objects.filter(
            status='pending',
            expires_at__lte=timezone.now()
        )
        
        matching_service = MatchingService()
        processed = []
        errors = []
        
        for offer in expired_offers:
            try:
                result = matching_service.handle_offer_timeout(offer)
                processed.append({
                    'offer_id': offer.id,
                    'order_id': offer.order.id,
                    'driver_id': offer.driver.id,
                    'result': result
                })
            except Exception as e:
                errors.append({
                    'offer_id': offer.id,
                    'error': str(e)
                })
        
        return Response({
            'processed': len(processed),
            'errors': len(errors),
            'details': {
                'processed': processed,
                'errors': errors
            }
        })