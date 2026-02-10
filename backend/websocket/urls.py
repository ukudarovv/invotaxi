"""
URL configuration for WebSocket endpoints
"""
from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.websocket_health, name='websocket_health'),
]

