"""
Валидаторы для заказов
"""
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import timedelta


def validate_pickup_time(value):
    """Валидирует желаемое время забора"""
    now = timezone.now()
    min_time = now + timedelta(hours=1)  # Минимум через час
    max_time = now + timedelta(days=30)  # Максимум через 30 дней
    
    if value < min_time:
        raise ValidationError('Время забора должно быть не менее чем через час')
    
    if value > max_time:
        raise ValidationError('Время забора не может быть более чем через 30 дней')


def validate_coordinates(lat, lon):
    """Валидирует координаты"""
    if not (-90 <= lat <= 90):
        raise ValidationError('Широта должна быть в диапазоне от -90 до 90')
    
    if not (-180 <= lon <= 180):
        raise ValidationError('Долгота должна быть в диапазоне от -180 до 180')

