from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from rest_framework.decorators import action
from rest_framework.response import Response
from accounts.permissions import IsAdminOrReadOnly
from .models import Region, City
from .serializers import RegionSerializer, CitySerializer


class CityViewSet(viewsets.ModelViewSet):
    """ViewSet для городов с CRUD операциями"""
    queryset = City.objects.all()
    serializer_class = CitySerializer
    permission_classes = [IsAdminOrReadOnly]  # Чтение всем, изменение только админам
    
    def list(self, request, *args, **kwargs):
        """Переопределяем list для логирования"""
        queryset = self.get_queryset()
        print(f"[CityViewSet] Queryset count: {queryset.count()}")
        print(f"[CityViewSet] Queryset: {list(queryset.values('id', 'title'))}")
        serializer = self.get_serializer(queryset, many=True)
        print(f"[CityViewSet] Serialized data: {serializer.data}")
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def stats(self, request, pk=None):
        """Получить статистику по городу"""
        city = self.get_object()
        
        # Подсчет регионов в городе
        regions_count = city.regions.count()
        
        # Подсчет водителей через регионы
        drivers_count = sum(region.drivers.count() for region in city.regions.all())
        
        # Подсчет пассажиров через регионы
        passengers_count = sum(region.passengers.count() for region in city.regions.all())
        
        # Подсчет заказов через регионы
        from orders.models import Order, OrderStatus
        active_statuses = [
            OrderStatus.ACTIVE_QUEUE,
            OrderStatus.ASSIGNED,
            OrderStatus.DRIVER_EN_ROUTE,
            OrderStatus.ARRIVED_WAITING,
            OrderStatus.RIDE_ONGOING,
        ]
        
        total_active_orders = 0
        total_orders = 0
        for region in city.regions.all():
            orders_queryset = Order.objects.filter(passenger__region=region)
            total_active_orders += orders_queryset.filter(status__in=active_statuses).count()
            total_orders += orders_queryset.count()
        
        return Response({
            'city_id': city.id,
            'city_title': city.title,
            'regions': regions_count,
            'drivers': drivers_count,
            'passengers': passengers_count,
            'active_orders': total_active_orders,
            'total_orders': total_orders,
        })


class RegionViewSet(viewsets.ModelViewSet):
    """ViewSet для регионов с CRUD операциями"""
    queryset = Region.objects.select_related('city').all()
    serializer_class = RegionSerializer
    permission_classes = [IsAdminOrReadOnly]  # Чтение всем, изменение только админам
    
    def get_queryset(self):
        """Оптимизированный queryset с предзагрузкой связанных данных"""
        return Region.objects.select_related('city').prefetch_related(
            'drivers', 'passengers'
        ).all()
    
    def list(self, request, *args, **kwargs):
        """Переопределяем list для логирования"""
        queryset = self.get_queryset()
        print(f"[RegionViewSet] Queryset count: {queryset.count()}")
        print(f"[RegionViewSet] Queryset: {list(queryset.values('id', 'title', 'city_id'))}")
        serializer = self.get_serializer(queryset, many=True)
        print(f"[RegionViewSet] Serialized data count: {len(serializer.data)}")
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def stats(self, request, pk=None):
        """Получить статистику по региону"""
        region = self.get_object()
        
        # Подсчет водителей
        drivers_count = region.drivers.count()
        
        # Подсчет пассажиров
        passengers_count = region.passengers.count()
        
        # Подсчет заказов через пассажиров (так как Order связан с Passenger, а Passenger с Region)
        from orders.models import Order, OrderStatus
        active_statuses = [
            OrderStatus.ACTIVE_QUEUE,
            OrderStatus.ASSIGNED,
            OrderStatus.DRIVER_EN_ROUTE,
            OrderStatus.ARRIVED_WAITING,
            OrderStatus.RIDE_ONGOING,
        ]
        # Заказы пассажиров этого региона
        orders_queryset = Order.objects.filter(passenger__region=region)
        active_orders_count = orders_queryset.filter(status__in=active_statuses).count()
        total_orders_count = orders_queryset.count()
        
        return Response({
            'region_id': region.id,
            'region_title': region.title,
            'drivers': drivers_count,
            'passengers': passengers_count,
            'active_orders': active_orders_count,
            'total_orders': total_orders_count,
        })
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def cities(self, request):
        """Получить список всех городов"""
        cities = City.objects.all()
        serializer = CitySerializer(cities, many=True)
        return Response(serializer.data)

