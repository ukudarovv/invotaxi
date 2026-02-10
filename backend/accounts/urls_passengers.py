from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PassengerViewSet

router = DefaultRouter()
router.register(r'', PassengerViewSet, basename='passenger')

urlpatterns = [
    path('', include(router.urls)),
]

