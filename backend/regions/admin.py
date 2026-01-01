from django.contrib import admin
from .models import Region


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'center_lat', 'center_lon']
    search_fields = ['title', 'id']

