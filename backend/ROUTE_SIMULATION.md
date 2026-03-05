# Симуляция маршрута

## Обзор

Модуль симуляции маршрута предназначен для проверки валидности последовательности заказов с учетом временных ограничений. Симуляция рассчитывает расписание выполнения маршрута и проверяет соблюдение дедлайнов для каждого заказа.

## Функция `simulate_route()`

### Входные данные

- `driver_start_lat`, `driver_start_lng` - начальные координаты водителя
- `driver_start_time` - время начала работы водителя
- `orders_sequence` - последовательность заказов (список Order объектов)
- `travel_minutes_fn` - функция расчета времени переезда
- `wait_limit_min` - лимит ожидания (минуты, по умолчанию 20)
- `wait_period_min` - фиксированный период ожидания после scheduled_time (минуты, по умолчанию 20)
- `use_ml` - использовать ML предсказания (булево, по умолчанию False)
- `ml_predictor` - ML предсказатель (опционально)
- `params` - параметры алгоритма (опционально)

### Выходные данные

- `schedule_df` - DataFrame с расписанием для каждого заказа
- `is_valid` - валидность маршрута (булево)
- `violations` - список ID заказов с нарушениями дедлайнов
- `total_time_min` - общее время выполнения маршрута (минуты)

## Алгоритм

### 1. Инициализация

```python
current_lat = driver_start_lat
current_lng = driver_start_lng
current_time = driver_start_time
violations = []
```

### 2. Обработка каждого заказа

Для каждого заказа в последовательности:

1. **Расчет времени до точки забора:**
   ```python
   t_drive_to_pickup_min = travel_minutes_fn(
       current_lat, current_lng,
       pickup_lat, pickup_lng,
       order_for_ml=order,
       current_time=current_time
   )
   ```

2. **Время прибытия:**
   ```python
   arrive_time = current_time + timedelta(minutes=t_drive_to_pickup_min)
   ```

3. **Расчет времени ожидания:**
   ```python
   if arrive_time < scheduled_time:
       early_arrival_min = (scheduled_time - arrive_time).total_seconds() / 60.0
       wait_time_min = early_arrival_min  # или ML предсказание
   else:
       wait_time_min = 0.0
   ```

4. **Время начала поездки:**
   ```python
   start_time = max(
       arrive_time + timedelta(minutes=wait_time_min),
       scheduled_time
   )
   ```

5. **Дедлайн:**
   ```python
   deadline_time = scheduled_time + timedelta(minutes=wait_limit_min)
   ```

6. **Проверка опоздания:**
   ```python
   is_late = start_time > deadline_time
   if is_late:
       violations.append(order_id)
   ```

7. **Расчет времени поездки:**
   ```python
   t_trip_min = travel_minutes_fn(
       pickup_lat, pickup_lng,
       dropoff_lat, dropoff_lng,
       order_for_ml=order,
       current_time=start_time
   )
   ```

8. **Время завершения:**
   ```python
   end_time = start_time + timedelta(minutes=t_trip_min)
   ```

9. **Обновление позиции:**
   ```python
   current_lat = dropoff_lat
   current_lng = dropoff_lng
   current_time = end_time
   ```

### 3. Проверка валидности

```python
is_valid = len(violations) == 0
```

## Временные ограничения

Для каждого заказа:
- `scheduled_time` - желаемое время подачи (из `order.desired_pickup_time`)
- `deadline_time = scheduled_time + wait_limit_min` (по умолчанию 20 минут)
- `start_time` - фактическое время начала поездки
- **Условие валидности:** `start_time ≤ deadline_time`

## Формат расписания (DataFrame)

Колонки:
- `order_id` - ID заказа
- `arrive_time` - время прибытия к точке забора
- `wait_time_min` - время ожидания (минуты)
- `start_time` - время начала поездки
- `deadline_time` - дедлайн подачи
- `end_time` - время завершения заказа
- `is_late` - флаг опоздания
- `t_drive_to_pickup_min` - время до точки забора (минуты)
- `t_trip_min` - время поездки (минуты)

## Временная сложность

O(O), где O - количество заказов в маршруте

## Пример использования

```python
from dispatch.simulator import simulate_route, create_travel_minutes_function
from dispatch.config import DispatchParams
from datetime import datetime

params = DispatchParams.get_default()
travel_minutes_fn = create_travel_minutes_function(params=params)

schedule_df, is_valid, violations, total_time_min = simulate_route(
    driver_start_lat=51.1694,
    driver_start_lng=71.4491,
    driver_start_time=datetime.now(),
    orders_sequence=orders,
    travel_minutes_fn=travel_minutes_fn,
    wait_limit_min=params.wait_limit_min,
    wait_period_min=params.wait_period_min,
    params=params
)

if is_valid:
    print(f"Маршрут валиден, общее время: {total_time_min:.2f} минут")
else:
    print(f"Маршрут невалиден, нарушения: {violations}")
```
