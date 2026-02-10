# Быстрый старт: Алгоритм распределения заказов

## Шаг 1: Создание миграций

```bash
cd backend
python manage.py makemigrations accounts orders
python manage.py migrate
```

## Шаг 2: Создание дефолтной конфигурации

Конфигурация создастся автоматически при первом использовании, или создайте вручную через админку Django:

1. Откройте `/admin/orders/dispatchconfig/add/`
2. Заполните поля (можно оставить дефолтные значения)
3. Сохраните

## Шаг 3: Тестирование

### Через команду Django

```bash
# Найти заказ и показать кандидатов
python manage.py test_matching --show-candidates

# Назначить конкретный заказ
python manage.py test_matching --order-id ORDER_ID
```

### Через API

```bash
# Умное назначение заказа
curl -X POST http://localhost:8000/api/dispatch/smart-assign/ORDER_ID/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Получить кандидатов с скорингом
curl http://localhost:8000/api/dispatch/candidates-scored/ORDER_ID/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Шаг 4: Настройка автоматической обработки таймаутов

### Вариант 1: Celery (рекомендуется)

Создайте задачу в `celery_tasks.py`:

```python
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

Настройте периодическую задачу в Celery Beat.

### Вариант 2: Cron

Добавьте в crontab:

```bash
* * * * * cd /path/to/backend && python manage.py shell -c "from dispatch.matching_service import MatchingService; from orders.models import OrderOffer; from django.utils import timezone; [MatchingService().handle_offer_timeout(o) for o in OrderOffer.objects.filter(status='pending', expires_at__lte=timezone.now())]"
```

## Шаг 5: Интеграция в существующий код

### Замена старого алгоритма

Вместо:
```python
from dispatch.services import DispatchEngine
engine = DispatchEngine()
result = engine.assign_order(order)
```

Используйте:
```python
from dispatch.matching_service import MatchingService
matching_service = MatchingService()
result = matching_service.assign_order(order)
```

### Обработка офферов водителем

Когда водитель принимает/отклоняет оффер через мобильное приложение:

```python
# Принятие
POST /api/dispatch/offer/{offer_id}/accept/

# Отклонение
POST /api/dispatch/offer/{offer_id}/decline/
```

## Проверка работы

1. Создайте тестовый заказ в статусе `MATCHING` или `ACTIVE_QUEUE`
2. Убедитесь, что есть онлайн водители (`is_online=True`, `status=ONLINE_IDLE`)
3. Вызовите `/api/dispatch/smart-assign/{order_id}/`
4. Проверьте, что создался оффер в таблице `OrderOffer`
5. Проверьте, что статус заказа изменился на `OFFERED`
6. Проверьте, что статус водителя изменился на `OFFERED`

## Мониторинг

- **Админка Django**: `/admin/orders/orderoffer/` - все офферы
- **Админка Django**: `/admin/accounts/driverstatistics/` - статистика водителей
- **API**: `/api/dispatch/candidates-scored/{order_id}/` - детальный скоринг

## Troubleshooting

### Ошибка: "Нет подходящих водителей"

- Проверьте, что водители онлайн: `Driver.objects.filter(is_online=True)`
- Проверьте статусы: `Driver.objects.filter(status=DriverStatus.ONLINE_IDLE)`
- Проверьте GPS координаты: `Driver.objects.filter(current_lat__isnull=False)`
- Увеличьте `eta_max_seconds` в конфигурации

### Ошибка: "Не удалось рассчитать ETA"

- Проверьте доступность OSRM сервера
- Проверьте координаты заказа и водителей
- Проверьте логи: `logger.warning` в `matching_service.py`

### Офферы не обрабатываются автоматически

- Убедитесь, что настроена периодическая задача (Celery/cron)
- Проверьте вручную: `POST /api/dispatch/check-timeouts/`
