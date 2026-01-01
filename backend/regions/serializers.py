from rest_framework import serializers
from .models import Region


class RegionSerializer(serializers.ModelSerializer):
    center = serializers.SerializerMethodField()

    class Meta:
        model = Region
        fields = ['id', 'title', 'center_lat', 'center_lon', 'center']

    def get_center(self, obj):
        return {
            'lat': obj.center_lat,
            'lon': obj.center_lon
        }

