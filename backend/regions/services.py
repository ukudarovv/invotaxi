"""
Сервис для работы с регионами
"""
from typing import Optional
from .models import Region
from geo.services import Geo
import logging

logger = logging.getLogger(__name__)


def point_in_polygon(lat: float, lon: float, polygon: list) -> bool:
    """
    Проверяет, находится ли точка внутри полигона (point-in-polygon алгоритм Ray Casting)
    
    Args:
        lat: Широта точки
        lon: Долгота точки
        polygon: Массив координат [[lat, lon], ...] полигона
        
    Returns:
        True если точка внутри полигона, False иначе
    """
    if not polygon or len(polygon) < 3:
        return False
    
    n = len(polygon)
    inside = False
    
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if lon > min(p1y, p2y):
            if lon <= max(p1y, p2y):
                if lat <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (lon - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or lat <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    
    return inside


def get_region_by_coordinates(lat: float, lon: float) -> Optional[Region]:
    """
    Определяет регион по координатам
    
    Сначала проверяет через полигон (polygon_coordinates), 
    затем через радиус обслуживания (service_radius_meters)
    
    Args:
        lat: Широта точки
        lon: Долгота точки
        
    Returns:
        Region объект или None если регион не найден
    """
    if lat is None or lon is None:
        return None
    
    try:
        # Получаем все регионы
        regions = Region.objects.all()
        
        # Сначала проверяем полигоны
        for region in regions:
            if region.polygon_coordinates:
                try:
                    polygon = region.polygon_coordinates
                    if isinstance(polygon, list) and len(polygon) >= 3:
                        if point_in_polygon(lat, lon, polygon):
                            logger.debug(f'Точка ({lat}, {lon}) найдена в регионе {region.id} по полигону')
                            return region
                except Exception as e:
                    logger.warning(f'Ошибка проверки полигона для региона {region.id}: {e}')
                    continue
        
        # Затем проверяем радиус обслуживания
        for region in regions:
            if region.service_radius_meters:
                try:
                    distance = Geo.calculate_distance(
                        lat, lon,
                        region.center_lat, region.center_lon
                    )
                    if distance <= region.service_radius_meters:
                        logger.debug(f'Точка ({lat}, {lon}) найдена в регионе {region.id} по радиусу ({distance:.0f}m <= {region.service_radius_meters}m)')
                        return region
                except Exception as e:
                    logger.warning(f'Ошибка проверки радиуса для региона {region.id}: {e}')
                    continue
        
        logger.debug(f'Точка ({lat}, {lon}) не найдена ни в одном регионе')
        return None
        
    except Exception as e:
        logger.error(f'Ошибка определения региона по координатам ({lat}, {lon}): {e}')
        return None
