import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.utils import timezone
from orders.models import Order
from accounts.models import Driver, Passenger

logger = logging.getLogger(__name__)
User = get_user_model()


class OrderConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer для обновлений заказа"""

    async def connect(self):
        self.order_id = self.scope['url_route']['kwargs']['order_id']
        self.room_group_name = f'order_{self.order_id}'

        logger.info(f"WebSocket OrderConsumer: Connection attempt for order {self.order_id}")

        # Проверяем права доступа
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            logger.warning(f"WebSocket OrderConsumer: Unauthenticated user for order {self.order_id}")
            await self.close()
            return

        logger.info(f"WebSocket OrderConsumer: User {user.id} authenticated, checking access for order {self.order_id}")

        # Проверяем, что пользователь имеет доступ к заказу
        has_access = await self.check_order_access(user, self.order_id)
        if not has_access:
            logger.warning(f"WebSocket OrderConsumer: User {user.id} has no access to order {self.order_id}")
            await self.close()
            return

        logger.info(f"WebSocket OrderConsumer: User {user.id} connected to order {self.order_id}")

        # Присоединяемся к группе
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()
        logger.info(f"WebSocket OrderConsumer: Successfully connected to order {self.order_id}")

    async def disconnect(self, close_code):
        # Покидаем группу
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        """Обработка сообщений от клиента"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except json.JSONDecodeError:
            pass

    async def order_update(self, event):
        """Отправка обновления заказа клиенту"""
        await self.send(text_data=json.dumps({
            'type': 'order_update',
            'data': event['data']
        }))

    async def order_status_changed(self, event):
        """Отправка изменения статуса заказа"""
        await self.send(text_data=json.dumps({
            'type': 'order_status_changed',
            'data': event['data']
        }))

    async def driver_assigned(self, event):
        """Отправка уведомления о назначении водителя"""
        await self.send(text_data=json.dumps({
            'type': 'driver_assigned',
            'data': event['data']
        }))

    @database_sync_to_async
    def check_order_access(self, user, order_id):
        """Проверяет доступ пользователя к заказу"""
        try:
            order = Order.objects.get(id=order_id)
            
            # Админы имеют доступ ко всем заказам
            if user.is_staff:
                return True

            # Пассажир имеет доступ к своим заказам
            if hasattr(user, 'passenger') and order.passenger == user.passenger:
                return True

            # Водитель имеет доступ к своим заказам
            if hasattr(user, 'driver') and order.driver == user.driver:
                return True

            return False
        except Order.DoesNotExist:
            return False


class DriverConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer для обновлений водителя"""

    async def connect(self):
        self.driver_id = self.scope['url_route']['kwargs']['driver_id']
        self.room_group_name = f'driver_{self.driver_id}'

        # Проверяем права доступа
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close()
            return

        # Проверяем, что пользователь - это водитель или админ
        has_access = await self.check_driver_access(user, self.driver_id)
        if not has_access:
            await self.close()
            return

        # Присоединяемся к группе
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Покидаем группу
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        """Обработка сообщений от клиента"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except json.JSONDecodeError:
            pass

    async def new_order(self, event):
        """Отправка нового назначенного заказа"""
        await self.send(text_data=json.dumps({
            'type': 'new_order',
            'data': event['data']
        }))

    async def order_update(self, event):
        """Отправка обновления заказа"""
        await self.send(text_data=json.dumps({
            'type': 'order_update',
            'data': event['data']
        }))

    @database_sync_to_async
    def check_driver_access(self, user, driver_id):
        """Проверяет доступ пользователя к данным водителя"""
        # Админы имеют доступ ко всем водителям
        if user.is_staff:
            return True

        # Водитель имеет доступ только к своим данным
        if hasattr(user, 'driver') and str(user.driver.id) == str(driver_id):
            return True

        return False


class PassengerConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer для обновлений пассажира"""

    async def connect(self):
        self.passenger_id = self.scope['url_route']['kwargs']['passenger_id']
        self.room_group_name = f'passenger_{self.passenger_id}'

        # Проверяем права доступа
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close()
            return

        # Проверяем, что пользователь - это пассажир или админ
        has_access = await self.check_passenger_access(user, self.passenger_id)
        if not has_access:
            await self.close()
            return

        # Присоединяемся к группе
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Покидаем группу
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        """Обработка сообщений от клиента"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except json.JSONDecodeError:
            pass

    async def order_update(self, event):
        """Отправка обновления заказа"""
        await self.send(text_data=json.dumps({
            'type': 'order_update',
            'data': event['data']
        }))

    async def driver_arrived(self, event):
        """Отправка уведомления о прибытии водителя"""
        await self.send(text_data=json.dumps({
            'type': 'driver_arrived',
            'data': event['data']
        }))

    @database_sync_to_async
    def check_passenger_access(self, user, passenger_id):
        """Проверяет доступ пользователя к данным пассажира"""
        # Админы имеют доступ ко всем пассажирам
        if user.is_staff:
            return True

        # Пассажир имеет доступ только к своим данным
        if hasattr(user, 'passenger') and str(user.passenger.id) == str(passenger_id):
            return True

        return False


class DispatchMapConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer для карты диспетчеризации - отслеживание всех водителей и заказов"""

    async def connect(self):
        self.room_group_name = 'dispatch_map'

        # Выводим в консоль для немедленного отображения
        print("[DispatchMapConsumer] Connection attempt")
        logger.info("=" * 60)
        logger.info("WebSocket DispatchMapConsumer: Connection attempt")
        logger.info(f"WebSocket DispatchMapConsumer: Scope path: {self.scope.get('path', 'unknown')}")
        logger.info(f"WebSocket DispatchMapConsumer: Scope query_string: {self.scope.get('query_string', b'').decode()}")
        logger.info(f"WebSocket DispatchMapConsumer: Scope type: {self.scope.get('type', 'unknown')}")
        logger.info(f"WebSocket DispatchMapConsumer: Scope client: {self.scope.get('client', 'unknown')}")
        logger.info(f"WebSocket DispatchMapConsumer: Scope server: {self.scope.get('server', 'unknown')}")

        # Проверяем права доступа - только админы/диспетчеры
        user = self.scope.get('user')
        logger.info(f"WebSocket DispatchMapConsumer: User from scope: {user}")
        logger.info(f"WebSocket DispatchMapConsumer: User type: {type(user).__name__}")
        
        if user:
            is_authenticated = user.is_authenticated if hasattr(user, 'is_authenticated') else False
            is_staff = user.is_staff if hasattr(user, 'is_staff') else False
            user_id = getattr(user, 'id', None)
            username = getattr(user, 'username', None)
            logger.info(f"WebSocket DispatchMapConsumer: User authenticated: {is_authenticated}")
            logger.info(f"WebSocket DispatchMapConsumer: User is_staff: {is_staff}")
            logger.info(f"WebSocket DispatchMapConsumer: User ID: {user_id}, Username: {username}")
        else:
            logger.warning("WebSocket DispatchMapConsumer: No user in scope")
        
        if not user or not user.is_authenticated:
            logger.warning("WebSocket DispatchMapConsumer: Unauthenticated user - closing connection")
            print("[DispatchMapConsumer] Connection rejected: Unauthenticated")
            await self.close(code=4001)  # 4001 = Unauthorized
            logger.info("=" * 60)
            return

        # Проверяем, что пользователь - админ или диспетчер
        if not user.is_staff:
            logger.warning(f"WebSocket DispatchMapConsumer: User {user.id} ({user.username}) is not staff - closing connection")
            print(f"[DispatchMapConsumer] Connection rejected: User {user.id} is not staff")
            await self.close(code=4003)  # 4003 = Forbidden
            logger.info("=" * 60)
            return

        logger.info(f"WebSocket DispatchMapConsumer: User {user.id} ({user.username}) authenticated and authorized")

        # Присоединяемся к группе
        try:
            logger.info(f"WebSocket DispatchMapConsumer: Attempting to add to group {self.room_group_name}")
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            logger.info(f"WebSocket DispatchMapConsumer: Successfully added to group {self.room_group_name}")
        except Exception as e:
            logger.error(f"WebSocket DispatchMapConsumer: Error adding to group: {e}", exc_info=True)
            print(f"[DispatchMapConsumer] Error adding to group: {e}")
            await self.close(code=4000)  # 4000 = Internal error
            logger.info("=" * 60)
            return

        await self.accept()
        logger.info("WebSocket DispatchMapConsumer: Successfully connected and accepted")
        print("[DispatchMapConsumer] Connection accepted successfully")
        logger.info("=" * 60)

    async def disconnect(self, close_code):
        # Покидаем группу
        logger.info(f"WebSocket DispatchMapConsumer: Disconnecting with code {close_code}")
        print(f"[DispatchMapConsumer] Disconnecting with code {close_code}")
        try:
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
            logger.info(f"WebSocket DispatchMapConsumer: Removed from group {self.room_group_name}")
        except Exception as e:
            logger.error(f"WebSocket DispatchMapConsumer: Error removing from group: {e}", exc_info=True)
        logger.info("WebSocket DispatchMapConsumer: Disconnected")
        logger.info("=" * 60)

    async def receive(self, text_data):
        """Обработка сообщений от клиента"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
        except json.JSONDecodeError:
            pass

    async def driver_location_update(self, event):
        """Отправка обновления локации водителя"""
        await self.send(text_data=json.dumps({
            'type': 'driver_location_update',
            'data': event['data']
        }))

    async def driver_status_update(self, event):
        """Отправка обновления статуса водителя"""
        await self.send(text_data=json.dumps({
            'type': 'driver_status_update',
            'data': event['data']
        }))

    async def order_update(self, event):
        """Отправка обновления заказа"""
        await self.send(text_data=json.dumps({
            'type': 'order_update',
            'data': event['data']
        }))

    async def order_created(self, event):
        """Отправка уведомления о создании заказа"""
        await self.send(text_data=json.dumps({
            'type': 'order_created',
            'data': event['data']
        }))

    async def driver_route_update(self, event):
        """Отправка обновления маршрута водителя"""
        await self.send(text_data=json.dumps({
            'type': 'driver_route_update',
            'data': event['data']
        }))

    async def order_route_update(self, event):
        """Отправка обновления маршрута заказа"""
        await self.send(text_data=json.dumps({
            'type': 'order_route_update',
            'data': event['data']
        }))

    async def driver_eta_update(self, event):
        """Отправка обновления ETA водителя"""
        await self.send(text_data=json.dumps({
            'type': 'driver_eta_update',
            'data': event['data']
        }))


class TestWebSocketConsumer(AsyncWebsocketConsumer):
    """Тестовый WebSocket consumer без авторизации для диагностики"""
    
    async def connect(self):
        print("[TestWebSocketConsumer] Connection attempt")
        logger.info("TestWebSocketConsumer: Connection attempt")
        logger.info(f"TestWebSocketConsumer: Scope path: {self.scope.get('path', 'unknown')}")
        
        # Принимаем подключение без проверки авторизации
        await self.accept()
        print("[TestWebSocketConsumer] Successfully connected")
        logger.info("TestWebSocketConsumer: Successfully connected")
        
        # Отправляем тестовое сообщение
        await self.send(text_data=json.dumps({
            'type': 'test_message',
            'data': {
                'message': 'WebSocket connection successful!',
                'timestamp': str(timezone.now())
            }
        }))

    async def disconnect(self, close_code):
        print(f"[TestWebSocketConsumer] Disconnected with code: {close_code}")
        logger.info(f"TestWebSocketConsumer: Disconnected with code: {close_code}")

    async def receive(self, text_data):
        """Обработка сообщений от клиента"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            print(f"[TestWebSocketConsumer] Received message: {message_type}")
            logger.info(f"TestWebSocketConsumer: Received message type: {message_type}")
            
            if message_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
            elif message_type == 'echo':
                await self.send(text_data=json.dumps({
                    'type': 'echo_response',
                    'data': data.get('data', {})
                }))
        except json.JSONDecodeError as e:
            logger.error(f"TestWebSocketConsumer: JSON decode error: {e}")