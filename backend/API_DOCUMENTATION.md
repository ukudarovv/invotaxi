# API Документация - Инво Такси Backend

## Базовый URL
```
http://localhost:8000/api/
```

## Аутентификация

Все запросы (кроме аутентификации и регионов) требуют JWT токен в заголовке:
```
Authorization: Bearer <access_token>
```

### Получение OTP кода
**POST** `/api/auth/phone-login/`

**Request:**
```json
{
  "phone": "+7 (777) 777-77-77"
}
```

**Response:**
```json
{
  "message": "OTP код отправлен",
  "expires_at": "2024-01-01T12:00:00Z"
}
```

### Проверка OTP и получение токена
**POST** `/api/auth/verify-otp/`

**Request:**
```json
{
  "phone": "+7 (777) 777-77-77",
  "code": "123456"
}
```

**Response:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 1,
    "username": "user_77777777777",
    "phone": "+7 (777) 777-77-77",
    "role": "passenger"
  },
  "role": "passenger",
  "passenger": {
    "id": 1,
    "full_name": "Тестов Тест Тестович",
    "region": {...},
    "disability_category": "I группа",
    "allowed_companion": true
  },
  "passenger_id": 1
}
```

### Выход
**POST** `/api/auth/logout/`

**Request:**
```json
{
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

## Регионы

### Список регионов
**GET** `/api/regions/`

**Response:**
```json
[
  {
    "id": "north",
    "title": "Северный",
    "center_lat": 55.8000,
    "center_lon": 37.6000,
    "center": {
      "lat": 55.8000,
      "lon": 37.6000
    }
  }
]
```

## Заказы

### Создание заказа
**POST** `/api/orders/`

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

**Response:**
```json
{
  "id": "order_1704110400000",
  "passenger": {...},
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "status": "submitted",
  "created_at": "2024-01-01T12:00:00Z",
  ...
}
```

### Список заказов
**GET** `/api/orders/`

**Query параметры:**
- `status` - фильтр по статусу
- `passenger_id` - фильтр по пассажиру
- `driver_id` - фильтр по водителю

**Response:**
```json
[
  {
    "id": "order_1704110400000",
    "status": "assigned",
    "pickup_title": "...",
    ...
  }
]
```

### Детали заказа
**GET** `/api/orders/{order_id}/`

### Обновление статуса заказа
**PATCH** `/api/orders/{order_id}/status/`

**Request:**
```json
{
  "status": "driver_en_route",
  "reason": "Водитель выехал"
}
```

### Заказы пассажира
**GET** `/api/orders/passenger/{passenger_id}/`

### Заказы водителя
**GET** `/api/orders/driver/{driver_id}/`

## Водители

### Список водителей
**GET** `/api/drivers/`

### Детали водителя
**GET** `/api/drivers/{driver_id}/`

### Обновление позиции водителя
**PATCH** `/api/drivers/{driver_id}/location/`

**Request:**
```json
{
  "lat": 55.7558,
  "lon": 37.6173
}
```

### Обновление онлайн статуса
**PATCH** `/api/drivers/{driver_id}/online-status/`

**Request:**
```json
{
  "is_online": true
}
```

## Пассажиры

### Профиль пассажира
**GET** `/api/passengers/{passenger_id}/`

## Диспетчеризация

### Назначение заказа водителю
**POST** `/api/dispatch/assign/{order_id}/`

**Response:**
```json
{
  "success": true,
  "driver_id": "1",
  "reason": "Назначен водитель...",
  "order": {
    "id": "order_1704110400000",
    "status": "assigned",
    "driver": {
      "id": "1",
      "name": "Иванов Иван",
      "car_model": "Toyota Camry"
    }
  }
}
```

### Кандидаты для заказа
**GET** `/api/dispatch/candidates/{order_id}/`

**Response:**
```json
{
  "order_id": "order_1704110400000",
  "candidates": [
    {
      "driver_id": "1",
      "name": "Иванов Иван",
      "region_id": "north",
      "car_model": "Toyota Camry",
      "capacity": 4,
      "priority": {
        "region_match": true,
        "order_count": 2,
        "distance": 1500.5
      }
    }
  ],
  "count": 1
}
```

## WebSocket

### Подключение к заказу
**WS** `/ws/orders/{order_id}/`

**События от сервера:**
- `order_update` - обновление заказа
- `order_status_changed` - изменение статуса
- `driver_assigned` - назначение водителя

**Пример:**
```json
{
  "type": "order_update",
  "data": {
    "id": "order_1704110400000",
    "status": "assigned",
    ...
  }
}
```

### Подключение к водителю
**WS** `/ws/drivers/{driver_id}/`

**События от сервера:**
- `new_order` - новый назначенный заказ
- `order_update` - обновление заказа

### Подключение к пассажиру
**WS** `/ws/passengers/{passenger_id}/`

**События от сервера:**
- `order_update` - обновление заказа
- `driver_arrived` - прибытие водителя

## Статусы заказов

- `draft` - Черновик
- `submitted` - Отправлено
- `awaiting_dispatcher_decision` - Ожидание решения диспетчера
- `rejected` - Отклонено
- `active_queue` - В очереди
- `assigned` - Назначено
- `driver_en_route` - Водитель в пути
- `arrived_waiting` - Ожидание пассажира
- `no_show` - Пассажир не пришел
- `ride_ongoing` - Поездка началась
- `completed` - Завершено
- `cancelled` - Отменено
- `incident` - Инцидент

## Ошибки

Все ошибки возвращаются в формате:
```json
{
  "error": "Описание ошибки"
}
```

**Коды статусов:**
- `200` - Успешно
- `400` - Ошибка валидации
- `401` - Не авторизован
- `403` - Нет доступа
- `404` - Не найдено
- `500` - Внутренняя ошибка сервера

