from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PassengerViewSet

router = DefaultRouter()
router.register(r'', PassengerViewSet, basename='passenger')

# Явные маршруты ДО роутера — иначе "clear-all" матчится как pk и даёт 405
urlpatterns = [
    path('clear-all/', PassengerViewSet.as_view({'post': 'clear_all_passengers'}), name='passenger-clear-all'),
    path('', include(router.urls)),
]

