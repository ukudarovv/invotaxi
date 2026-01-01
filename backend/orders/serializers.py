from rest_framework import serializers
from .models import Order, OrderEvent, OrderStatus
from accounts.serializers import PassengerSerializer, DriverSerializer


class OrderSerializer(serializers.ModelSerializer):
    passenger = PassengerSerializer(read_only=True)
    passenger_id = serializers.IntegerField(
        source='passenger.id',
        write_only=True,
        required=False
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
            'video_recording', 'upload_started', 'seats_needed'
        ]
        read_only_fields = [
            'id', 'created_at', 'assigned_at', 'completed_at',
            'assignment_reason', 'rejection_reason'
        ]


    def get_pickup_coordinate(self, obj):
        return {'lat': obj.pickup_lat, 'lon': obj.pickup_lon}

    def get_dropoff_coordinate(self, obj):
        return {'lat': obj.dropoff_lat, 'lon': obj.dropoff_lon}

    def create(self, validated_data):
        # Генерируем ID заказа
        import time
        from accounts.models import Passenger, Driver
        
        order_id = f'order_{int(time.time() * 1000)}'
        validated_data['id'] = order_id
        
        # Обрабатываем passenger_id и driver_id если они переданы
        passenger_data = validated_data.pop('passenger', None)
        if passenger_data and isinstance(passenger_data, dict) and 'id' in passenger_data:
            validated_data['passenger'] = Passenger.objects.get(id=passenger_data['id'])
        elif not validated_data.get('passenger'):
            # Если passenger не передан, используем текущего пользователя
            request = self.context.get('request')
            if request and hasattr(request.user, 'passenger'):
                validated_data['passenger'] = request.user.passenger
        
        driver_data = validated_data.pop('driver', None)
        if driver_data and isinstance(driver_data, dict) and 'id' in driver_data:
            validated_data['driver'] = Driver.objects.get(id=driver_data['id'])
        
        return super().create(validated_data)


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=OrderStatus.choices)
    reason = serializers.CharField(required=False, allow_blank=True)


class OrderEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderEvent
        fields = ['id', 'order', 'status_from', 'status_to', 'created_at', 'description']
        read_only_fields = ['id', 'created_at']

