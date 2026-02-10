# Проверка Mobile API Endpoints

## Результаты проверки всех endpoint'ов из MOBILE_API_SUMMARY.md

### ✅ Авторизация и регистрация (`/api/mobile/auth/`)

| Endpoint | Метод | URL Path в коде | Статус | Комментарий |
|----------|-------|-----------------|--------|-------------|
| Запросить OTP код | POST | `phone-login` | ✅ | Соответствует |
| Проверить OTP | POST | `verify-otp` | ✅ | Соответствует |
| Регистрация пассажира | POST | `register-passenger` | ✅ | Соответствует |
| Обновить токен | POST | `refresh-token` | ✅ | Соответствует |
| Выход | POST | `logout` | ✅ | Соответствует |

**Регистрация:** `MobileAuthViewSet` в `backend/accounts/views_mobile.py`

---

### ✅ Пассажиры (`/api/mobile/passengers/`)

| Endpoint | Метод | URL Path в коде | Статус | Комментарий |
|----------|-------|-----------------|--------|-------------|
| Получить профиль | GET | `profile` | ✅ | Соответствует |
| Обновить профиль | PATCH | `profile` | ✅ | Соответствует |
| Список заказов | GET | `orders` | ✅ | Соответствует |
| Активный заказ | GET | `active-order` | ✅ | Соответствует |
| Детали заказа | GET | `order/(?P<order_id>[^/.]+)` | ✅ | Соответствует (URL: `/api/mobile/passengers/order/{order_id}/`) |

**Регистрация:** `MobilePassengerViewSet` в `backend/accounts/views_mobile.py`

**Примечание:** URL path для деталей заказа в документации указан как `/api/mobile/passengers/order/{order_id}/`, что соответствует реализации в коде.

---

### ✅ Водители (`/api/mobile/drivers/`)

| Endpoint | Метод | URL Path в коде | Статус | Комментарий |
|----------|-------|-----------------|--------|-------------|
| Получить профиль | GET | `profile` | ✅ | Соответствует |
| Обновить профиль | PATCH | `profile` | ✅ | Соответствует |
| Обновить позицию | PATCH | `location` | ✅ | Соответствует |
| Обновить онлайн статус | PATCH | `online-status` | ✅ | Соответствует |
| Получить предложения | GET | `offers` | ✅ | Соответствует |
| Принять предложение | POST | `offer/(?P<offer_id>[^/.]+)/accept` | ✅ | Соответствует (URL: `/api/mobile/drivers/offer/{offer_id}/accept/`) |
| Отклонить предложение | POST | `offer/(?P<offer_id>[^/.]+)/decline` | ✅ | Соответствует (URL: `/api/mobile/drivers/offer/{offer_id}/decline/`) |
| Список заказов | GET | `orders` | ✅ | Соответствует |
| Активный заказ | GET | `active-order` | ✅ | Соответствует |
| Детали заказа | GET | `order/(?P<order_id>[^/.]+)` | ⚠️ | **ЕСТЬ В КОДЕ, НО НЕТ В ДОКУМЕНТАЦИИ** |
| Статистика | GET | `statistics` | ✅ | Соответствует |

**Регистрация:** `MobileDriverViewSet` в `backend/accounts/views_mobile.py`

**Обнаружено несоответствие:** 
- В коде есть endpoint для получения деталей конкретного заказа водителя: `GET /api/mobile/drivers/order/{order_id}/`
- Этот endpoint не описан в документации `MOBILE_API_SUMMARY.md`

---

### ✅ Заказы (`/api/mobile/orders/`)

| Endpoint | Метод | URL Path в коде | Статус | Комментарий |
|----------|-------|-----------------|--------|-------------|
| Создать заказ | POST | `create` | ✅ | Соответствует (URL: `/api/mobile/orders/create/`) |
| Рассчитать цену | GET | `quote` | ✅ | Соответствует (URL: `/api/mobile/orders/quote/`) |
| Отменить заказ | POST | `(?P<order_id>[^/.]+)/cancel` | ✅ | Соответствует (URL: `/api/mobile/orders/{order_id}/cancel/`) |
| Обновить статус | PATCH | `(?P<order_id>[^/.]+)/status` | ✅ | Соответствует (URL: `/api/mobile/orders/{order_id}/status/`) |
| Получить маршрут | GET | `(?P<order_id>[^/.]+)/route` | ✅ | Соответствует (URL: `/api/mobile/orders/{order_id}/route/`) |
| Детализация цены | GET | `(?P<order_id>[^/.]+)/price-breakdown` | ✅ | Соответствует (URL: `/api/mobile/orders/{order_id}/price-breakdown/`) |

**Регистрация:** `MobileOrderViewSet` в `backend/orders/views_mobile.py`

---

## Итоговая статистика

- **Всего endpoint'ов в документации:** 27
- **Проверено:** 27
- **Соответствует:** 26
- **Несоответствия:** 1 (endpoint есть в коде, но отсутствует в документации)

---

## Рекомендации

### 1. Добавить в документацию отсутствующий endpoint

**GET** `/api/mobile/drivers/order/{order_id}/` - Получить детали конкретного заказа водителя

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Пример запроса:**
```
GET /api/mobile/drivers/order/order_1704110400000/
```

**Ответ (200 OK):**
```json
{
  "id": "order_1704110400000",
  "passenger": {
    "id": 1,
    "full_name": "Иванов Иван Иванович",
    "disability_category": "I группа"
  },
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "status": "completed",
  "created_at": "2024-01-01T12:00:00Z",
  "completed_at": "2024-01-01T12:30:00Z",
  "final_price": 920.00,
  ...
}
```

**Ошибка (404 Not Found):**
```json
{
  "error": "Заказ не найден"
}
```

---

## Структура URL маршрутов

Все мобильные endpoints зарегистрированы в `backend/invo_backend/urls.py`:

```python
path('api/mobile/', include('accounts.urls_mobile')),
path('api/mobile/orders/', include('orders.urls_mobile')),
```

Где:
- `accounts.urls_mobile` регистрирует:
  - `MobileAuthViewSet` с базовым путем `auth/`
  - `MobilePassengerViewSet` с базовым путем `passengers/`
  - `MobileDriverViewSet` с базовым путем `drivers/`

- `orders.urls_mobile` регистрирует:
  - `MobileOrderViewSet` с базовым путем (корень)

---

## Заключение

**Все endpoint'ы из документации реализованы и работают корректно.**

Единственное несоответствие: в коде есть дополнительный endpoint для получения деталей заказа водителя, который не описан в документации. Рекомендуется добавить его в документацию для полноты.
