# Алгоритм Best Insertion

## Обзор

Алгоритм Best Insertion предназначен для поиска оптимальной позиции вставки нового заказа в существующий маршрут водителя. Алгоритм перебирает все возможные позиции вставки, симулирует выполнение маршрута для каждой позиции и выбирает позицию с минимальной стоимостью.

## Функция `best_insertion()`

### Входные данные

- `driver` - объект Driver
- `current_route` - текущий маршрут водителя (список Order объектов)
- `new_order` - новый заказ для вставки (Order объект)
- `start_time` - время начала работы водителя (datetime)
- `params` - параметры алгоритма (DispatchParams)
- `regions_df` - DataFrame с регионами (опционально)

### Выходные данные

- `best_position` - лучшая позиция вставки (int или None)
- `best_schedule_df` - расписание для лучшей вставки (DataFrame или None)
- `best_cost` - стоимость лучшей вставки (float или float('inf'))
- `debug_info` - информация для отладки (словарь)

## Алгоритм

### 1. Проверка базовых условий

- Вместимость: `driver.capacity >= new_order.seats_needed`
- Лимит заказов: `len(current_route) < max_orders_per_driver`
- Координаты водителя: `driver.current_lat`, `driver.current_lng` не NULL

### 2. Перебор позиций вставки

Для каждой позиции `pos` от `0` до `len(current_route)`:

1. **Создание новой последовательности:**
   ```python
   new_sequence = current_route[:pos] + [new_order] + current_route[pos:]
   ```

2. **Проверка региональных ограничений:**
   - Городские водители не могут брать заказы из отдаленных регионов
   - Отдаленные водители: первый заказ должен быть из их региона
   - Отдаленные водители: последний заказ должен возвращать в регион

3. **Симуляция маршрута:**
   Вызывается `simulate_route()` для проверки валидности вставки.

4. **Расчет стоимости:**

   Если вставка валидна, рассчитывается стоимость:
   
   ```python
   cost = delta_total_time_min + region_penalty + risk_penalty + imbalance_penalty + first_last_penalty
   ```
   
   Где:
   - `delta_total_time_min` - увеличение общего времени маршрута
   - `region_penalty` - штраф за несовпадение региона
   - `risk_penalty` - штраф за риск опоздания
   - `imbalance_penalty` - штраф за перегруз
   - `first_last_penalty` - штраф за первый/последний заказ вне региона

### 3. Выбор лучшей позиции

Выбирается позиция с минимальной стоимостью.

## Временная сложность

O(R × S), где:
- R = количество позиций вставки (len(current_route) + 1)
- S = сложность симуляции маршрута (O(O), где O - количество заказов)

## Пример использования

```python
from dispatch.insertion import best_insertion
from dispatch.config import DispatchParams
from datetime import datetime

params = DispatchParams.get_default()
position, schedule_df, cost, debug_info = best_insertion(
    driver=driver,
    current_route=current_route,
    new_order=new_order,
    start_time=datetime.now(),
    params=params
)

if position is not None:
    print(f"Лучшая позиция: {position}, стоимость: {cost}")
else:
    print("Не найдено валидных позиций")
```
