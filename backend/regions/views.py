from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from .models import Region
from .serializers import RegionSerializer


class RegionViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet для регионов (только чтение)"""
    queryset = Region.objects.all()
    serializer_class = RegionSerializer
    permission_classes = [AllowAny]  # Регионы доступны всем

