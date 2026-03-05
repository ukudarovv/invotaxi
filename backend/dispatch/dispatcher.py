"""
Обновленный диспетчер - назначение заказов водителям с использованием Best Insertion
"""
from typing import List, Optional, Dict, Tuple
from datetime import datetime
import pandas as pd
import logging

from accounts.models import Driver
from orders.models import Order
from dispatch.insertion import best_insertion
from dispatch.utils import (
    calculate_load_bonus,
    calculate_region_bonus,
    calculate_city_bonus,
    get_driver_current_orders,
    is_order_in_driver_region
)
from dispatch.config import DispatchParams

logger = logging.getLogger(__name__)


def assign_order(
    drivers: List[Driver],
    routes_dict: Dict[int, List[Order]],
    new_order: Order,
    start_time: datetime,
    params: Optional[DispatchParams] = None,
    regions_df: Optional[pd.DataFrame] = None
) -> Dict:
    """
    Назначает новый заказ лучшему доступному водителю.
    
    Args:
        drivers: Список всех водителей (или QuerySet Driver)
        routes_dict: Словарь текущих маршрутов {driver_id: [order_series, ...]}
        new_order: Новый заказ (Order объект)
        start_time: Текущее время
        params: Параметры алгоритма
        params: Параметры алгоритма
        regions_df: DataFrame с регионами (опционально)
    
    Returns:
        Словарь с ключами:
        - chosen_driver_id: ID выбранного водителя (int или None)
        - insert_position: Позиция вставки в маршрут (int или None)
        - schedule_df: Расписание маршрута (DataFrame или None)
        - debug_table: Таблица всех кандидатов с их стоимостями (DataFrame)
    """
    if params is None:
        params = DispatchParams.get_default()
    
    debug_rows = []
    best_driver_id = None
    best_position = None
    best_schedule_df = None
    best_cost = float('inf')
    
    # Фильтрация кандидатов
    candidates = _filter_candidates(drivers, new_order, routes_dict, params)
    
    if not candidates:
        logger.warning(f'Не найдено кандидатов для заказа {new_order.id}')
        return {
            'chosen_driver_id': None,
            'insert_position': None,
            'schedule_df': None,
            'debug_table': pd.DataFrame(debug_rows)
        }
    
    logger.info(f'Найдено {len(candidates)} кандидатов для заказа {new_order.id}')
    
    # Поиск лучшей позиции вставки для каждого кандидата
    for driver in candidates:
        driver_id = driver.id
        current_route = get_driver_current_orders(driver_id, routes_dict)
        
        try:
            # Поиск лучшей позиции вставки
            position, schedule_df, cost, debug_info = best_insertion(
                driver=driver,
                current_route=current_route,
                new_order=new_order,
                start_time=start_time,
                params=params,
                regions_df=regions_df
            )
            
            if position is None:
                debug_rows.append({
                    'driver_id': driver_id,
                    'driver_name': driver.name,
                    'cost': float('inf'),
                    'position': None,
                    'reason': debug_info.get('reason', 'no_valid_position'),
                    'load_bonus': 0.0,
                    'region_bonus': 0.0,
                    'city_bonus': 0.0,
                    'final_cost': float('inf')
                })
                continue
            
            # Расчет бонусов для балансировки нагрузки
            load_bonus = calculate_load_bonus(
                driver_id, routes_dict, params
            )
            
            region_bonus = calculate_region_bonus(
                driver_id, new_order, routes_dict, params, driver
            )
            
            city_bonus = calculate_city_bonus(
                driver_id, routes_dict, params, driver, regions_df
            )
            
            # Итоговая стоимость (меньше = лучше)
            final_cost = cost - load_bonus - region_bonus - city_bonus
            
            debug_rows.append({
                'driver_id': driver_id,
                'driver_name': driver.name,
                'cost': cost,
                'position': position,
                'load_bonus': load_bonus,
                'region_bonus': region_bonus,
                'city_bonus': city_bonus,
                'final_cost': final_cost,
                'current_load': len(current_route),
                'reason': 'valid'
            })
            
            # Обновление лучшего водителя
            if final_cost < best_cost:
                best_driver_id = driver_id
                best_position = position
                best_schedule_df = schedule_df
                best_cost = final_cost
                
                logger.debug(
                    f'Найден лучший водитель {driver_id} со стоимостью {final_cost:.2f} '
                    f'(базовая: {cost:.2f}, бонусы: {load_bonus + region_bonus + city_bonus:.2f})'
                )
        
        except Exception as e:
            logger.error(f'Ошибка при оценке водителя {driver_id} для заказа {new_order.id}: {e}')
            debug_rows.append({
                'driver_id': driver_id,
                'driver_name': driver.name,
                'cost': float('inf'),
                'position': None,
                'reason': f'error: {str(e)}',
                'load_bonus': 0.0,
                'region_bonus': 0.0,
                'city_bonus': 0.0,
                'final_cost': float('inf')
            })
            continue
    
    # Создание таблицы отладки
    debug_table = pd.DataFrame(debug_rows)
    if not debug_table.empty:
        debug_table = debug_table.sort_values('final_cost')
    
    result = {
        'chosen_driver_id': best_driver_id,
        'insert_position': best_position,
        'schedule_df': best_schedule_df,
        'debug_table': debug_table
    }
    
    if best_driver_id:
        logger.info(
            f'Заказ {new_order.id} назначен водителю {best_driver_id} '
            f'на позицию {best_position} со стоимостью {best_cost:.2f}'
        )
    else:
        logger.warning(f'Не удалось назначить заказ {new_order.id}')
    
    return result


def _filter_candidates(
    drivers: List[Driver],
    order: Order,
    routes_dict: Dict[int, List[Order]],
    params: DispatchParams
) -> List[Driver]:
    """
    Фильтрует водителей по базовым условиям.
    
    Args:
        drivers: Список всех водителей
        order: Заказ
        routes_dict: Словарь маршрутов
        params: Параметры алгоритма
    
    Returns:
        Список отфильтрованных водителей
    """
    candidates = []
    
    for driver in drivers:
        # a) Статус водителя
        if not driver.is_online:
            continue
        
        # b) Вместимость
        if driver.capacity < order.seats_needed:
            continue
        
        # c) Локация
        if driver.current_lat is None or driver.current_lng is None:
            continue
        
        # d) Лимит заказов
        current_orders = get_driver_current_orders(driver.id, routes_dict)
        if len(current_orders) >= params.max_orders_per_driver:
            continue
        
        # e) Региональные ограничения
        current_route = get_driver_current_orders(driver.id, routes_dict)
        if not _check_regional_constraints_for_filtering(driver, order, current_route, params):
            continue
        
        candidates.append(driver)
    
    return candidates


def _check_regional_constraints_for_filtering(
    driver: Driver,
    order: Order,
    current_route: List[Order],
    params: DispatchParams
) -> bool:
    """
    Проверяет региональные ограничения для фильтрации кандидатов.
    
    Returns:
        True если водитель может взять заказ, False иначе
    """
    driver_region = driver.region
    order_region = order.pickup_region
    
    if not driver_region or not order_region:
        return True  # Если нет информации о регионе, разрешаем
    
    from dispatch.utils import is_city_driver, is_remote_driver, is_order_in_remote_region
    
    is_city = is_city_driver(driver)
    is_remote = is_remote_driver(driver)
    is_order_remote = is_order_in_remote_region(order)
    
    # Городские водители не могут брать заказы из отдаленных регионов
    if is_city and is_order_remote and not params.allow_city_drivers_to_remote_regions:
        return False
    
    # Отдаленные водители: первый заказ должен быть из их региона
    if is_remote and len(current_route) == 0:
        if driver_region.id != order_region.id:
            if not params.allow_remote_driver_first_order_outside_region:
                return False
    
    return True
