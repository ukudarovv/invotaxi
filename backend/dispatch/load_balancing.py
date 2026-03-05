"""
Модуль балансировки нагрузки - перераспределение заказов между водителями
"""
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import logging

from accounts.models import Driver
from orders.models import Order
from dispatch.insertion import best_insertion
from dispatch.utils import get_driver_current_orders, is_order_in_driver_region
from dispatch.config import DispatchParams

logger = logging.getLogger(__name__)


def redistribute_overloaded_drivers(
    routes_dict: Dict[int, List[Order]],
    drivers: List[Driver],
    params: DispatchParams,
    start_time: datetime
) -> Tuple[Dict[int, List[Order]], List[Order]]:
    """
    Перераспределяет заказы от перегруженных водителей другим водителям.
    
    Args:
        routes_dict: Словарь маршрутов {driver_id: [order_series, ...]}
        drivers: Список всех водителей
        params: Параметры алгоритма
        start_time: Время начала работы
    
    Returns:
        Обновленный routes_dict и список перераспределенных заказов
    """
    if not params.enable_load_balancing:
        return routes_dict, []
    
    redistributed_orders = []
    max_orders = params.max_orders_per_driver
    
    # Находим перегруженных водителей
    overloaded_drivers = []
    for driver in drivers:
        current_orders = get_driver_current_orders(driver.id, routes_dict)
        if len(current_orders) > max_orders:
            overloaded_drivers.append((driver, current_orders))
    
    if not overloaded_drivers:
        return routes_dict, []
    
    logger.info(f'Найдено перегруженных водителей: {len(overloaded_drivers)}')
    
    # Перераспределяем избыточные заказы
    for driver, current_orders in overloaded_drivers:
        excess_count = len(current_orders) - max_orders
        excess_orders = current_orders[-excess_count:]  # Берем последние заказы
        
        for order in excess_orders:
            # Удаляем заказ из маршрута водителя
            routes_dict[driver.id] = [
                o for o in routes_dict.get(driver.id, []) if o.id != order.id
            ]
            
            # Пытаемся найти другого водителя
            best_driver = _find_best_driver_for_order(
                order, drivers, routes_dict, params, start_time, exclude_driver_id=driver.id
            )
            
            if best_driver:
                # Добавляем заказ новому водителю
                if best_driver.id not in routes_dict:
                    routes_dict[best_driver.id] = []
                routes_dict[best_driver.id].append(order)
                redistributed_orders.append(order)
                logger.info(f'Заказ {order.id} перераспределен от водителя {driver.id} к {best_driver.id}')
            else:
                # Не удалось найти водителя - возвращаем заказ обратно
                routes_dict[driver.id].append(order)
                logger.warning(f'Не удалось перераспределить заказ {order.id}')
    
    return routes_dict, redistributed_orders


def redistribute_underloaded_drivers(
    routes_dict: Dict[int, List[Order]],
    drivers: List[Driver],
    params: DispatchParams,
    start_time: datetime
) -> Tuple[Dict[int, List[Order]], int]:
    """
    Догружает недогруженных водителей заказами от перегруженных.
    
    Args:
        routes_dict: Словарь маршрутов
        drivers: Список всех водителей
        params: Параметры алгоритма
        start_time: Время начала работы
    
    Returns:
        Обновленный routes_dict и количество перераспределенных заказов
    """
    if not params.enable_load_balancing:
        return routes_dict, 0
    
    underload_threshold = params.max_orders_per_driver // 2  # Например, 10 для max_orders=20
    max_orders = params.max_orders_per_driver
    
    # Находим недогруженных и перегруженных водителей
    underloaded_drivers = []
    overloaded_drivers = []
    
    for driver in drivers:
        current_orders = get_driver_current_orders(driver.id, routes_dict)
        load = len(current_orders)
        
        if load < underload_threshold:
            underloaded_drivers.append((driver, load))
        elif load > max_orders:
            overloaded_drivers.append((driver, current_orders))
    
    if not underloaded_drivers or not overloaded_drivers:
        return routes_dict, 0
    
    logger.info(f'Недогруженных водителей: {len(underloaded_drivers)}, перегруженных: {len(overloaded_drivers)}')
    
    redistributed_count = 0
    
    # Перераспределяем заказы
    for driver, load in underloaded_drivers:
        target_load = underload_threshold
        
        while load < target_load and overloaded_drivers:
            # Находим лучший заказ для перераспределения
            best_order = None
            best_overloaded_driver = None
            
            for overloaded_driver, orders in overloaded_drivers:
                # Приоритет заказам из региона водителя
                for order in orders:
                    if is_order_in_driver_region(order, driver):
                        best_order = order
                        best_overloaded_driver = overloaded_driver
                        break
                
                if best_order:
                    break
            
            # Если не нашли заказ из региона, берем любой
            if not best_order:
                for overloaded_driver, orders in overloaded_drivers:
                    if orders:
                        best_order = orders[-1]  # Берем последний заказ
                        best_overloaded_driver = overloaded_driver
                        break
            
            if best_order and best_overloaded_driver:
                # Удаляем заказ у перегруженного водителя
                routes_dict[best_overloaded_driver.id] = [
                    o for o in routes_dict.get(best_overloaded_driver.id, [])
                    if o.id != best_order.id
                ]
                
                # Добавляем заказ недогруженному водителю
                if driver.id not in routes_dict:
                    routes_dict[driver.id] = []
                routes_dict[driver.id].append(best_order)
                
                load += 1
                redistributed_count += 1
                
                # Обновляем список перегруженных водителей
                updated_orders = get_driver_current_orders(best_overloaded_driver.id, routes_dict)
                if len(updated_orders) <= max_orders:
                    overloaded_drivers = [
                        (d, o) for d, o in overloaded_drivers
                        if d.id != best_overloaded_driver.id
                    ]
                else:
                    # Обновляем список заказов
                    overloaded_drivers = [
                        (d, updated_orders) if d.id == best_overloaded_driver.id else (d, o)
                        for d, o in overloaded_drivers
                    ]
                
                logger.debug(f'Заказ {best_order.id} перераспределен к водителю {driver.id}')
            else:
                break
    
    return routes_dict, redistributed_count


def assign_unassigned_to_underloaded(
    unassigned_orders: List[Order],
    routes_dict: Dict[int, List[Order]],
    drivers: List[Driver],
    params: DispatchParams,
    start_time: datetime
) -> Tuple[Dict[int, List[Order]], List[Order]]:
    """
    Назначает нераспределенные заказы недогруженным водителям.
    
    Args:
        unassigned_orders: Список неназначенных заказов
        routes_dict: Словарь маршрутов
        drivers: Список всех водителей
        params: Параметры алгоритма
        start_time: Время начала работы
    
    Returns:
        Обновленный routes_dict и список оставшихся неназначенных заказов
    """
    if not unassigned_orders:
        return routes_dict, []
    
    underload_threshold = params.max_orders_per_driver // 2
    remaining_unassigned = []
    
    # Находим недогруженных водителей
    underloaded_drivers = []
    for driver in drivers:
        if not driver.is_online:
            continue
        
        current_orders = get_driver_current_orders(driver.id, routes_dict)
        load = len(current_orders)
        
        if load < underload_threshold:
            underloaded_drivers.append((driver, load))
    
    if not underloaded_drivers:
        return routes_dict, unassigned_orders
    
    logger.info(f'Попытка назначить {len(unassigned_orders)} заказов {len(underloaded_drivers)} недогруженным водителям')
    
    # Используем ослабленные региональные ограничения
    relaxed_params = DispatchParams(
        **params.to_dict(),
        allow_city_drivers_to_remote_regions=True,
        allow_remote_driver_first_order_outside_region=True,
        zero_load_driver_region_penalty_multiplier=0.5
    )
    
    for order in unassigned_orders:
        best_driver = _find_best_driver_for_order(
            order, underloaded_drivers, routes_dict, relaxed_params, start_time
        )
        
        if best_driver:
            if best_driver.id not in routes_dict:
                routes_dict[best_driver.id] = []
            routes_dict[best_driver.id].append(order)
            logger.info(f'Нераспределенный заказ {order.id} назначен водителю {best_driver.id}')
        else:
            remaining_unassigned.append(order)
    
    return routes_dict, remaining_unassigned


def assign_orders_to_zero_load_drivers(
    unassigned_orders: List[Order],
    routes_dict: Dict[int, List[Order]],
    drivers: List[Driver],
    params: DispatchParams,
    start_time: datetime
) -> Tuple[Dict[int, List[Order]], List[Order]]:
    """
    Назначает заказы водителям без заказов.
    
    Args:
        unassigned_orders: Список неназначенных заказов
        routes_dict: Словарь маршрутов
        drivers: Список всех водителей
        params: Параметры алгоритма
        start_time: Время начала работы
    
    Returns:
        Обновленный routes_dict и список оставшихся неназначенных заказов
    """
    if not unassigned_orders:
        return routes_dict, []
    
    # Находим водителей без заказов
    zero_load_drivers = []
    for driver in drivers:
        if not driver.is_online:
            continue
        
        current_orders = get_driver_current_orders(driver.id, routes_dict)
        if len(current_orders) == 0:
            zero_load_drivers.append(driver)
    
    if not zero_load_drivers:
        return routes_dict, unassigned_orders
    
    logger.info(f'Попытка назначить {len(unassigned_orders)} заказов {len(zero_load_drivers)} водителям без заказов')
    
    # Используем очень ослабленные ограничения
    very_relaxed_params = DispatchParams(
        **params.to_dict(),
        allow_city_drivers_to_remote_regions=True,
        allow_remote_driver_first_order_outside_region=True,
        zero_load_driver_region_penalty_multiplier=0.1
    )
    
    remaining_unassigned = []
    
    # Приоритет заказам из региона водителя
    for driver in zero_load_drivers:
        # Сначала ищем заказы из региона водителя
        region_orders = [
            order for order in unassigned_orders
            if is_order_in_driver_region(order, driver)
        ]
        
        # Затем остальные заказы
        other_orders = [
            order for order in unassigned_orders
            if not is_order_in_driver_region(order, driver)
        ]
        
        orders_to_try = region_orders + other_orders
        
        for order in orders_to_try:
            if order in remaining_unassigned:
                continue
            
            # Проверяем базовые условия
            if driver.capacity < order.seats_needed:
                continue
            
            # Пытаемся добавить заказ
            if driver.id not in routes_dict:
                routes_dict[driver.id] = []
            
            routes_dict[driver.id].append(order)
            logger.info(f'Заказ {order.id} назначен водителю без заказов {driver.id}')
            break
    
    # Оставшиеся заказы
    assigned_order_ids = set()
    for driver_id, orders in routes_dict.items():
        for order in orders:
            assigned_order_ids.add(order.id)
    
    remaining_unassigned = [
        order for order in unassigned_orders
        if order.id not in assigned_order_ids
    ]
    
    return routes_dict, remaining_unassigned


def aggressive_redistribute_to_zero_load_drivers(
    routes_dict: Dict[int, List[Order]],
    drivers: List[Driver],
    params: DispatchParams,
    start_time: datetime
) -> Tuple[Dict[int, List[Order]], int]:
    """
    Агрессивно перераспределяет заказы от перегруженных водителей к водителям без заказов.
    
    Args:
        routes_dict: Словарь маршрутов
        drivers: Список всех водителей
        params: Параметры алгоритма
        start_time: Время начала работы
    
    Returns:
        Обновленный routes_dict и количество перераспределенных заказов
    """
    # Находим водителей без заказов
    zero_load_drivers = []
    for driver in drivers:
        if not driver.is_online:
            continue
        
        current_orders = get_driver_current_orders(driver.id, routes_dict)
        if len(current_orders) == 0:
            zero_load_drivers.append(driver)
    
    if not zero_load_drivers:
        return routes_dict, 0
    
    # Находим перегруженных водителей
    overloaded_drivers = []
    for driver in drivers:
        current_orders = get_driver_current_orders(driver.id, routes_dict)
        if len(current_orders) > params.max_orders_per_driver:
            overloaded_drivers.append((driver, current_orders))
    
    if not overloaded_drivers:
        return routes_dict, 0
    
    logger.info(f'Агрессивное перераспределение: {len(zero_load_drivers)} водителей без заказов, {len(overloaded_drivers)} перегруженных')
    
    redistributed_count = 0
    target_orders_per_driver = min(5, params.max_orders_per_driver // 4)  # Цель: 5-8 заказов
    
    for driver in zero_load_drivers:
        target_count = target_orders_per_driver
        
        while len(get_driver_current_orders(driver.id, routes_dict)) < target_count and overloaded_drivers:
            # Берем заказ у самого перегруженного водителя
            overloaded_drivers.sort(key=lambda x: len(x[1]), reverse=True)
            overloaded_driver, orders = overloaded_drivers[0]
            
            if not orders:
                overloaded_drivers.pop(0)
                continue
            
            # Берем последний заказ
            order = orders[-1]
            
            # Удаляем заказ у перегруженного водителя
            routes_dict[overloaded_driver.id] = [
                o for o in routes_dict.get(overloaded_driver.id, [])
                if o.id != order.id
            ]
            
            # Добавляем заказ водителю без заказов
            if driver.id not in routes_dict:
                routes_dict[driver.id] = []
            routes_dict[driver.id].append(order)
            
            redistributed_count += 1
            
            # Обновляем список перегруженных водителей
            updated_orders = get_driver_current_orders(overloaded_driver.id, routes_dict)
            if len(updated_orders) <= params.max_orders_per_driver:
                overloaded_drivers.pop(0)
            else:
                overloaded_drivers[0] = (overloaded_driver, updated_orders)
            
            logger.debug(f'Заказ {order.id} перераспределен от {overloaded_driver.id} к {driver.id}')
    
    return routes_dict, redistributed_count


def final_load_balancing(
    routes_dict: Dict[int, List[Order]],
    drivers: List[Driver],
    params: DispatchParams
) -> Dict[int, List[Order]]:
    """
    Финальная балансировка нагрузки - обеспечивает равномерное распределение заказов.
    
    Args:
        routes_dict: Словарь маршрутов
        drivers: Список всех водителей
        params: Параметры алгоритма
    
    Returns:
        Обновленный routes_dict
    """
    if not params.enable_final_load_balancing:
        return routes_dict
    
    max_imbalance = params.max_load_imbalance
    
    # Рассчитываем загрузку каждого водителя
    driver_loads = {}
    for driver in drivers:
        if not driver.is_online:
            continue
        current_orders = get_driver_current_orders(driver.id, routes_dict)
        driver_loads[driver.id] = len(current_orders)
    
    if not driver_loads:
        return routes_dict
    
    # Находим максимальную и минимальную загрузку
    loads = list(driver_loads.values())
    if not loads:
        return routes_dict
    
    max_load = max(loads)
    min_load = min(loads)
    
    # Проверяем, нужна ли балансировка
    if max_load - min_load <= max_imbalance:
        return routes_dict
    
    logger.info(f'Финальная балансировка: max_load={max_load}, min_load={min_load}, imbalance={max_load - min_load}')
    
    # Перераспределяем заказы
    while max_load - min_load > max_imbalance:
        # Находим водителя с максимальной загрузкой
        max_driver_id = max(driver_loads.items(), key=lambda x: x[1])[0]
        max_driver = next(d for d in drivers if d.id == max_driver_id)
        max_orders = routes_dict.get(max_driver_id, [])
        
        if not max_orders:
            break
        
        # Берем последний заказ
        order_to_move = max_orders[-1]
        
        # Находим водителя с минимальной загрузкой
        min_driver_id = min(driver_loads.items(), key=lambda x: x[1])[0]
        min_driver = next(d for d in drivers if d.id == min_driver_id)
        
        # Проверяем базовые условия
        if min_driver.capacity < order_to_move.seats_needed:
            # Пропускаем этого водителя, ищем следующего
            driver_loads[min_driver_id] = float('inf')
            continue
        
        # Перемещаем заказ
        routes_dict[max_driver_id] = [
            o for o in routes_dict.get(max_driver_id, [])
            if o.id != order_to_move.id
        ]
        
        if min_driver_id not in routes_dict:
            routes_dict[min_driver_id] = []
        routes_dict[min_driver_id].append(order_to_move)
        
        # Обновляем загрузку
        driver_loads[max_driver_id] -= 1
        driver_loads[min_driver_id] += 1
        
        max_load = max(driver_loads.values())
        min_load = min(driver_loads.values())
        
        logger.debug(f'Заказ {order_to_move.id} перемещен от {max_driver_id} к {min_driver_id}')
    
    return routes_dict


def _find_best_driver_for_order(
    order: Order,
    drivers: List[Driver],
    routes_dict: Dict[int, List[Order]],
    params: DispatchParams,
    start_time: datetime,
    exclude_driver_id: Optional[int] = None
) -> Optional[Driver]:
    """
    Находит лучшего водителя для заказа (вспомогательная функция)
    """
    best_driver = None
    best_cost = float('inf')
    
    for driver in drivers:
        if exclude_driver_id and driver.id == exclude_driver_id:
            continue
        
        if not driver.is_online:
            continue
        
        if driver.capacity < order.seats_needed:
            continue
        
        if driver.current_lat is None or driver.current_lng is None:
            continue
        
        current_route = get_driver_current_orders(driver.id, routes_dict)
        
        if len(current_route) >= params.max_orders_per_driver:
            continue
        
        # Используем best_insertion для оценки
        try:
            _, _, cost, _ = best_insertion(
                driver, current_route, order, start_time, params
            )
            
            if cost < best_cost:
                best_cost = cost
                best_driver = driver
        except Exception as e:
            logger.warning(f'Ошибка при оценке водителя {driver.id} для заказа {order.id}: {e}')
            continue
    
    return best_driver
