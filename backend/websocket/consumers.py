import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
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

