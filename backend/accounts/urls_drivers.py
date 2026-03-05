from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DriverViewSet

router = DefaultRouter()
router.register(r'', DriverViewSet, basename='driver')

# Явные маршруты ДО роутера — иначе "clear-all" матчится как pk и даёт 405
urlpatterns = [
    path('clear-all/', DriverViewSet.as_view({'post': 'clear_all_drivers'}), name='driver-clear-all'),
    path('', include(router.urls)),
]

