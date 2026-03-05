"""
Модуль планирования маршрутов на день
"""
from typing import List, Optional, Dict, Callable
from datetime import datetime
import pandas as pd
import logging

from accounts.models import Driver
from orders.models import Order, OrderStatus
from dispatch.dispatcher import assign_order
from dispatch.utils import assign_regions_to_orders
from dispatch.load_balancing import (
    redistribute_overloaded_drivers,
    redistribute_underloaded_drivers,
    assign_unassigned_to_underloaded,
    assign_orders_to_zero_load_drivers,
    aggressive_redistribute_to_zero_load_drivers,
    final_load_balancing
)
from dispatch.config import DispatchParams

logger = logging.getLogger(__name__)


def plan_routes_greedy(
    orders: List[Order],
    drivers: List[Driver],
    regions: Optional[List] = None,
    day_start: datetime = None,
    day_end: datetime = None,
    params: Optional[DispatchParams] = None,
    force_assign: bool = False,
    progress_callback: Optional[Callable] = None,
    filter_status: Optional[List[str]] = None
) -> Dict:
    """
    Строит маршруты для всех заказов в заданном временном окне.
    
    Args:
        orders: Список всех заказов (или QuerySet Order)
        drivers: Список всех водителей (или QuerySet Driver)
        regions: Список регионов (опционально)
        day_start: Начало временного окна
        day_end: Конец временного окна
        params: Параметры планирования
        force_assign: Принудительное назначение
        progress_callback: Callback для отображения прогресса
        filter_status: Фильтр по статусу заказов
    
    Returns:
        Словарь с ключами:
        - routes: Словарь маршрутов {driver_id: [order_series, ...]}
        - schedules: Словарь расписаний {driver_id: schedule_df}
        - unassigned_orders: Список неназначенных заказов
    """
    if params is None:
        params = DispatchParams.get_default()
    
    # 1. Назначение регионов заказам (если не назначены)
    orders = assign_regions_to_orders(orders)
    
    # 2. Фильтрация по временному окну и статусу
    orders_in_window = []
    for order in orders:
        # Фильтр по статусу
        if filter_status and order.status not in filter_status:
            continue
        
        # Фильтр по временному окну
        if day_start and order.desired_pickup_time < day_start:
            continue
        if day_end and order.desired_pickup_time > day_end:
            continue
        
        orders_in_window.append(order)
    
    # 3. Сортировка заказов по scheduled_time
    orders_in_window.sort(key=lambda o: o.desired_pickup_time)
    
    logger.info(f'Планирование маршрутов для {len(orders_in_window)} заказов')
    
    # 4. Предзагрузка маршрутов через OSRM (если включено)
    # TODO: Реализовать предзагрузку для оптимизации
    
    # 5. Основной цикл назначения
    routes = {}  # {driver_id: [order, ...]}
    schedules = {}  # {driver_id: schedule_df}
    unassigned_orders = []
    
    total_orders = len(orders_in_window)
    
    for idx, order in enumerate(orders_in_window):
        if progress_callback:
            progress_callback(idx + 1, total_orders, f'Обработка заказа {order.id}')
        
        # Назначение заказа
        result = assign_order(
            drivers=drivers,
            routes_dict=routes,
            new_order=order,
            start_time=day_start if day_start else datetime.now(),
            params=params,
            regions_df=None  # TODO: преобразовать regions в DataFrame если нужно
        )
        
        if result['chosen_driver_id'] is not None:
            driver_id = result['chosen_driver_id']
            insert_pos = result['insert_position']
            schedule_df = result['schedule_df']
            
            # Добавляем заказ в маршрут водителя
            if driver_id not in routes:
                routes[driver_id] = []
            
            routes[driver_id].insert(insert_pos, order)
            
            # Сохраняем расписание
            if schedule_df is not None:
                schedules[driver_id] = schedule_df
            
            logger.debug(f'Заказ {order.id} назначен водителю {driver_id} на позицию {insert_pos}')
        else:
            unassigned_orders.append(order)
            logger.debug(f'Заказ {order.id} не назначен')
    
    logger.info(f'Основной цикл завершен: назначено {sum(len(r) for r in routes.values())} заказов, не назначено: {len(unassigned_orders)}')
    
    # 6. Перераспределение заказов (многоуровневая балансировка)
    if params.enable_load_balancing:
        logger.info('Начало перераспределения заказов')
        
        # 6.1. Перераспределение от перегруженных водителей
        routes, redistributed = redistribute_overloaded_drivers(
            routes, drivers, params, day_start if day_start else datetime.now()
        )
        logger.info(f'Перераспределено от перегруженных: {len(redistributed)} заказов')
        
        # 6.2. Догрузка недогруженных водителей
        routes, redistributed_count = redistribute_underloaded_drivers(
            routes, drivers, params, day_start if day_start else datetime.now()
        )
        logger.info(f'Догружено недогруженных водителей: {redistributed_count} заказов')
        
        # 6.3. Назначение нераспределенных заказов
        routes, unassigned_orders = assign_unassigned_to_underloaded(
            unassigned_orders, routes, drivers, params,
            day_start if day_start else datetime.now()
        )
        logger.info(f'Осталось нераспределенных заказов: {len(unassigned_orders)}')
        
        # 6.4. Назначение водителям без заказов
        routes, unassigned_orders = assign_orders_to_zero_load_drivers(
            unassigned_orders, routes, drivers, params,
            day_start if day_start else datetime.now()
        )
        logger.info(f'После назначения водителям без заказов: {len(unassigned_orders)} нераспределенных')
        
        # 6.5. Агрессивное перераспределение
        routes, aggressive_count = aggressive_redistribute_to_zero_load_drivers(
            routes, drivers, params, day_start if day_start else datetime.now()
        )
        logger.info(f'Агрессивно перераспределено: {aggressive_count} заказов')
        
        # 6.6. Финальная балансировка
        routes = final_load_balancing(routes, drivers, params)
        logger.info('Финальная балансировка завершена')
    
    # Пересчитываем расписания для всех маршрутов
    # TODO: Пересчитать расписания после перераспределения
    
    # Статистика
    total_assigned = sum(len(route) for route in routes.values())
    total_unassigned = len(unassigned_orders)
    
    logger.info(
        f'Планирование завершено: '
        f'назначено {total_assigned} заказов, '
        f'нераспределено {total_unassigned} заказов, '
        f'водителей с заказами: {len(routes)}'
    )
    
    return {
        'routes': routes,
        'schedules': schedules,
        'unassigned_orders': unassigned_orders,
        'statistics': {
            'total_orders': len(orders_in_window),
            'assigned_orders': total_assigned,
            'unassigned_orders': total_unassigned,
            'drivers_with_orders': len(routes),
            'avg_orders_per_driver': total_assigned / len(routes) if routes else 0
        }
    }
