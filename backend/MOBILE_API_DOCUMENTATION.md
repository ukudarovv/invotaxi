# Мобильное API - Документация

## Базовый URL
```
http://localhost:8000/api/mobile/
```

## Аутентификация

Все запросы требуют JWT токен в заголовке:
```
Authorization: Bearer <access_token>
```

---

## API для Пассажиров

### Базовый путь: `/api/mobile/passengers/`

#### 1. Получить профиль пассажира
**GET** `/api/mobile/passengers/profile/`

**Response:**
```json
{
  "id": 1,
  "user": {
    "id": 1,
    "username": "user_77777777777",
    "phone": "+7 (777) 777-77-77",
    "role": "passenger"
  },
  "full_name": "Иванов Иван Иванович",
  "region": {
    "id": "north",
    "title": "Северный",
    ...
  },
  "disability_category": "I группа",
  "allowed_companion": true
}
```

#### 2. Обновить профиль пассажира
**PATCH** `/api/mobile/passengers/profile/`

**Request:**
```json
{
  "full_name": "Иванов Иван Иванович",
  "region_id": "north",
  "disability_category": "I группа",
  "allowed_companion": true
}
```

#### 3. Получить список заказов пассажира
**GET** `/api/mobile/passengers/orders/`

**Query параметры:**
- `status` - фильтр по статусу (можно несколько через запятую)
- `limit` - количество заказов (по умолчанию 20)

**Response:**
```json
{
  "count": 5,
  "results": [
    {
      "id": "order_1234567890",
      "pickup_title": "ул. Ленина, 1",
      "dropoff_title": "ул. Пушкина, 10",
      "status": "assigned",
      "driver": {
        "id": 1,
        "name": "Иванов Иван",
        "car_model": "Toyota Camry",
        ...
      },
      ...
    }
  ]
}
```

#### 4. Получить активный заказ пассажира
**GET** `/api/mobile/passengers/active-order/`

**Response (если есть активный заказ):**
```json
{
  "has_active_order": true,
  "id": "order_1234567890",
  "status": "driver_en_route",
  "driver": {
    "id": 1,
    "name": "Иванов Иван",
    "car_model": "Toyota Camry",
    ...
  },
  "driver_position": {
    "lat": 55.7558,
    "lon": 37.6173,
    "last_update": "2024-01-01T12:00:00Z"
  },
  "eta": {
    "seconds": 300,
    "distance_km": 2.5,
    "formatted": "5 минут"
  },
  ...
}
```

**Response (если нет активного заказа):**
```json
{
  "has_active_order": false,
  "order": null
}
```

#### 5. Получить детали конкретного заказа
**GET** `/api/mobile/passengers/order/{order_id}/`

---

## API для Водителей

### Базовый путь: `/api/mobile/drivers/`

#### 1. Получить профиль водителя
**GET** `/api/mobile/drivers/profile/`

**Response:**
```json
{
  "id": 1,
  "user": {
    "id": 2,
    "username": "driver_77777777777",
    "phone": "+7 (777) 777-77-77",
    "role": "driver"
  },
  "name": "Иванов Иван",
  "region": {...},
  "car_model": "Toyota Camry",
  "plate_number": "A123BC",
  "capacity": 4,
  "is_online": true,
  "current_lat": 55.7558,
  "current_lon": 37.6173,
  "current_position": {
    "lat": 55.7558,
    "lon": 37.6173
  },
  "rating": 4.8,
  "status": "online_idle"
}
```

#### 2. Обновить профиль водителя
**PATCH** `/api/mobile/drivers/profile/`

**Request:**
```json
{
  "name": "Иванов Иван",
  "car_model": "Toyota Camry",
  "plate_number": "A123BC",
  "capacity": 4
}
```

#### 3. Обновить позицию водителя
**PATCH** `/api/mobile/drivers/location/`

**Request:**
```json
{
  "lat": 55.7558,
  "lon": 37.6173
}
```

**Response:** Обновленный профиль водителя

#### 4. Обновить онлайн статус водителя
**PATCH** `/api/mobile/drivers/online-status/`

**Request:**
```json
{
  "is_online": true
}
```

**Response:** Обновленный профиль водителя

#### 5. Получить список предложений заказов
**GET** `/api/mobile/drivers/offers/`

**Response:**
```json
{
  "count": 2,
  "results": [
    {
      "offer_id": 1,
      "order_id": "order_1234567890",
      "pickup_title": "ул. Ленина, 1",
      "dropoff_title": "ул. Пушкина, 10",
      "pickup_lat": 55.7558,
      "pickup_lon": 37.6173,
      "dropoff_lat": 55.7500,
      "dropoff_lon": 37.7000,
      "desired_pickup_time": "2024-01-01T12:00:00Z",
      "has_companion": false,
      "distance_km": 2.5,
      "eta_seconds": 300,
      "cost_score": 0.85,
      "created_at": "2024-01-01T12:00:00Z",
      "expires_at": "2024-01-01T12:00:15Z",
      "expires_in_seconds": 10,
      "passenger": {
        "id": 1,
        "full_name": "Иванов Иван Иванович",
        "disability_category": "I группа"
      }
    }
  ]
}
```

#### 6. Принять предложение заказа
**POST** `/api/mobile/drivers/offer/{offer_id}/accept/`

**Response:**
```json
{
  "success": true,
  "order_id": "order_1234567890",
  "message": "Заказ принят"
}
```

#### 7. Отклонить предложение заказа
**POST** `/api/mobile/drivers/offer/{offer_id}/decline/`

**Response:**
```json
{
  "success": true,
  "message": "Предложение отклонено"
}
```

#### 8. Получить список заказов водителя
**GET** `/api/mobile/drivers/orders/`

**Query параметры:**
- `status` - фильтр по статусу (можно несколько через запятую)
- `limit` - количество заказов (по умолчанию 20)

#### 9. Получить активный заказ водителя
**GET** `/api/mobile/drivers/active-order/`

**Response (если есть активный заказ):**
```json
{
  "has_active_order": true,
  "id": "order_1234567890",
  "status": "driver_en_route",
  "passenger": {
    "id": 1,
    "full_name": "Иванов Иван Иванович",
    ...
  },
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "route_to_pickup": {
    "distance_km": 2.5,
    "duration_minutes": 5,
    "eta": "2024-01-01T12:05:00Z"
  },
  ...
}
```

**Response (если поездка началась):**
```json
{
  "has_active_order": true,
  "id": "order_1234567890",
  "status": "ride_ongoing",
  "route": {
    "distance_km": 10.5,
    "duration_minutes": 20,
    "eta": "2024-01-01T12:20:00Z"
  },
  ...
}
```

#### 10. Получить детали конкретного заказа
**GET** `/api/mobile/drivers/order/{order_id}/`

#### 11. Получить статистику водителя
**GET** `/api/mobile/drivers/statistics/`

**Response:**
```json
{
  "total_completed_orders": 150,
  "today_completed_orders": 5,
  "rating": 4.8,
  "is_online": true,
  "status": "online_idle",
  "acceptance_rate": 0.95,
  "cancel_rate": 0.02,
  "offers_last_60min": 10,
  "orders_last_60min": 8
}
```

---

## API для Заказов (Мобильное)

### Базовый путь: `/api/mobile/orders/`

#### 1. Создать заказ
**POST** `/api/mobile/orders/create/`

**Request:**
```json
{
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "pickup_lat": 55.7558,
  "pickup_lon": 37.6173,
  "dropoff_lat": 55.7500,
  "dropoff_lon": 37.7000,
  "desired_pickup_time": "2024-01-02T09:00:00Z",
  "has_companion": false,
  "note": "Нужна помощь с коляской"
}
```

**Response:** Созданный заказ

#### 2. Рассчитать предварительную цену (Quote)
**GET** `/api/mobile/orders/quote/`

**Query параметры:**
- `pickup_lat` - широта точки забора
- `pickup_lon` - долгота точки забора
- `dropoff_lat` - широта точки высадки
- `dropoff_lon` - долгота точки высадки
- `pickup_title` - адрес забора (опционально)
- `dropoff_title` - адрес высадки (опционально)
- `has_companion` - с сопровождением (true/false, по умолчанию false)

**Response:**
```json
{
  "quote": 850.50,
  "surge_multiplier": 1.2,
  "distance_km": 10.5,
  "duration_minutes": 20,
  "details": {
    "base_fare": 300,
    "distance_cost": 1260,
    "duration_cost": 500,
    ...
  }
}
```

#### 3. Отменить заказ
**POST** `/api/mobile/orders/{order_id}/cancel/`

**Request:**
```json
{
  "reason": "Изменились планы"
}
```

**Response:**
```json
{
  "order": {
    "id": "order_1234567890",
    "status": "cancelled",
    ...
  },
  "cancel_fee": 500.00,
  "cancel_fee_details": {
    "reason": "Отмена после назначения водителя",
    ...
  }
}
```

#### 4. Обновить статус заказа
**PATCH** `/api/mobile/orders/{order_id}/status/`

**Request:**
```json
{
  "status": "driver_en_route",
  "reason": "Водитель выехал"
}
```

**Доступные статусы для водителя:**
- `driver_en_route` - Водитель в пути к точке забора
- `arrived_waiting` - Водитель прибыл, ожидает пассажира
- `ride_ongoing` - Поездка началась
- `completed` - Поездка завершена
- `cancelled` - Отменено

**Доступные статусы для пассажира:**
- `cancelled` - Отменено

#### 5. Получить маршрут заказа
**GET** `/api/mobile/orders/{order_id}/route/`

**Response:**
```json
{
  "distance_km": 10.5,
  "duration_minutes": 20,
  "eta": "2024-01-01T12:20:00Z",
  "polyline": "..."
}
```

#### 6. Получить детализацию цены заказа
**GET** `/api/mobile/orders/{order_id}/price-breakdown/`

**Query параметры:**
- `type` - тип цены: `quote` (предварительная) или `final` (финальная), по умолчанию `quote`

**Response:**
```json
{
  "order_id": "order_1234567890",
  "price_type": "final",
  "base_fare": 300.00,
  "distance_km": 10.5,
  "distance_cost": 1260.00,
  "duration_min": 20,
  "duration_cost": 500.00,
  "waiting_min": 5,
  "waiting_cost": 60.00,
  "booking_fee": 100.00,
  "companion_fee": 0.00,
  "night_multiplier": 1.0,
  "weekend_multiplier": 1.1,
  "disability_multiplier": 1.0,
  "surge_multiplier": 1.2,
  "subtotal_before_surge": 2220.00,
  "subtotal_after_surge": 2664.00,
  "minimum_fare_adjustment": 0.00,
  "total": 2664.00,
  "created_at": "2024-01-01T12:00:00Z"
}
```

---

## Статусы заказов

- `draft` - Черновик
- `submitted` - Отправлено
- `awaiting_dispatcher_decision` - Ожидание решения диспетчера
- `rejected` - Отклонено
- `created` - Создан
- `matching` - Поиск водителя
- `active_queue` - В очереди
- `offered` - Предложение отправлено
- `assigned` - Назначено
- `driver_en_route` - Водитель в пути
- `arrived_waiting` - Ожидание пассажира
- `no_show` - Пассажир не пришел
- `ride_ongoing` - Поездка началась
- `completed` - Завершено
- `cancelled` - Отменено
- `incident` - Инцидент

---

## Примеры использования

### Пример 1: Пассажир создает заказ

1. Получить предварительную цену:
```bash
GET /api/mobile/orders/quote/?pickup_lat=55.7558&pickup_lon=37.6173&dropoff_lat=55.7500&dropoff_lon=37.7000
```

2. Создать заказ:
```bash
POST /api/mobile/orders/create/
{
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "pickup_lat": 55.7558,
  "pickup_lon": 37.6173,
  "dropoff_lat": 55.7500,
  "dropoff_lon": 37.7000,
  "desired_pickup_time": "2024-01-02T09:00:00Z",
  "has_companion": false
}
```

3. Отслеживать активный заказ:
```bash
GET /api/mobile/passengers/active-order/
```

### Пример 2: Водитель работает

1. Включить онлайн статус:
```bash
PATCH /api/mobile/drivers/online-status/
{
  "is_online": true
}
```

2. Обновить позицию:
```bash
PATCH /api/mobile/drivers/location/
{
  "lat": 55.7558,
  "lon": 37.6173
}
```

3. Получить предложения заказов:
```bash
GET /api/mobile/drivers/offers/
```

4. Принять предложение:
```bash
POST /api/mobile/drivers/offer/1/accept/
```

5. Обновить статус заказа:
```bash
PATCH /api/mobile/orders/order_1234567890/status/
{
  "status": "driver_en_route",
  "reason": "Выехал к клиенту"
}
```

6. По прибытии:
```bash
PATCH /api/mobile/orders/order_1234567890/status/
{
  "status": "arrived_waiting",
  "reason": "Прибыл к точке забора"
}
```

7. Начать поездку:
```bash
PATCH /api/mobile/orders/order_1234567890/status/
{
  "status": "ride_ongoing",
  "reason": "Поездка началась"
}
```

8. Завершить поездку:
```bash
PATCH /api/mobile/orders/order_1234567890/status/
{
  "status": "completed",
  "reason": "Поездка завершена"
}
```

---

## Обработка ошибок

Все ошибки возвращаются в формате:
```json
{
  "error": "Описание ошибки"
}
```

### Коды статусов:
- `200` - Успешно
- `201` - Создано
- `400` - Неверный запрос
- `401` - Не авторизован
- `403` - Нет доступа
- `404` - Не найдено
- `500` - Внутренняя ошибка сервера
