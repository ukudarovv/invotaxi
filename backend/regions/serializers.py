from rest_framework import serializers
from .models import Region, City


class CitySerializer(serializers.ModelSerializer):
    """Сериализатор для города"""
    center = serializers.SerializerMethodField()

    class Meta:
        model = City
        fields = ['id', 'title', 'center_lat', 'center_lon', 'center']
        read_only_fields = ['id']

    def get_center(self, obj):
        return {
            'lat': obj.center_lat,
            'lon': obj.center_lon
        }
    
    def validate_center_lat(self, value):
        """Валидация широты"""
        if value < -90 or value > 90:
            raise serializers.ValidationError("Широта должна быть в диапазоне от -90 до 90")
        return value
    
    def validate_center_lon(self, value):
        """Валидация долготы"""
        if value < -180 or value > 180:
            raise serializers.ValidationError("Долгота должна быть в диапазоне от -180 до 180")
        return value


class RegionSerializer(serializers.ModelSerializer):
    """Сериализатор для региона"""
    center = serializers.SerializerMethodField()
    city = CitySerializer(read_only=True)
    city_id = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = Region
        fields = [
            'id', 'title', 'city', 'city_id', 'center_lat', 'center_lon', 'center',
            'polygon_coordinates', 'service_radius_meters'
        ]
        read_only_fields = ['id']

    def get_center(self, obj):
        return {
            'lat': obj.center_lat,
            'lon': obj.center_lon
        }
    
    def validate_center_lat(self, value):
        """Валидация широты"""
        if value < -90 or value > 90:
            raise serializers.ValidationError("Широта должна быть в диапазоне от -90 до 90")
        return value
    
    def validate_center_lon(self, value):
        """Валидация долготы"""
        if value < -180 or value > 180:
            raise serializers.ValidationError("Долгота должна быть в диапазоне от -180 до 180")
        return value
    
    def validate_polygon_coordinates(self, value):
        """Валидация координат полигона"""
        if value is not None:
            if not isinstance(value, list):
                raise serializers.ValidationError("Координаты полигона должны быть массивом")
            if len(value) < 3:
                raise serializers.ValidationError("Полигон должен содержать минимум 3 точки")
            for point in value:
                if not isinstance(point, list) or len(point) != 2:
                    raise serializers.ValidationError("Каждая точка должна быть массивом [lat, lon]")
                lat, lon = point
                if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
                    raise serializers.ValidationError("Координаты должны быть числами")
                if lat < -90 or lat > 90:
                    raise serializers.ValidationError("Широта должна быть в диапазоне от -90 до 90")
                if lon < -180 or lon > 180:
                    raise serializers.ValidationError("Долгота должна быть в диапазоне от -180 до 180")
        return value
    
    def validate_service_radius_meters(self, value):
        """Валидация радиуса обслуживания"""
        if value is not None and value <= 0:
            raise serializers.ValidationError("Радиус обслуживания должен быть положительным числом")
        return value
    
    def validate_city_id(self, value):
        """Валидация существования города"""
        if not City.objects.filter(id=value).exists():
            raise serializers.ValidationError(f"Город с ID '{value}' не существует")
        return value
    
    def create(self, validated_data):
        """Создание региона"""
        city_id = validated_data.pop('city_id')
        city = City.objects.get(id=city_id)
        validated_data['city'] = city
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Обновление региона"""
        if 'city_id' in validated_data:
            city_id = validated_data.pop('city_id')
            city = City.objects.get(id=city_id)
            validated_data['city'] = city
        return super().update(instance, validated_data)

