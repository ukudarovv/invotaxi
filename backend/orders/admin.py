from django.contrib import admin
from .models import Order, OrderEvent, PricingConfig


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'passenger', 'driver', 'status', 'pickup_title',
        'estimated_price', 'final_price', 'desired_pickup_time', 'created_at'
    ]
    list_filter = ['status', 'created_at', 'desired_pickup_time']
    search_fields = ['id', 'passenger__full_name', 'driver__name', 'pickup_title']
    readonly_fields = ['created_at', 'assigned_at', 'completed_at']
    date_hierarchy = 'created_at'
    fieldsets = (
        ('Основная информация', {
            'fields': ('id', 'passenger', 'driver', 'status')
        }),
        ('Маршрут', {
            'fields': ('pickup_title', 'pickup_lat', 'pickup_lon', 'dropoff_title', 'dropoff_lat', 'dropoff_lon')
        }),
        ('Детали поездки', {
            'fields': ('desired_pickup_time', 'has_companion', 'note', 'video_recording', 'upload_started')
        }),
        ('Расчет цены', {
            'fields': ('distance_km', 'waiting_time_minutes', 'estimated_price', 'final_price', 'price_breakdown')
        }),
        ('Временные метки', {
            'fields': ('created_at', 'assigned_at', 'completed_at'),
            'classes': ('collapse',)
        }),
        ('Причины', {
            'fields': ('assignment_reason', 'rejection_reason'),
            'classes': ('collapse',)
        }),
    )


@admin.register(PricingConfig)
class PricingConfigAdmin(admin.ModelAdmin):
    list_display = ['region', 'price_per_km', 'minimum_fare', 'is_active', 'created_at']
    list_filter = ['is_active', 'region', 'created_at']
    search_fields = ['region__title']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Основные параметры', {
            'fields': ('region', 'is_active')
        }),
        ('Тарифы', {
            'fields': ('price_per_km', 'price_per_minute_waiting', 'minimum_fare', 'companion_fee')
        }),
        ('Множители', {
            'fields': ('disability_category_multiplier', 'night_time_multiplier', 'weekend_multiplier')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(OrderEvent)
class OrderEventAdmin(admin.ModelAdmin):
    list_display = ['order', 'status_from', 'status_to', 'created_at']
    list_filter = ['status_to', 'created_at']
    search_fields = ['order__id']
    readonly_fields = ['created_at']
    date_hierarchy = 'created_at'

