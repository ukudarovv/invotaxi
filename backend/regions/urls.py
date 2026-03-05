from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RegionViewSet, CityViewSet, DistrictViewSet

router = DefaultRouter()
router.register(r'districts', DistrictViewSet, basename='district')
router.register(r'cities', CityViewSet, basename='city')
router.register(r'', RegionViewSet, basename='region')

urlpatterns = [
    path('', include(router.urls)),
]

