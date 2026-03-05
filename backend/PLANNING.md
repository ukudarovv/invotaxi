# Планирование маршрутов на день

## Обзор

Модуль планирования маршрутов предназначен для построения маршрутов для всех заказов в заданном временном окне с использованием алгоритма Best Insertion и многоуровневой балансировки нагрузки.

## Функция `plan_routes_greedy()`

### Входные данные

- `orders` - список всех заказов (или QuerySet Order)
- `drivers` - список всех водителей (или QuerySet Driver)
- `regions` - список регионов (опционально)
- `day_start` - начало временного окна (datetime)
- `day_end` - конец временного окна (datetime)
- `params` - параметры планирования (DispatchParams)
- `force_assign` - принудительное назначение (булево, по умолчанию False)
- `progress_callback` - callback для отображения прогресса (опционально)
- `filter_status` - фильтр по статусу заказов (опционально)

### Выходные данные

- `routes` - словарь маршрутов {driver_id: [order_series, ...]}
- `schedules` - словарь расписаний {driver_id: schedule_df}
- `unassigned_orders` - список неназначенных заказов
- `statistics` - статистика планирования

## Алгоритм

### 1. Подготовка данных

1. **Назначение регионов заказам:**
   ```python
   orders = assign_regions_to_orders(orders)
   ```

2. **Фильтрация по временному окну и статусу:**
   ```python
   orders_in_window = [
       order for order in orders
       if day_start <= order.desired_pickup_time <= day_end
       and order.status in filter_status
   ]
   ```

3. **Сортировка заказов:**
   ```python
   orders_in_window.sort(key=lambda o: o.desired_pickup_time)
   ```

### 2. Основной цикл назначения

Для каждого заказа последовательно:

```python
result = assign_order(
    drivers=drivers,
    routes_dict=routes,
    new_order=order,
    start_time=day_start,
    params=params
)

if result['chosen_driver_id']:
    driver_id = result['chosen_driver_id']
    insert_pos = result['insert_position']
    routes[driver_id].insert(insert_pos, order)
    schedules[driver_id] = result['schedule_df']
else:
    unassigned_orders.append(order)
```

### 3. Перераспределение заказов (многоуровневая балансировка)

#### 3.1. Перераспределение от перегруженных водителей

```python
routes, redistributed = redistribute_overloaded_drivers(
    routes, drivers, params, day_start
)
```

Находятся водители с количеством заказов > `max_orders_per_driver`, избыточные заказы перераспределяются другим водителям.

#### 3.2. Догрузка недогруженных водителей

```python
routes, redistributed_count = redistribute_underloaded_drivers(
    routes, drivers, params, day_start
)
```

Находятся водители с количеством заказов < порога, заказы перераспределяются от перегруженных водителей. Приоритет заказам из региона водителя.

#### 3.3. Назначение нераспределенных заказов

```python
routes, unassigned_orders = assign_unassigned_to_underloaded(
    unassigned_orders, routes, drivers, params, day_start
)
```

Нераспределенные заказы назначаются недогруженным водителям с ослабленными региональными ограничениями.

#### 3.4. Назначение водителям без заказов

```python
routes, unassigned_orders = assign_orders_to_zero_load_drivers(
    unassigned_orders, routes, drivers, params, day_start
)
```

Специальный проход для водителей с 0 заказами с очень ослабленными ограничениями. Приоритет заказам из региона водителя.

#### 3.5. Агрессивное перераспределение

```python
routes, aggressive_count = aggressive_redistribute_to_zero_load_drivers(
    routes, drivers, params, day_start
)
```

Заказы забираются у перегруженных водителей и отдаются водителям без заказов. Цель: назначить минимум 5-8 заказов водителю без заказов.

#### 3.6. Финальная балансировка

```python
routes = final_load_balancing(routes, drivers, params)
```

Обеспечивает равномерное распределение заказов. Гарантирует, что разница между максимальной и минимальной загрузкой не превышает `max_load_imbalance` (по умолчанию 3).

## Временная сложность

O(O × D × R × P), где:
- O = количество заказов
- D = количество водителей
- R = среднее количество заказов в маршруте
- P = количество позиций вставки

## Пример использования

```python
from dispatch.planner import plan_routes_greedy
from dispatch.config import DispatchParams
from datetime import datetime, timedelta

day_start = datetime.now()
day_end = day_start + timedelta(days=1)
params = DispatchParams.get_default()

result = plan_routes_greedy(
    orders=orders,
    drivers=drivers,
    day_start=day_start,
    day_end=day_end,
    params=params
)

print(f"Назначено заказов: {result['statistics']['assigned_orders']}")
print(f"Нераспределено заказов: {result['statistics']['unassigned_orders']}")
print(f"Водителей с заказами: {result['statistics']['drivers_with_orders']}")
```

## Статистика

Результат содержит статистику:
- `total_orders` - общее количество заказов
- `assigned_orders` - количество назначенных заказов
- `unassigned_orders` - количество неназначенных заказов
- `drivers_with_orders` - количество водителей с заказами
- `avg_orders_per_driver` - среднее количество заказов на водителя
