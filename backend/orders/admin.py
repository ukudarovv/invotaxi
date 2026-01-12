from django.contrib import admin
from .models import (
    Order, OrderEvent, PricingConfig, OrderOffer, DispatchConfig,
    SurgeZone, PriceBreakdown, CancelPolicy
)


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


@admin.register(OrderOffer)
class OrderOfferAdmin(admin.ModelAdmin):
    list_display = ['id', 'order', 'driver', 'status', 'created_at', 'expires_at', 'responded_at']
    list_filter = ['status', 'created_at', 'expires_at']
    search_fields = ['order__id', 'driver__name', 'driver__car_model']
    readonly_fields = ['created_at', 'responded_at']
    date_hierarchy = 'created_at'
    fieldsets = (
        ('Основная информация', {
            'fields': ('order', 'driver', 'status')
        }),
        ('Временные метки', {
            'fields': ('created_at', 'expires_at', 'responded_at')
        }),
        ('Данные для аналитики', {
            'fields': ('eta_seconds', 'distance_km', 'cost_score', 'selection_reason'),
            'classes': ('collapse',)
        }),
    )


@admin.register(DispatchConfig)
class DispatchConfigAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'eta_max_seconds', 'k_candidates', 'offer_timeout_seconds', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Основные параметры', {
            'fields': ('name', 'is_active')
        }),
        ('Параметры фильтрации', {
            'fields': ('eta_max_seconds', 'k_candidates', 'offer_timeout_seconds')
        }),
        ('Веса скоринга', {
            'fields': ('w_eta', 'w_deadhead', 'w_reject', 'w_cancel', 'w_fairness', 'w_zone', 'w_quality'),
            'description': 'Сумма весов должна быть примерно равна 1.0'
        }),
        ('Пороги и лимиты', {
            'fields': ('min_rating', 'max_offers_per_hour')
        }),
        ('Расширение поиска', {
            'fields': ('expand_search_after_seconds', 'expand_eta_multiplier')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(SurgeZone)
class SurgeZoneAdmin(admin.ModelAdmin):
    list_display = ['name', 'region', 'current_multiplier', 'smoothed_multiplier', 'demand_count', 'supply_count', 'last_updated', 'is_active']
    list_filter = ['is_active', 'region', 'last_updated']
    search_fields = ['name', 'region__title']
    readonly_fields = ['last_updated', 'created_at']
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'region', 'is_active')
        }),
        ('Геолокация', {
            'fields': ('center_lat', 'center_lon', 'radius_meters', 'polygon_coordinates')
        }),
        ('Surge метрики', {
            'fields': ('current_multiplier', 'smoothed_multiplier', 'demand_count', 'supply_count', 'last_updated')
        }),
        ('Системная информация', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )


@admin.register(PriceBreakdown)
class PriceBreakdownAdmin(admin.ModelAdmin):
    list_display = ['order', 'price_type', 'total', 'surge_multiplier', 'created_at']
    list_filter = ['price_type', 'created_at']
    search_fields = ['order__id']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'created_at'
    fieldsets = (
        ('Основная информация', {
            'fields': ('order', 'price_type')
        }),
        ('Базовые компоненты', {
            'fields': ('base_fare', 'distance_km', 'distance_cost', 'duration_min', 'duration_cost')
        }),
        ('Ожидание', {
            'fields': ('waiting_min', 'waiting_free_min', 'waiting_cost')
        }),
        ('Сборы', {
            'fields': ('booking_fee', 'companion_fee', 'zone_fees', 'options_fees', 'toll_fees')
        }),
        ('Множители', {
            'fields': ('night_multiplier', 'weekend_multiplier', 'disability_multiplier', 'surge_multiplier', 'surge_applied_to')
        }),
        ('Итоговые суммы', {
            'fields': ('subtotal_before_surge', 'subtotal_after_surge', 'minimum_fare_adjustment', 'total', 'rounding_applied')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(CancelPolicy)
class CancelPolicyAdmin(admin.ModelAdmin):
    list_display = ['name', 'region', 'cancel_before_assigned_fee', 'cancel_after_assigned_fee', 'cancel_after_arrived_fee', 'is_active']
    list_filter = ['is_active', 'region']
    search_fields = ['name', 'region__title']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'region', 'is_active')
        }),
        ('Отмена до назначения', {
            'fields': ('cancel_before_assigned_fee',)
        }),
        ('Отмена после назначения', {
            'fields': ('grace_cancel_seconds', 'cancel_after_assigned_fee')
        }),
        ('Отмена после прибытия', {
            'fields': ('cancel_after_arrived_fee', 'cancel_after_arrived_include_waiting')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

