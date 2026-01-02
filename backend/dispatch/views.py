from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from orders.models import Order, OrderStatus
from orders.services import OrderService
from orders.serializers import OrderSerializer
from accounts.models import Driver
from accounts.serializers import DriverSerializer
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

        # Получаем driver_id из запроса, если указан
        driver_id = request.data.get('driver_id')
        
        # Проверяем статус заказа и автоматически переводим в active_queue если нужно
        if order.status != OrderStatus.ACTIVE_QUEUE:
            # Автоматически переводим в очередь, если заказ в подходящем статусе
            valid_statuses_for_queue = [
                OrderStatus.SUBMITTED,
                OrderStatus.AWAITING_DISPATCHER_DECISION,
                OrderStatus.ASSIGNED,  # Может быть переназначен
            ]
            if order.status in valid_statuses_for_queue:
                OrderService.update_status(order, OrderStatus.ACTIVE_QUEUE, 'Автоматический перевод в очередь для назначения водителя', user)
                order.refresh_from_db()
            else:
                return Response(
                    {'error': f'Заказ должен быть в статусе {OrderStatus.ACTIVE_QUEUE}. Текущий статус: {order.status}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Назначаем заказ
        engine = DispatchEngine()
        
        # Если указан конкретный водитель, используем его
        if driver_id:
            from accounts.models import Driver
            try:
                driver = Driver.objects.get(id=int(driver_id), is_online=True)
                # Проверяем, что водитель подходит для заказа
                if driver.capacity < order.seats_needed:
                    return Response(
                        {'error': f'Водитель {driver.name} не подходит: недостаточная вместимость'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                # Назначаем указанного водителя
                order.driver = driver
                order.assignment_reason = f'Назначен водитель {driver.name} вручную'
                OrderService.update_status(order, OrderStatus.ASSIGNED, order.assignment_reason, user)
                
                return Response({
                    'success': True,
                    'driver_id': driver.id,
                    'reason': order.assignment_reason,
                    'order': {
                        'id': order.id,
                        'status': order.status,
                        'driver': {
                            'id': driver.id,
                            'name': driver.name,
                            'car_model': driver.car_model
                        }
                    }
                })
            except Driver.DoesNotExist:
                return Response(
                    {'error': 'Водитель не найден или не онлайн'},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        # Иначе используем автоматический алгоритм
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
                result = engine.assign_order(order)
                if result.driver_id:
                    from accounts.models import Driver
                    try:
                        driver = Driver.objects.get(id=result.driver_id)
                        order.driver = driver
                        order.assignment_reason = result.reason
                        OrderService.update_status(order, OrderStatus.ASSIGNED, result.reason, user)
                        assigned_count += 1
                    except Driver.DoesNotExist:
                        failed_count += 1
                        failed_orders.append({
                            'order_id': order.id,
                            'reason': 'Водитель не найден'
                        })
                else:
                    failed_count += 1
                    failed_orders.append({
                        'order_id': order.id,
                        'reason': result.reason or 'Не удалось назначить водителя'
                    })
            except Exception as e:
                failed_count += 1
                failed_orders.append({
                    'order_id': order.id,
                    'reason': str(e)
                })

        return Response({
            'success': True,
            'assigned': assigned_count,
            'failed': failed_count,
            'total': queue_orders.count(),
            'failed_orders': failed_orders
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

