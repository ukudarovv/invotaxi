"""
Custom permissions для приложения
"""
from rest_framework import permissions


class IsPassenger(permissions.BasePermission):
    """Проверяет, что пользователь - пассажир"""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and hasattr(request.user, 'passenger')


class IsDriver(permissions.BasePermission):
    """Проверяет, что пользователь - водитель"""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and hasattr(request.user, 'driver')


class IsAdminOrReadOnly(permissions.BasePermission):
    """Разрешает чтение всем, изменение только админам"""
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff


class IsOwnerOrAdmin(permissions.BasePermission):
    """Разрешает доступ только владельцу или админу"""
    def has_object_permission(self, request, view, obj):
        # Админы имеют доступ ко всему
        if request.user.is_staff:
            return True

        # Проверяем владельца в зависимости от типа объекта
        if hasattr(obj, 'user'):
            return obj.user == request.user
        elif hasattr(obj, 'passenger'):
            return obj.passenger.user == request.user
        elif hasattr(obj, 'driver'):
            return obj.driver.user == request.user

        return False

