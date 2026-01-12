from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Passenger, Driver, OTPCode, DriverStatistics


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'phone', 'role', 'email', 'is_staff']
    list_filter = ['role', 'is_staff', 'is_active']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Дополнительно', {'fields': ('phone', 'role')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Дополнительно', {'fields': ('phone', 'role')}),
    )


@admin.register(Passenger)
class PassengerAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'user', 'region', 'disability_category', 'allowed_companion']
    list_filter = ['region', 'disability_category', 'allowed_companion']
    search_fields = ['full_name', 'user__phone', 'user__username']


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'region', 'car_model', 'plate_number', 'is_online', 'status', 'rating', 'capacity']
    list_filter = ['region', 'is_online', 'status', 'capacity']
    search_fields = ['name', 'user__phone', 'car_model', 'plate_number']
    fieldsets = (
        ('Основная информация', {
            'fields': ('user', 'name', 'region', 'car_model', 'plate_number', 'capacity')
        }),
        ('Статус', {
            'fields': ('is_online', 'status', 'rating', 'idle_since')
        }),
        ('Геолокация', {
            'fields': ('current_lat', 'current_lon', 'last_location_update')
        }),
    )


@admin.register(DriverStatistics)
class DriverStatisticsAdmin(admin.ModelAdmin):
    list_display = ['driver', 'acceptance_rate', 'cancel_rate', 'orders_last_60min', 'offers_last_60min', 'last_updated']
    list_filter = ['last_updated']
    search_fields = ['driver__name', 'driver__car_model']
    readonly_fields = ['last_updated']
    fieldsets = (
        ('Водитель', {
            'fields': ('driver',)
        }),
        ('Метрики', {
            'fields': ('acceptance_rate', 'cancel_rate', 'orders_last_60min', 'offers_last_60min')
        }),
        ('Счетчики', {
            'fields': ('rejections_count', 'cancellations_count', 'no_shows_count')
        }),
        ('Системная информация', {
            'fields': ('last_updated',),
            'classes': ('collapse',)
        }),
    )


@admin.register(OTPCode)
class OTPCodeAdmin(admin.ModelAdmin):
    list_display = ['phone', 'code', 'created_at', 'is_used', 'expires_at']
    list_filter = ['is_used', 'created_at']
    search_fields = ['phone', 'code']
    readonly_fields = ['created_at']

