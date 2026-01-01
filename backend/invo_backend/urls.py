"""
URL configuration for invo_backend project.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/orders/', include('orders.urls')),
    path('api/drivers/', include('accounts.urls_drivers')),
    path('api/passengers/', include('accounts.urls_passengers')),
    path('api/dispatch/', include('dispatch.urls')),
    path('api/regions/', include('regions.urls')),
]

