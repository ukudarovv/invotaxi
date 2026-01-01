from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Passenger, Driver
from regions.serializers import RegionSerializer

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'phone', 'role', 'email']
        read_only_fields = ['id', 'username', 'role']

    def get_role(self, obj):
        if hasattr(obj, 'passenger'):
            return 'passenger'
        elif hasattr(obj, 'driver'):
            return 'driver'
        elif obj.is_staff:
            return 'admin'
        return obj.role


class PassengerSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    region = RegionSerializer(read_only=True)
    region_id = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Passenger
        fields = [
            'id', 'user', 'full_name', 'region', 'region_id',
            'disability_category', 'allowed_companion'
        ]
        read_only_fields = ['id']


class DriverSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    region = RegionSerializer(read_only=True)
    region_id = serializers.CharField(write_only=True, required=False)
    current_position = serializers.SerializerMethodField()

    class Meta:
        model = Driver
        fields = [
            'id', 'user', 'name', 'region', 'region_id',
            'car_model', 'plate_number', 'capacity',
            'is_online', 'current_lat', 'current_lon',
            'current_position', 'last_location_update'
        ]
        read_only_fields = ['id', 'last_location_update']

    def get_current_position(self, obj):
        if obj.current_lat is not None and obj.current_lon is not None:
            return {'lat': obj.current_lat, 'lon': obj.current_lon}
        return None


class PhoneLoginSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20, required=True)

    def validate_phone(self, value):
        # Базовая валидация телефона
        cleaned = value.replace('+', '').replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
        if not cleaned.isdigit() or len(cleaned) < 10:
            raise serializers.ValidationError('Неверный формат телефона')
        return value


class VerifyOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20, required=True)
    code = serializers.CharField(max_length=6, required=True)

    def validate_phone(self, value):
        cleaned = value.replace('+', '').replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
        if not cleaned.isdigit() or len(cleaned) < 10:
            raise serializers.ValidationError('Неверный формат телефона')
        return value

    def validate_code(self, value):
        if not value.isdigit() or len(value) != 6:
            raise serializers.ValidationError('Код должен состоять из 6 цифр')
        return value

