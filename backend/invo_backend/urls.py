"""
URL configuration for invo_backend project.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/admin/', include('accounts.urls_admin')),
    path('api/orders/', include('orders.urls')),
    path('api/drivers/', include('accounts.urls_drivers')),
    path('api/passengers/', include('accounts.urls_passengers')),
    path('api/dispatch/', include('dispatch.urls')),
    path('api/regions/', include('regions.urls')),
    path('api/websocket/', include('websocket.urls')),
    path('api/analytics/', include('analytics.urls')),
    # Мобильные API endpoints
    path('api/mobile/', include('accounts.urls_mobile')),
    path('api/mobile/orders/', include('orders.urls_mobile')),
]

