from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OrderViewSet

router = DefaultRouter()
router.register(r'', OrderViewSet, basename='order')

# Явные маршруты ДО роутера — иначе "export-excel-template" матчится как pk и даёт 404
urlpatterns = [
    path('export-excel-template/', OrderViewSet.as_view({'get': 'export_excel_template'}), name='order-export-excel-template'),
    path('clear-all/', OrderViewSet.as_view({'post': 'clear_all_orders'}), name='order-clear-all'),
    path('', include(router.urls)),
]

