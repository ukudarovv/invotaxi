"""
Вспомогательные функции для работы с регионами и расчетов бонусов
"""
from typing import List, Optional, Dict
from django.utils import timezone
from datetime import timedelta
import logging

from accounts.models import Driver
from orders.models import Order
from regions.models import Region, City
from regions.services import get_region_by_coordinates

logger = logging.getLogger(__name__)


def assign_regions_to_orders(orders: List[Order]) -> List[Order]:
    """
    Назначает регионы заказам по координатам pickup
    Если регион не определен, использует регион пассажира
    """
    for order in orders:
        if not hasattr(order, 'pickup_region') or order.pickup_region is None:
            if order.pickup_lat and order.pickup_lon:
                try:
                    region = get_region_by_coordinates(order.pickup_lat, order.pickup_lon)
                    if region:
                        # Сохраняем регион в атрибут (если есть поле в модели)
                        if hasattr(order, '_pickup_region'):
                            order._pickup_region = region
                        logger.debug(f'Регион назначен заказу {order.id}: {region.id}')
                except Exception as e:
                    logger.warning(f'Ошибка определения региона для заказа {order.id}: {e}')
    
    return orders


def is_city_driver(driver: Driver) -> bool:
    """
    Проверяет, является ли водитель городским
    Городские водители - это водители из города (не отдаленные регионы)
    """
    if not driver.region:
        return False
    
    # Проверяем через city - если есть город, то это городской водитель
    if hasattr(driver.region, 'city') and driver.region.city:
        # Можно добавить дополнительную логику для определения отдаленных регионов
        return True
    
    return True  # По умолчанию считаем городским


def is_remote_driver(driver: Driver) -> bool:
    """
    Проверяет, является ли водитель отдаленным
    Отдаленные водители - это водители из отдаленных регионов
    """
    return not is_city_driver(driver)


def get_driver_current_orders(driver_id: int, routes_dict: Dict[int, List[Order]]) -> List[Order]:
    """
    Получает текущие заказы водителя из словаря маршрутов
    """
    return routes_dict.get(driver_id, [])


def calculate_load_bonus(
    driver_id: int,
    routes_dict: Dict[int, List[Order]],
    params,
    multiplier: Optional[float] = None
) -> float:
    """
    Рассчитывает бонус за недогруженность водителя
    
    Формула:
    - Водители без заказов: 500 минут
    - Водители с 1 заказом: 700 × multiplier минут
    - Водители с 2 заказами: 450 × multiplier минут
    - Водители с 3 заказами: (4 - load) × 30 × multiplier минут
    - Водители с 4-10 заказами: (max_orders - load) × 5 минут
    - Водители с 11+ заказами: base_bonus × 0.5
    """
    if multiplier is None:
        multiplier = params.underload_bonus_multiplier
    
    current_orders = get_driver_current_orders(driver_id, routes_dict)
    load = len(current_orders)
    max_orders = params.max_orders_per_driver
    
    if load == 0:
        return params.zero_load_driver_bonus
    elif load == 1:
        return 700.0 * multiplier
    elif load == 2:
        return 450.0 * multiplier
    elif load == 3:
        return (4 - load) * 30.0 * multiplier
    elif 4 <= load <= 10:
        base_bonus = (max_orders - load) * 5.0
        return base_bonus
    else:  # load >= 11
        base_bonus = (max_orders - load) * 5.0
        return base_bonus * 0.5


def calculate_region_bonus(
    driver_id: int,
    order: Order,
    routes_dict: Dict[int, List[Order]],
    params,
    driver: Optional[Driver] = None
) -> float:
    """
    Рассчитывает бонус за совпадение региона водителя и заказа
    
    Формула:
    - Базовый бонус: 80 минут за совпадение региона
    - Дополнительный бонус для недогруженных водителей: (6 - load) × 10 минут
    """
    if driver is None:
        try:
            driver = Driver.objects.get(id=driver_id)
        except Driver.DoesNotExist:
            return 0.0
    
    # Получаем регион заказа
    order_region = None
    if hasattr(order, 'pickup_region') and order.pickup_region:
        order_region = order.pickup_region
    elif hasattr(order, 'passenger') and order.passenger and hasattr(order.passenger, 'region'):
        order_region = order.passenger.region
    
    # Получаем регион водителя
    driver_region = driver.region
    
    if not order_region or not driver_region:
        return 0.0
    
    # Проверяем совпадение регионов
    if order_region.id == driver_region.id:
        base_bonus = 80.0
        
        # Дополнительный бонус для недогруженных водителей
        current_orders = get_driver_current_orders(driver_id, routes_dict)
        load = len(current_orders)
        if load < 6:
            additional_bonus = (6 - load) * 10.0
            return base_bonus + additional_bonus
        
        return base_bonus
    
    return 0.0


def calculate_city_bonus(
    driver_id: int,
    routes_dict: Dict[int, List[Order]],
    params,
    driver: Optional[Driver] = None,
    regions_df=None
) -> float:
    """
    Рассчитывает бонус для городских водителей
    
    Формула:
    - Дополнительный бонус 150 минут для городских водителей с ≤ 5 заказами
    """
    if not is_city_driver(driver) if driver else False:
        return 0.0
    
    if driver is None:
        try:
            driver = Driver.objects.get(id=driver_id)
        except Driver.DoesNotExist:
            return 0.0
    
    if not is_city_driver(driver):
        return 0.0
    
    current_orders = get_driver_current_orders(driver_id, routes_dict)
    load = len(current_orders)
    
    if load <= 5:
        return params.city_driver_load_balance_bonus
    
    return 0.0


def is_order_in_driver_region(order: Order, driver: Driver) -> bool:
    """
    Проверяет, находится ли заказ в регионе водителя
    """
    order_region = None
    if hasattr(order, 'pickup_region') and order.pickup_region:
        order_region = order.pickup_region
    elif hasattr(order, 'passenger') and order.passenger and hasattr(order.passenger, 'region'):
        order_region = order.passenger.region
    
    if not order_region or not driver.region:
        return False
    
    return order_region.id == driver.region.id


def is_order_in_remote_region(order: Order) -> bool:
    """
    Проверяет, находится ли заказ в отдаленном регионе
    """
    order_region = None
    if hasattr(order, 'pickup_region') and order.pickup_region:
        order_region = order.pickup_region
    elif hasattr(order, 'passenger') and order.passenger and hasattr(order.passenger, 'region'):
        order_region = order.passenger.region
    
    if not order_region:
        return False
    
    # Проверяем через city - если нет города или это отдаленный регион
    if hasattr(order_region, 'city') and order_region.city:
        return False  # Городской регион
    
    return True  # По умолчанию считаем отдаленным, если нет города
