from django.urls import path
from .views import AnalyticsViewSet

# Явное определение URL паттернов для каждого действия
# Используем as_view() с action mapping для каждого endpoint
urlpatterns = [
    path('metrics/', AnalyticsViewSet.as_view({'get': 'metrics'}), name='analytics-metrics'),
    path('orders/', AnalyticsViewSet.as_view({'get': 'orders'}), name='analytics-orders'),
    path('financial/', AnalyticsViewSet.as_view({'get': 'financial'}), name='analytics-financial'),
    path('drivers/', AnalyticsViewSet.as_view({'get': 'drivers'}), name='analytics-drivers'),
    path('time-series/', AnalyticsViewSet.as_view({'get': 'time_series'}), name='analytics-time-series'),
    path('regions/', AnalyticsViewSet.as_view({'get': 'regions'}), name='analytics-regions'),
    path('peak-hours/', AnalyticsViewSet.as_view({'get': 'peak_hours'}), name='analytics-peak-hours'),
    path('driver-performance/', AnalyticsViewSet.as_view({'get': 'driver_performance'}), name='analytics-driver-performance'),
    path('comparison/', AnalyticsViewSet.as_view({'get': 'comparison'}), name='analytics-comparison'),
    path('export/', AnalyticsViewSet.as_view({'get': 'export'}), name='analytics-export'),
]
