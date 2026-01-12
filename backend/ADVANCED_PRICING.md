# Продвинутый калькулятор цен для такси

## Обзор

Реализован детерминированный калькулятор цен с поддержкой:
- **Предварительной цены (Quote)** - показывается клиенту до поездки
- **Финальной цены (Final Fare)** - рассчитывается после завершения
- **Динамических множителей (Surge Pricing)** - автоматическое изменение цены при дисбалансе спроса/предложения
- **Защиты от GPS шумов** - фильтрация "телепортов" и неточных данных
- **Ограничений на финальную цену** - защита от неожиданного "улета" цены
- **Правил отмены** - прозрачные штрафы за отмену заказа

## Архитектура

### Модели данных

1. **PricingConfig** - конфигурация тарифа (Econom/Comfort/Business)
   - Базовые параметры: `base_fare`, `price_per_km`, `price_per_minute`
   - Ожидание: `wait_free_min`, `wait_per_min`
   - Surge параметры: `surge_enabled`, `surge_min_multiplier`, `surge_max_multiplier`, `surge_step`, `surge_sensitivity`, `surge_smoothing_alpha`
   - Округление: `rounding_rule`
   - Защита: `final_price_cap_multiplier`

2. **SurgeZone** - зоны для surge pricing
   - Геолокация (центр + радиус или полигон)
   - Метрики: `demand_count`, `supply_count`
   - Множители: `current_multiplier`, `smoothed_multiplier`

3. **PriceBreakdown** - детализация цены (line items)
   - Все компоненты цены отдельными полями
   - Тип: `quote` или `final`

4. **CancelPolicy** - правила отмены заказов
   - Штрафы в зависимости от статуса заказа

5. **Order** (расширено)
   - `quote` - предварительная цена
   - `quote_surge_multiplier` - surge при расчете quote
   - `locked_surge_multiplier` - зафиксированный surge
   - `route_changed` - флаг изменения маршрута

## Формула расчета

### Предварительная цена (Quote)

```
1. billable_km = max(0, route_distance_km - included_km)
2. billable_min = max(0, route_duration_min - included_min)
3. raw = base_fare + billable_km * price_per_km + billable_min * price_per_minute
4. raw = max(raw, minimum_fare)
5. raw += booking_fee + companion_fee + zone_fees + options_fees
6. raw_with_time = raw * night_multiplier * weekend_multiplier * disability_multiplier
7. quote = raw_with_time * surge_multiplier
8. quote = round_by_rule(quote, rounding_rule)
```

### Финальная цена (Final Fare)

```
1. billable_km = max(0, actual_distance_km - included_km)
2. billable_min = max(0, actual_duration_min - included_min)
3. raw_final = base_fare + billable_km * price_per_km + billable_min * price_per_minute
4. paid_wait_min = max(0, actual_waiting_min - wait_free_min)
5. raw_final += paid_wait_min * wait_per_min
6. raw_final += booking_fee + companion_fee + zone_fees + options_fees + toll_fees
7. raw_with_time = raw_final * night_multiplier * weekend_multiplier * disability_multiplier
8. final = raw_with_time * locked_surge_multiplier
9. final = round_by_rule(final, rounding_rule)
10. final = min(final, quote * final_price_cap_multiplier)  # Защита от "улета"
```

## Surge Pricing

### Алгоритм расчета

1. **Определение зоны** - по региону или координатам заказа
2. **Обновление метрик**:
   - Спрос: количество заказов в статусе MATCHING/OFFERED за последние 5 минут
   - Предложение: количество доступных водителей в зоне
3. **Расчет ratio**: `ratio = demand / supply`
4. **Преобразование в multiplier**:
   - Если `ratio <= 1.0` → `mult = 1.0`
   - Иначе: `mult = 1.0 + k * (ratio - 1.0)`, где `k` - чувствительность
5. **Ограничение диапазона**: `mult = clamp(mult, min_multiplier, max_multiplier)`
6. **Округление до шага**: `mult = round_to_step(mult, step)`
7. **Сглаживание**: `smoothed = alpha * prev_smoothed + (1-alpha) * mult`

### Фиксация surge

Surge фиксируется при:
- Назначении заказа (`ASSIGNED`)
- Старте поездки (`RIDE_ONGOING`)

Зафиксированный surge используется для расчета финальной цены, чтобы клиент не видел скачков цены.

## Защита от GPS шумов

Фильтрация GPS точек:
- Игнорирование "телепортов" (скачок > MAX_SPEED за 1 секунду)
- Проверка максимальной скорости (по умолчанию 120 км/ч)
- Пересчет расстояния по отфильтрованным точкам

## Защита от "улета" финальной цены

Ограничение:
```
final <= quote * final_price_cap_multiplier
```

Исключения:
- Клиент изменил маршрут (`route_changed = True`)
- Поездка ушла в другую зону/межгород
- Платные дороги включены явно
- Сильный простой по вине клиента

## Правила отмены

### Отмена клиентом

1. **До назначения водителя**: `fee = cancel_before_assigned_fee` (обычно 0)
2. **После назначения, но до прибытия**:
   - Если прошло < `grace_cancel_seconds`: `fee = 0`
   - Иначе: `fee = cancel_after_assigned_fee`
3. **После прибытия водителя**: `fee = cancel_after_arrived_fee + waiting_cost` (если включено)

### Отмена водителем

Обычно без штрафа для клиента (компенсация может быть предусмотрена отдельно).

## Использование

### 1. Создание миграций

```bash
cd backend
python manage.py makemigrations orders
python manage.py migrate
```

### 2. Настройка тарифа

Создайте `PricingConfig` через админку или API:

```python
from orders.models import PricingConfig

tariff = PricingConfig.objects.create(
    name='Econom',
    base_fare=Decimal('300.00'),
    price_per_km=Decimal('120.00'),
    price_per_minute=Decimal('25.00'),
    minimum_fare=Decimal('500.00'),
    wait_free_min=3,
    wait_per_min=Decimal('30.00'),
    booking_fee=Decimal('100.00'),
    surge_enabled=True,
    surge_min_multiplier=Decimal('1.0'),
    surge_max_multiplier=Decimal('3.0'),
    surge_step=Decimal('0.1'),
    surge_sensitivity=Decimal('0.5'),
    surge_smoothing_alpha=Decimal('0.7'),
    rounding_rule='10',
    final_price_cap_multiplier=Decimal('1.30'),
    is_active=True
)
```

### 3. Создание зон surge

```python
from orders.models import SurgeZone

zone = SurgeZone.objects.create(
    name='Центр города',
    region=region,
    center_lat=47.1067,
    center_lon=51.9167,
    radius_meters=5000,
    is_active=True
)
```

### 4. API Endpoints

#### Расчет предварительной цены

```bash
POST /api/orders/{order_id}/calculate-quote/
Authorization: Bearer {token}
Content-Type: application/json

{
  "options": {
    "child_seat": true,
    "large_luggage": false
  }
}
```

Ответ:
```json
{
  "quote": 2090.0,
  "surge_multiplier": 1.2,
  "details": {
    "base_fare": 300.0,
    "distance_km": 7.4,
    "distance_cost": 888.0,
    "duration_min": 18.0,
    "duration_cost": 450.0,
    "booking_fee": 100.0,
    "surge_multiplier": 1.2,
    "subtotal_after_surge": 2090.0
  },
  "breakdown_id": 123
}
```

#### Расчет финальной цены

```bash
POST /api/orders/{order_id}/calculate-final/
Authorization: Bearer {token}
Content-Type: application/json

{
  "actual_distance_km": 7.5,
  "actual_duration_min": 19,
  "actual_waiting_min": 6,
  "gps_points": [[47.1067, 51.9167], [47.1070, 51.9170], ...],
  "options": {}
}
```

#### Расчет штрафа за отмену

```bash
POST /api/orders/{order_id}/calculate-cancel-fee/
Authorization: Bearer {token}
Content-Type: application/json

{
  "cancelled_by": "passenger"
}
```

#### Получение детализации цены

```bash
GET /api/orders/{order_id}/price-breakdown/?type=quote
GET /api/orders/{order_id}/price-breakdown/?type=final
```

### 5. Программное использование

```python
from orders.advanced_pricing import AdvancedPriceCalculator
from orders.models import Order

calculator = AdvancedPriceCalculator()

# Расчет quote
result = calculator.calculate_quote(
    order=order,
    route_distance_km=7.4,
    route_duration_min=18,
    options={'child_seat': True}
)

order.quote = result['quote']
order.quote_surge_multiplier = result['surge_multiplier']
order.save()

# Фиксация surge при назначении
if order.status == OrderStatus.ASSIGNED:
    order.locked_surge_multiplier = result['surge_multiplier']
    order.surge_locked_at = timezone.now()
    order.save()

# Расчет финальной цены
result = calculator.calculate_final(
    order=order,
    actual_distance_km=7.5,
    actual_duration_min=19,
    actual_waiting_min=6,
    gps_points=[...]  # Опционально
)

order.final_price = result['final_price']
order.save()
```

## Настройка surge

### Параметры чувствительности

- `surge_sensitivity` (k): 0.3-0.7
  - Меньше = менее агрессивный surge
  - Больше = более агрессивный surge

- `surge_smoothing_alpha`: 0.6-0.9
  - Меньше = быстрее реагирует на изменения
  - Больше = более плавные изменения

### Обновление метрик зон

Настройте периодическую задачу для обновления метрик:

```python
from celery import shared_task
from orders.models import SurgeZone
from orders.advanced_pricing import AdvancedPriceCalculator

@shared_task
def update_surge_zones():
    """Обновление метрик surge зон каждые 5 минут"""
    calculator = AdvancedPriceCalculator()
    zones = SurgeZone.objects.filter(is_active=True)
    
    for zone in zones:
        calculator._update_zone_metrics(zone)
```

## Мониторинг

### Метрики для отслеживания

1. **Средний surge multiplier** по зонам
2. **Распределение surge** (сколько заказов с разными множителями)
3. **Отклонение финальной цены от quote** (должно быть в пределах cap)
4. **Частота срабатывания защиты от GPS шумов**
5. **Распределение штрафов за отмену**

### Просмотр в админке

- **PricingConfig** - все тарифы
- **SurgeZone** - зоны и их метрики
- **PriceBreakdown** - детализация всех цен
- **CancelPolicy** - правила отмены

## Миграция со старого калькулятора

Старый `PriceCalculator` продолжает работать. Для перехода:

1. Создайте миграции и примените их
2. Настройте тарифы через админку
3. Создайте зоны surge
4. Постепенно переводите заказы на новый калькулятор
5. Мониторьте метрики и тюньте параметры

## Troubleshooting

### Surge не работает

- Проверьте `surge_enabled=True` в тарифе
- Проверьте наличие активных зон
- Проверьте обновление метрик зон

### Финальная цена превышает quote более чем на cap

- Проверьте флаг `route_changed`
- Проверьте логи на наличие предупреждений
- Увеличьте `final_price_cap_multiplier` если нужно

### GPS фильтрация слишком агрессивная

- Уменьшите `MAX_SPEED_KMH` в `_filter_gps_noise`
- Проверьте качество GPS данных
