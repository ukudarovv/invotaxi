# Алгоритм распределения заказов

## Обзор

Реализован продвинутый алгоритм распределения заказов, который оптимизирует одновременно:
1. **Время подачи (ETA)** и ожидания клиента
2. **Вероятность принятия** (acceptance rate) и низкие отмены
3. **Качество сервиса** (рейтинг, соответствие тарифа/опций)
4. **Баланс справедливости** (не "кормить" одних и игнорировать других)
5. **Экономику** (пробег до подачи, холостой пробег, простои)
6. **Операционную устойчивость** (быстро, без "перебора" 10k водителей)

## Архитектура

### Pipeline распределения

```
1. Триггер (создан заказ / освободился водитель)
   ↓
2. Предварительная фильтрация (hard constraints)
   ↓
3. Top-K по ETA (быстродействие)
   ↓
4. Скоринг (soft constraints)
   ↓
5. Выбор лучшего кандидата
   ↓
6. Отправка оффера + таймер
   ↓
7. Обработка ответа (принят/отклонен/таймаут)
```

### Состояния водителя

- `OFFLINE` - Водитель офлайн
- `ONLINE_IDLE` - Онлайн, свободен
- `OFFERED` - Получил предложение (идет таймер)
- `ENROUTE_TO_PICKUP` - Принял, едет к подаче
- `ON_TRIP` - В поездке
- `PAUSED` - Перерыв/блокировка

### Состояния заказа

- `CREATED` - Создан
- `MATCHING` - Поиск водителя
- `OFFERED` - Предложение отправлено
- `ASSIGNED` - Водитель назначен
- `DRIVER_EN_ROUTE` - Водитель в пути
- `ARRIVED_WAITING` - Ожидание пассажира
- `RIDE_ONGOING` - Поездка началась
- `COMPLETED` - Завершено
- `CANCELLED` - Отменено

## Скоринг

### Формула cost

```
cost = w_eta * eta_norm 
     + w_deadhead * deadhead_norm
     + w_reject * reject_norm
     + w_cancel * cancel_norm
     + w_fairness * fairness_norm
     + w_zone * zone_norm
     + w_quality * quality_norm
```

Где все метрики нормализованы в диапазон [0..1], и чем меньше cost - тем лучше.

### Факторы скоринга

1. **ETA (время подачи)** - ключевой фактор, минимизируем время ожидания клиента
2. **Deadhead (холостой пробег)** - расстояние до клиента, минимизируем пустые пробеги
3. **Reject risk** - вероятность отказа (1 - acceptance_rate)
4. **Cancel risk** - вероятность отмены после принятия
5. **Fairness** - баланс распределения заказов между водителями
6. **Zone balancing** - штраф за "высасывание" водителей из зоны спроса
7. **Quality** - штраф за низкий рейтинг/качество

## Использование

### 1. Создание миграций

```bash
cd backend
python manage.py makemigrations accounts orders
python manage.py migrate
```

### 2. Настройка конфигурации

Создайте конфигурацию алгоритма через админку Django или через API:

```python
from orders.models import DispatchConfig

config = DispatchConfig.objects.create(
    name='Продакшн конфигурация',
    is_active=True,
    eta_max_seconds=720,  # 12 минут
    k_candidates=50,
    offer_timeout_seconds=15,
    # Веса скоринга
    w_eta=0.4,
    w_deadhead=0.15,
    w_reject=0.2,
    w_cancel=0.15,
    w_fairness=0.05,
    w_zone=0.03,
    w_quality=0.02,
    # Пороги
    min_rating=4.0,
    max_offers_per_hour=20,
    # Расширение поиска
    expand_search_after_seconds=30,
    expand_eta_multiplier=1.5
)
```

### 3. Использование API

#### Умное назначение заказа

```bash
POST /api/dispatch/smart-assign/{order_id}/
Authorization: Bearer {token}
```

Ответ:
```json
{
  "success": true,
  "offer_id": 123,
  "driver_id": 456,
  "driver_name": "Иван Иванов",
  "eta_seconds": 420,
  "expires_at": "2024-01-01T12:00:00Z",
  "cost_score": 0.234,
  "details": {
    "eta_seconds": 420,
    "eta_norm": 0.583,
    "distance_km": 3.5,
    "acceptance_rate": 0.85,
    ...
  }
}
```

#### Принятие оффера (водитель)

```bash
POST /api/dispatch/offer/{offer_id}/accept/
Authorization: Bearer {driver_token}
```

#### Отклонение оффера (водитель)

```bash
POST /api/dispatch/offer/{offer_id}/decline/
Authorization: Bearer {driver_token}
```

#### Получение кандидатов с скорингом (админка)

```bash
GET /api/dispatch/candidates-scored/{order_id}/?limit=10
Authorization: Bearer {admin_token}
```

Ответ:
```json
{
  "order_id": "123",
  "candidates": [
    {
      "driver_id": 456,
      "driver_name": "Иван Иванов",
      "car_model": "Toyota Camry",
      "rating": 4.8,
      "cost": 0.234,
      "details": {
        "eta_seconds": 420,
        "eta_norm": 0.583,
        "distance_km": 3.5,
        "acceptance_rate": 0.85,
        "cancel_rate": 0.05,
        ...
      }
    },
    ...
  ],
  "count": 10
}
```

#### Получение офферов заказа

```bash
GET /api/dispatch/offers/{order_id}/
Authorization: Bearer {token}
```

#### Проверка таймаутов (для cron/celery)

```bash
POST /api/dispatch/check-timeouts/
Authorization: Bearer {admin_token}
```

### 4. Автоматическая обработка таймаутов

Настройте периодическую задачу (Celery/cron) для проверки истекших офферов:

```python
# celery_tasks.py
from celery import shared_task
from dispatch.matching_service import MatchingService
from orders.models import OrderOffer
from django.utils import timezone

@shared_task
def check_expired_offers():
    """Проверка истекших офферов каждую минуту"""
    expired_offers = OrderOffer.objects.filter(
        status='pending',
        expires_at__lte=timezone.now()
    )
    
    matching_service = MatchingService()
    for offer in expired_offers:
        matching_service.handle_offer_timeout(offer)
```

Или через cron:

```bash
# Каждую минуту
* * * * * cd /path/to/backend && python manage.py shell -c "from dispatch.matching_service import MatchingService; from orders.models import OrderOffer; from django.utils import timezone; [MatchingService().handle_offer_timeout(o) for o in OrderOffer.objects.filter(status='pending', expires_at__lte=timezone.now())]"
```

## Настройка весов

### Рекомендуемые значения для начала

```python
w_eta = 0.4          # Время подачи - самый важный фактор
w_deadhead = 0.15   # Холостой пробег
w_reject = 0.2       # Риск отказа
w_cancel = 0.15      # Риск отмены
w_fairness = 0.05    # Справедливость
w_zone = 0.03        # Баланс зон
w_quality = 0.02     # Качество
```

### Тюнинг под ваши нужды

1. **Если важнее скорость подачи**: увеличьте `w_eta` до 0.5-0.6
2. **Если важнее экономика**: увеличьте `w_deadhead` до 0.25
3. **Если много отказов**: увеличьте `w_reject` до 0.3
4. **Если важна справедливость**: увеличьте `w_fairness` до 0.1-0.15

## Мониторинг и аналитика

### Метрики для отслеживания

1. **Средний ETA подачи** - время от создания заказа до назначения
2. **Acceptance rate** - процент принятых офферов
3. **Cancel rate** - процент отмен после принятия
4. **Доля реассайнов** - сколько заказов переназначалось
5. **Распределение заказов** - справедливость между водителями

### Просмотр метрик в админке

- **OrderOffer** - все предложения с деталями скоринга
- **DriverStatistics** - статистика каждого водителя
- **DispatchConfig** - текущая конфигурация алгоритма

## Расширение функционала

### Batch-matching (пачка заказов)

Для реализации batch-matching добавьте метод в `MatchingService`:

```python
def assign_batch(self, orders: List[Order]) -> Dict:
    """Назначение пачки заказов одновременно"""
    # Используйте венгерский алгоритм или min-cost max-flow
    # для оптимального распределения
    pass
```

### Zone balancing (баланс зон)

Реализуйте heatmap спроса/предложения и добавьте расчет `zone_norm` в методе `_score_candidate`.

### Антифрод GPS

Добавьте проверки на:
- Слишком резкие прыжки GPS
- GPS spoofing
- Неподвижность при "движении"

## Миграция со старого алгоритма

Старый алгоритм (`DispatchEngine.assign_order`) продолжает работать. Для перехода на новый:

1. Создайте миграции и примените их
2. Настройте конфигурацию через админку
3. Постепенно переводите заказы на новый алгоритм через `/api/dispatch/smart-assign/`
4. Мониторьте метрики и тюньте веса

## Troubleshooting

### Нет кандидатов

- Проверьте, что водители онлайн (`is_online=True`)
- Проверьте статусы водителей (`status=ONLINE_IDLE`)
- Увеличьте `eta_max_seconds` в конфигурации
- Проверьте фильтры по региону

### Низкий acceptance rate

- Увеличьте `w_reject` в конфигурации
- Проверьте статистику водителей (может быть проблема с конкретными водителями)
- Увеличьте `offer_timeout_seconds` (дайте больше времени на ответ)

### Несправедливое распределение

- Увеличьте `w_fairness` в конфигурации
- Проверьте статистику распределения заказов между водителями
- Рассмотрите добавление дополнительных факторов в fairness penalty
