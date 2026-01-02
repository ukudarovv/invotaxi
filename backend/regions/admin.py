from django.contrib import admin
from .models import Region, City


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'center_lat', 'center_lon']
    search_fields = ['title', 'id']


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'city', 'center_lat', 'center_lon']
    search_fields = ['title', 'id', 'city__title']
    list_filter = ['city']

