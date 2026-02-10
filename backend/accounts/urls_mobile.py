from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views_mobile import MobileAuthViewSet, MobilePassengerViewSet, MobileDriverViewSet

router = DefaultRouter()
router.register(r'auth', MobileAuthViewSet, basename='mobile-auth')
router.register(r'passengers', MobilePassengerViewSet, basename='mobile-passenger')
router.register(r'drivers', MobileDriverViewSet, basename='mobile-driver')

urlpatterns = [
    path('', include(router.urls)),
]
