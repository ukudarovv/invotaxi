from django.contrib import admin
from .models import Order, OrderEvent


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'passenger', 'driver', 'status', 'pickup_title',
        'desired_pickup_time', 'created_at'
    ]
    list_filter = ['status', 'created_at', 'desired_pickup_time']
    search_fields = ['id', 'passenger__full_name', 'driver__name', 'pickup_title']
    readonly_fields = ['created_at', 'assigned_at', 'completed_at']
    date_hierarchy = 'created_at'


@admin.register(OrderEvent)
class OrderEventAdmin(admin.ModelAdmin):
    list_display = ['order', 'status_from', 'status_to', 'created_at']
    list_filter = ['status_to', 'created_at']
    search_fields = ['order__id']
    readonly_fields = ['created_at']
    date_hierarchy = 'created_at'

