from django.contrib import admin
from .models import Region, City, District


@admin.register(District)
class DistrictAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'center_lat', 'center_lon']
    search_fields = ['title', 'id']


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'district', 'center_lat', 'center_lon']
    search_fields = ['title', 'id']
    list_filter = ['district']


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'city', 'center_lat', 'center_lon']
    search_fields = ['title', 'id', 'city__title']
    list_filter = ['city']

