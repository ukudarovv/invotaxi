# Сводка реализации алгоритма распределения заказов

## Что было реализовано

### 1. Расширение моделей данных

#### `accounts/models.py`
- ✅ Добавлен `DriverStatus` - статусы водителя (OFFLINE, ONLINE_IDLE, OFFERED, ENROUTE_TO_PICKUP, ON_TRIP, PAUSED)
- ✅ Расширена модель `Driver`:
  - Поле `status` (статус водителя)
  - Поле `rating` (рейтинг водителя)
  - Поле `idle_since` (время начала простоя)
- ✅ Создана модель `DriverStatistics`:
  - `acceptance_rate` - вероятность принятия оффера
  - `cancel_rate` - вероятность отмены
  - `offers_last_60min` - количество офферов за последний час
  - `orders_last_60min` - количество заказов за последний час
  - `rejections_count`, `cancellations_count`, `no_shows_count` - счетчики

#### `orders/models.py`
- ✅ Добавлены статусы заказа: `CREATED`, `MATCHING`, `OFFERED`
- ✅ Создана модель `OrderOffer`:
  - Связь с заказом и водителем
  - Статус оффера (pending, accepted, declined, timeout)
  - Временные метки (created_at, expires_at, responded_at)
  - Данные для аналитики (eta_seconds, distance_km, cost_score, selection_reason)
- ✅ Создана модель `DispatchConfig`:
  - Параметры фильтрации (eta_max_seconds, k_candidates, offer_timeout_seconds)
  - Веса скоринга (w_eta, w_deadhead, w_reject, w_cancel, w_fairness, w_zone, w_quality)
  - Пороги и лимиты (min_rating, max_offers_per_hour)
  - Правила расширения поиска

### 2. Сервис распределения

#### `dispatch/matching_service.py`
Реализован класс `MatchingService` с полным pipeline:

**Методы фильтрации:**
- ✅ `_filter_candidates()` - предварительная фильтрация по hard constraints
- ✅ `_get_top_k_by_eta()` - выбор Top-K кандидатов по ETA

**Методы скоринга:**
- ✅ `_score_candidate()` - расчет cost score с нормализацией всех метрик
- ✅ `_get_median_orders_last_hour()` - расчет медианы для fairness penalty

**Методы распределения:**
- ✅ `assign_order()` - главный метод распределения заказа
- ✅ `_send_offer()` - отправка оффера водителю
- ✅ `_expand_search()` - расширение поиска при отсутствии кандидатов

**Обработка событий:**
- ✅ `handle_offer_accepted()` - обработка принятия оффера
- ✅ `handle_offer_declined()` - обработка отклонения оффера
- ✅ `handle_offer_timeout()` - обработка таймаута оффера

**Аналитика:**
- ✅ `get_candidates_with_scores()` - получение кандидатов с детальными скорингами

### 3. API Endpoints

#### `dispatch/views.py`
Добавлены новые endpoints:

- ✅ `POST /api/dispatch/smart-assign/{order_id}/` - умное назначение заказа
- ✅ `POST /api/dispatch/offer/{offer_id}/accept/` - принятие оффера
- ✅ `POST /api/dispatch/offer/{offer_id}/decline/` - отклонение оффера
- ✅ `GET /api/dispatch/candidates-scored/{order_id}/` - кандидаты с скорингом
- ✅ `GET /api/dispatch/offers/{order_id}/` - список офферов заказа
- ✅ `POST /api/dispatch/check-timeouts/` - проверка истекших офферов

### 4. Админка Django

#### `orders/admin.py`
- ✅ `OrderOfferAdmin` - управление офферами
- ✅ `DispatchConfigAdmin` - управление конфигурацией алгоритма

#### `accounts/admin.py`
- ✅ Обновлен `DriverAdmin` - добавлены поля status, rating
- ✅ `DriverStatisticsAdmin` - управление статистикой водителей

### 5. Валидация переходов статусов

#### `orders/services.py`
- ✅ Обновлен `validate_status_transition()` - добавлены новые статусы и переходы

### 6. Документация

- ✅ `DISPATCH_ALGORITHM.md` - полная документация алгоритма
- ✅ `QUICK_START_MATCHING.md` - быстрый старт
- ✅ `MATCHING_IMPLEMENTATION_SUMMARY.md` - эта сводка

### 7. Утилиты

- ✅ `dispatch/management/commands/test_matching.py` - команда для тестирования

## Алгоритм скоринга

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

### Факторы

1. **ETA** (0.4) - время подачи, ключевой фактор
2. **Deadhead** (0.15) - холостой пробег до клиента
3. **Reject risk** (0.2) - вероятность отказа (1 - acceptance_rate)
4. **Cancel risk** (0.15) - вероятность отмены после принятия
5. **Fairness** (0.05) - баланс распределения заказов
6. **Zone balancing** (0.03) - штраф за вытягивание из зоны спроса
7. **Quality** (0.02) - штраф за низкий рейтинг

## Следующие шаги

### Для production

1. **Создать миграции:**
   ```bash
   python manage.py makemigrations accounts orders
   python manage.py migrate
   ```

2. **Настроить конфигурацию:**
   - Создать `DispatchConfig` через админку
   - Настроить веса под ваши нужды

3. **Настроить автоматическую обработку таймаутов:**
   - Celery Beat задача или cron
   - Проверка каждую минуту

4. **Интегрировать в существующий код:**
   - Заменить вызовы `DispatchEngine.assign_order()` на `MatchingService.assign_order()`
   - Добавить обработку офферов в мобильном приложении

5. **Мониторинг:**
   - Настроить метрики (ETA, acceptance rate, cancel rate)
   - Настроить алерты на проблемы

### Возможные улучшения

1. **Batch-matching** - назначение пачки заказов одновременно (венгерский алгоритм)
2. **Zone balancing** - реализация heatmap спроса/предложения
3. **Антифрод GPS** - проверка на GPS spoofing и резкие прыжки
4. **Machine Learning** - предсказание acceptance_rate и cancel_rate на основе истории
5. **WebSocket уведомления** - отправка офферов в реальном времени
6. **A/B тестирование** - тестирование разных конфигураций

## Тестирование

### Через команду Django

```bash
python manage.py test_matching --show-candidates --order-id ORDER_ID
```

### Через API

```bash
# Умное назначение
curl -X POST http://localhost:8000/api/dispatch/smart-assign/ORDER_ID/ \
  -H "Authorization: Bearer TOKEN"

# Кандидаты с скорингом
curl http://localhost:8000/api/dispatch/candidates-scored/ORDER_ID/ \
  -H "Authorization: Bearer TOKEN"
```

## Файлы, которые нужно создать/обновить

### Новые файлы
- `backend/dispatch/matching_service.py`
- `backend/dispatch/management/__init__.py`
- `backend/dispatch/management/commands/__init__.py`
- `backend/dispatch/management/commands/test_matching.py`
- `backend/DISPATCH_ALGORITHM.md`
- `backend/QUICK_START_MATCHING.md`
- `backend/MATCHING_IMPLEMENTATION_SUMMARY.md`

### Обновленные файлы
- `backend/accounts/models.py` - добавлены статусы и статистика
- `backend/orders/models.py` - добавлены офферы и конфигурация
- `backend/orders/services.py` - обновлена валидация статусов
- `backend/dispatch/views.py` - добавлены новые endpoints
- `backend/orders/admin.py` - добавлена админка для новых моделей
- `backend/accounts/admin.py` - обновлена админка водителей

## Важные замечания

1. **Старый алгоритм продолжает работать** - `DispatchEngine` не изменен, можно использовать оба параллельно
2. **Миграции обязательны** - нужно создать и применить миграции перед использованием
3. **Конфигурация создается автоматически** - при первом использовании создастся дефолтная конфигурация
4. **Таймауты нужно обрабатывать** - настроить периодическую задачу для проверки истекших офферов
5. **Статистика обновляется автоматически** - при создании офферов и их обработке

## Поддержка

При возникновении проблем:
1. Проверьте логи Django
2. Проверьте статусы водителей и заказов
3. Проверьте конфигурацию алгоритма
4. Используйте команду `test_matching` для диагностики
5. Проверьте доступность OSRM сервера для расчета ETA
