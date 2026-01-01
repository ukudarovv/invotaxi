import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from geo.models import Coordinate


class Geo:
    """Сервис для геолокационных расчетов"""
    # Радиус Земли в метрах
    EARTH_RADIUS_M = 6371000

    @staticmethod
    def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Вычисляет расстояние между двумя координатами по формуле Haversine
        Возвращает расстояние в метрах
        """
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat_rad = math.radians(lat2 - lat1)
        delta_lon_rad = math.radians(lon2 - lon1)

        a = (math.sin(delta_lat_rad / 2) ** 2 +
             math.cos(lat1_rad) * math.cos(lat2_rad) *
             math.sin(delta_lon_rad / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return Geo.EARTH_RADIUS_M * c


class GeofenceService:
    """Сервис для работы с геозонами"""
    RADIUS_METERS = 80.0

    @staticmethod
    def is_inside_geofence(lat1: float, lon1: float, lat2: float, lon2: float) -> bool:
        """
        Проверяет, находится ли точка внутри геозоны
        """
        distance = Geo.calculate_distance(lat1, lon1, lat2, lon2)
        return distance <= GeofenceService.RADIUS_METERS

