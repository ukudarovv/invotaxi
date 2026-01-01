"""
Вспомогательные функции
"""
import re
from typing import Optional


def clean_phone(phone: str) -> str:
    """Очищает номер телефона от форматирования"""
    return re.sub(r'[^\d+]', '', phone)


def format_phone(phone: str) -> str:
    """Форматирует номер телефона в стандартный вид"""
    cleaned = clean_phone(phone)
    if cleaned.startswith('+7'):
        if len(cleaned) == 12:  # +7XXXXXXXXXX
            return f'+7 ({cleaned[2:5]}) {cleaned[5:8]}-{cleaned[8:10]}-{cleaned[10:12]}'
    return phone


def validate_phone(phone: str) -> bool:
    """Проверяет валидность номера телефона"""
    cleaned = clean_phone(phone)
    # Российские номера: +7 и 10 цифр
    if cleaned.startswith('+7') and len(cleaned) == 12:
        return True
    # Или 11 цифр начинающихся с 7 или 8
    if len(cleaned) == 11 and cleaned[0] in ['7', '8']:
        return True
    return False


def calculate_eta(distance_meters: float, avg_speed_kmh: float = 40.0) -> int:
    """
    Вычисляет примерное время прибытия в минутах
    """
    if distance_meters <= 0 or avg_speed_kmh <= 0:
        return 0
    
    # Конвертируем скорость в м/с
    speed_ms = (avg_speed_kmh * 1000) / 3600
    # Время в секундах
    time_seconds = distance_meters / speed_ms
    # Время в минутах (округление вверх)
    time_minutes = int(time_seconds / 60) + (1 if time_seconds % 60 > 0 else 0)
    
    return time_minutes

