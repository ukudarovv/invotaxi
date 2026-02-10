from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views_mobile import MobileOrderViewSet

router = DefaultRouter()
router.register(r'', MobileOrderViewSet, basename='mobile-order')

urlpatterns = [
    path('', include(router.urls)),
]
