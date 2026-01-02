from rest_framework import serializers
from .models import Order, OrderEvent, OrderStatus
from .services import PriceCalculator
from accounts.serializers import PassengerSerializer, DriverSerializer


class OrderSerializer(serializers.ModelSerializer):
    passenger = PassengerSerializer(read_only=True)
    passenger_id = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True
    )
    driver = DriverSerializer(read_only=True)
    driver_id = serializers.IntegerField(
        source='driver.id',
        write_only=True,
        required=False,
        allow_null=True
    )
    pickup_coordinate = serializers.SerializerMethodField()
    dropoff_coordinate = serializers.SerializerMethodField()
    seats_needed = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'passenger', 'passenger_id', 'driver', 'driver_id',
            'pickup_title', 'dropoff_title',
            'pickup_lat', 'pickup_lon', 'dropoff_lat', 'dropoff_lon',
            'pickup_coordinate', 'dropoff_coordinate',
            'desired_pickup_time', 'has_companion', 'note',
            'status', 'created_at', 'assigned_at', 'completed_at',
            'assignment_reason', 'rejection_reason',
            'video_recording', 'upload_started', 'seats_needed',
            'distance_km', 'waiting_time_minutes',
            'estimated_price', 'final_price', 'price_breakdown'
        ]
        read_only_fields = [
            'id', 'created_at', 'assigned_at', 'completed_at',
            'assignment_reason', 'rejection_reason',
            'distance_km', 'waiting_time_minutes',
            'estimated_price', 'final_price', 'price_breakdown'
        ]


    def get_pickup_coordinate(self, obj):
        return {'lat': obj.pickup_lat, 'lon': obj.pickup_lon}

    def get_dropoff_coordinate(self, obj):
        return {'lat': obj.dropoff_lat, 'lon': obj.dropoff_lon}

    def create(self, validated_data):
        # Генерируем ID заказа
        import time
        from accounts.models import Passenger, Driver
        from django.core.exceptions import ObjectDoesNotExist
        
        order_id = f'order_{int(time.time() * 1000)}'
        validated_data['id'] = order_id
        
        # Обрабатываем passenger_id и driver_id если они переданы
        # Сначала проверяем passenger_id напрямую
        passenger_id = validated_data.pop('passenger_id', None)
        if passenger_id:
            try:
                validated_data['passenger'] = Passenger.objects.get(id=passenger_id)
            except Passenger.DoesNotExist:
                raise serializers.ValidationError({'passenger_id': 'Пассажир с указанным ID не найден'})
        
        # Если passenger_id не был передан, проверяем вложенный объект passenger
        if not validated_data.get('passenger'):
            passenger_data = validated_data.pop('passenger', None)
            if passenger_data and isinstance(passenger_data, dict) and 'id' in passenger_data:
                try:
                    validated_data['passenger'] = Passenger.objects.get(id=passenger_data['id'])
                except Passenger.DoesNotExist:
                    raise serializers.ValidationError({'passenger_id': 'Пассажир с указанным ID не найден'})
        
        # Если passenger все еще не установлен, используем текущего пользователя
        if not validated_data.get('passenger'):
            request = self.context.get('request')
            if request and hasattr(request.user, 'passenger'):
                validated_data['passenger'] = request.user.passenger
            else:
                raise serializers.ValidationError({'passenger_id': 'Необходимо указать пассажира или войти как пассажир'})
        
        driver_data = validated_data.pop('driver', None)
        if driver_data and isinstance(driver_data, dict) and 'id' in driver_data:
            try:
                validated_data['driver'] = Driver.objects.get(id=driver_data['id'])
            except Driver.DoesNotExist:
                # Водитель не обязателен при создании заказа, просто игнорируем
                pass
        
        # Создаем заказ
        try:
            order = super().create(validated_data)
        except Exception as e:
            raise serializers.ValidationError({'error': f'Ошибка создания заказа: {str(e)}'})
        
        # Рассчитываем предварительную цену
        try:
            price_data = PriceCalculator.calculate_estimated_price(order)
            order.distance_km = price_data['distance_km']
            order.waiting_time_minutes = price_data['waiting_time_minutes']
            order.estimated_price = price_data['estimated_price']
            order.price_breakdown = price_data['price_breakdown']
            order.save()
        except Exception as e:
            # Если расчет цены не удался, все равно сохраняем заказ
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'Ошибка расчета цены для заказа {order.id}: {str(e)}')
            # Можно оставить заказ без цены или установить дефолтные значения
            if not order.distance_km:
                order.distance_km = 0.0
            if not order.waiting_time_minutes:
                order.waiting_time_minutes = 0
            order.save()
        
        return order
    
    def update(self, instance, validated_data):
        """Обновление заказа с пересчетом цены при необходимости"""
        order = super().update(instance, validated_data)
        
        # Если изменились координаты или время, пересчитываем цену
        if any(field in validated_data for field in ['pickup_lat', 'pickup_lon', 'dropoff_lat', 'dropoff_lon', 'desired_pickup_time', 'has_companion']):
            # Пересчитываем только если заказ еще не завершен
            if order.status != OrderStatus.COMPLETED:
                price_data = PriceCalculator.calculate_estimated_price(order)
                order.distance_km = price_data['distance_km']
                order.waiting_time_minutes = price_data['waiting_time_minutes']
                order.estimated_price = price_data['estimated_price']
                order.price_breakdown = price_data['price_breakdown']
                order.save()
        
        return order


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=OrderStatus.choices)
    reason = serializers.CharField(required=False, allow_blank=True)


class OrderEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderEvent
        fields = ['id', 'order', 'status_from', 'status_to', 'created_at', 'description']
        read_only_fields = ['id', 'created_at']

