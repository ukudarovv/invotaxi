# Мобильное API - Краткая сводка

## Что было создано

### 1. Мобильные Views для пассажиров (`backend/accounts/views_mobile.py`)
- ✅ Получение и обновление профиля пассажира
- ✅ Получение списка заказов пассажира
- ✅ Получение активного заказа пассажира (с информацией о водителе и ETA)
- ✅ Получение деталей конкретного заказа

### 2. Мобильные Views для водителей (`backend/accounts/views_mobile.py`)
- ✅ Получение и обновление профиля водителя
- ✅ Обновление позиции водителя
- ✅ Обновление онлайн/офлайн статуса
- ✅ Получение списка предложений заказов
- ✅ Принятие/отклонение предложений заказов
- ✅ Получение списка заказов водителя
- ✅ Получение активного заказа водителя (с маршрутом)
- ✅ Получение статистики водителя

### 3. Мобильные Views для заказов (`backend/orders/views_mobile.py`)
- ✅ Создание заказа
- ✅ Расчет предварительной цены (Quote)
- ✅ Отмена заказа (с расчетом штрафа)
- ✅ Обновление статуса заказа
- ✅ Получение маршрута заказа
- ✅ Получение детализации цены заказа

### 4. URL маршруты
- ✅ `/api/mobile/passengers/` - для пассажиров
- ✅ `/api/mobile/drivers/` - для водителей
- ✅ `/api/mobile/orders/` - для заказов

## Основные endpoint'ы с примерами

### Авторизация и регистрация:

#### 1. Запросить OTP код
**POST** `/api/mobile/auth/phone-login/`

**Заголовки:**
```
Content-Type: application/json
```

**Запрос:**
```json
{
  "phone": "+7 (777) 777-77-77"
}
```

**Ответ (200 OK):**
```json
{
  "message": "OTP код отправлен",
  "expires_at": "2024-01-01T12:05:00Z",
  "expires_in_seconds": 300
}
```

**Ошибка (400 Bad Request):**
```json
{
  "phone": ["Неверный формат телефона"]
}
```

---

#### 2. Проверить OTP и получить токен (авторизация/регистрация)
**POST** `/api/mobile/auth/verify-otp/`

**Заголовки:**
```
Content-Type: application/json
```

**Запрос:**
```json
{
  "phone": "+7 (777) 777-77-77",
  "code": "123456"
}
```

**Ответ (200 OK) - новый пользователь (без профиля):**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 1,
    "username": "user_77777777777",
    "phone": "+7 (777) 777-77-77",
    "role": "passenger",
    "email": ""
  },
  "role": "passenger",
  "is_new_user": true,
  "has_profile": false
}
```

**Ответ (200 OK) - существующий пользователь с профилем пассажира:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 1,
    "username": "user_77777777777",
    "phone": "+7 (777) 777-77-77",
    "role": "passenger",
    "email": ""
  },
  "role": "passenger",
  "is_new_user": false,
  "has_profile": true,
  "passenger": {
    "id": 1,
    "full_name": "Иванов Иван Иванович",
    "region": {
      "id": "north",
      "title": "Северный"
    },
    "disability_category": "I группа",
    "allowed_companion": true
  },
  "passenger_id": 1
}
```

**Ответ (200 OK) - существующий пользователь с профилем водителя:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 2,
    "username": "driver_77777777777",
    "phone": "+7 (777) 888-88-88",
    "role": "driver",
    "email": ""
  },
  "role": "driver",
  "is_new_user": false,
  "has_profile": true,
  "driver": {
    "id": 1,
    "name": "Сидоров Сидор",
    "car_model": "Toyota Camry",
    "plate_number": "A123BC",
    "is_online": false,
    "rating": 4.8
  },
  "driver_id": 1
}
```

**Ошибка (400 Bad Request):**
```json
{
  "error": "Неверный или истекший код"
}
```

---

#### 3. Зарегистрировать профиль пассажира
**POST** `/api/mobile/auth/register-passenger/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json
```

**Запрос:**
```json
{
  "full_name": "Иванов Иван Иванович",
  "region_id": "north",
  "disability_category": "I группа",
  "allowed_companion": true
}
```

**Ответ (201 Created):**
```json
{
  "success": true,
  "message": "Профиль пассажира успешно создан",
  "passenger": {
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
      "center_lat": 55.8000,
      "center_lon": 37.6000
    },
    "disability_category": "I группа",
    "allowed_companion": true
  }
}
```

**Ошибка (400 Bad Request):**
```json
{
  "error": "Требуется полное имя"
}
```

**Ошибка (400 Bad Request) - профиль уже существует:**
```json
{
  "error": "Профиль пассажира уже существует"
}
```

**Ошибка (404 Not Found):**
```json
{
  "error": "Регион не найден"
}
```

**Допустимые категории инвалидности:**
- `I группа`
- `II группа`
- `III группа`
- `Ребенок-инвалид`

---

#### 4. Обновить access токен
**POST** `/api/mobile/auth/refresh-token/`

**Заголовки:**
```
Content-Type: application/json
```

**Запрос:**
```json
{
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Ответ (200 OK):**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Ошибка (401 Unauthorized):**
```json
{
  "error": "Неверный или истекший refresh токен"
}
```

---

#### 5. Выход из системы
**POST** `/api/mobile/auth/logout/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json
```

**Запрос:**
```json
{
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Ответ (200 OK):**
```json
{
  "message": "Выход выполнен"
}
```

---

### Для пассажиров:

#### 1. Получить профиль пассажира
**GET** `/api/mobile/passengers/profile/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Ответ (200 OK):**
```json
{
  "id": 1,
  "user": {
    "id": 1,
    "username": "user_77777777777",
    "phone": "+7 (777) 777-77-77",
    "role": "passenger",
    "email": ""
  },
  "full_name": "Иванов Иван Иванович",
  "region": {
    "id": "north",
    "title": "Северный",
    "center_lat": 55.8000,
    "center_lon": 37.6000,
    "center": {
      "lat": 55.8000,
      "lon": 37.6000
    }
  },
  "disability_category": "I группа",
  "allowed_companion": true
}
```

**Ошибка (400 Bad Request):**
```json
{
  "error": "Пользователь не является пассажиром"
}
```

---

#### 2. Обновить профиль пассажира
**PATCH** `/api/mobile/passengers/profile/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json
```

**Запрос:**
```json
{
  "full_name": "Петров Петр Петрович",
  "region_id": "south",
  "disability_category": "II группа",
  "allowed_companion": false
}
```

**Ответ (200 OK):** (обновленный профиль в том же формате, что и GET)

**Ошибка (400 Bad Request):**
```json
{
  "region_id": ["Регион не найден"]
}
```

---

#### 3. Получить список заказов пассажира
**GET** `/api/mobile/passengers/orders/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Query параметры:**
- `status` (опционально) - фильтр по статусу, можно несколько через запятую: `?status=completed,cancelled`
- `limit` (опционально) - количество заказов, по умолчанию 20: `?limit=10`

**Пример запроса:**
```
GET /api/mobile/passengers/orders/?status=completed&limit=10
```

**Ответ (200 OK):**
```json
{
  "count": 2,
  "results": [
    {
      "id": "order_1704110400000",
      "passenger": {
        "id": 1,
        "full_name": "Иванов Иван Иванович",
        "region": {
          "id": "north",
          "title": "Северный"
        },
        "disability_category": "I группа",
        "allowed_companion": true
      },
      "driver": {
        "id": 1,
        "name": "Сидоров Сидор",
        "car_model": "Toyota Camry",
        "plate_number": "A123BC",
        "capacity": 4,
        "is_online": true,
        "current_position": {
          "lat": 55.7558,
          "lon": 37.6173
        },
        "rating": 4.8
      },
      "pickup_title": "ул. Ленина, 1",
      "dropoff_title": "ул. Пушкина, 10",
      "pickup_lat": 55.7558,
      "pickup_lon": 37.6173,
      "dropoff_lat": 55.7500,
      "dropoff_lon": 37.7000,
      "pickup_coordinate": {
        "lat": 55.7558,
        "lon": 37.6173
      },
      "dropoff_coordinate": {
        "lat": 55.7500,
        "lon": 37.7000
      },
      "desired_pickup_time": "2024-01-02T09:00:00Z",
      "has_companion": false,
      "note": "Нужна помощь с коляской",
      "status": "completed",
      "created_at": "2024-01-01T12:00:00Z",
      "assigned_at": "2024-01-01T12:05:00Z",
      "completed_at": "2024-01-01T12:30:00Z",
      "distance_km": 10.5,
      "waiting_time_minutes": 5,
      "estimated_price": 850.50,
      "final_price": 920.00,
      "seats_needed": 1
    }
  ]
}
```

---

#### 4. Получить активный заказ пассажира
**GET** `/api/mobile/passengers/active-order/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Ответ (200 OK) - если есть активный заказ:**
```json
{
  "has_active_order": true,
  "id": "order_1704110400000",
  "passenger": {
    "id": 1,
    "full_name": "Иванов Иван Иванович"
  },
  "driver": {
    "id": 1,
    "name": "Сидоров Сидор",
    "car_model": "Toyota Camry",
    "plate_number": "A123BC",
    "current_position": {
      "lat": 55.7558,
      "lon": 37.6173
    },
    "rating": 4.8
  },
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "pickup_lat": 55.7558,
  "pickup_lon": 37.6173,
  "dropoff_lat": 55.7500,
  "dropoff_lon": 37.7000,
  "status": "driver_en_route",
  "created_at": "2024-01-01T12:00:00Z",
  "assigned_at": "2024-01-01T12:05:00Z",
  "driver_position": {
    "lat": 55.7600,
    "lon": 37.6200,
    "last_update": "2024-01-01T12:10:00Z"
  },
  "eta": {
    "seconds": 300,
    "distance_km": 2.5,
    "formatted": "5 минут"
  },
  "quote": 850.50,
  "has_companion": false
}
```

**Ответ (200 OK) - если нет активного заказа:**
```json
{
  "has_active_order": false,
  "order": null
}
```

---

#### 5. Получить детали конкретного заказа
**GET** `/api/mobile/passengers/order/{order_id}/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Пример запроса:**
```
GET /api/mobile/passengers/order/order_1704110400000/
```

**Ответ (200 OK):**
```json
{
  "id": "order_1704110400000",
  "passenger": {...},
  "driver": {...},
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "status": "completed",
  "created_at": "2024-01-01T12:00:00Z",
  "completed_at": "2024-01-01T12:30:00Z",
  "final_price": 920.00,
  "distance_km": 10.5,
  "waiting_time_minutes": 5,
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

### Для водителей:

#### 1. Получить профиль водителя
**GET** `/api/mobile/drivers/profile/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Ответ (200 OK):**
```json
{
  "id": 1,
  "user": {
    "id": 2,
    "username": "driver_77777777777",
    "phone": "+7 (777) 888-88-88",
    "role": "driver",
    "email": "driver@example.com"
  },
  "name": "Сидоров Сидор Сидорович",
  "region": {
    "id": "north",
    "title": "Северный",
    "center_lat": 55.8000,
    "center_lon": 37.6000
  },
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
  "last_location_update": "2024-01-01T12:10:00Z",
  "rating": 4.8,
  "status": "online_idle"
}
```

---

#### 2. Обновить профиль водителя
**PATCH** `/api/mobile/drivers/profile/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json
```

**Запрос:**
```json
{
  "name": "Петров Петр Петрович",
  "car_model": "Honda Accord",
  "plate_number": "B456DE",
  "capacity": 4
}
```

**Ответ (200 OK):** (обновленный профиль)

---

#### 3. Обновить позицию водителя
**PATCH** `/api/mobile/drivers/location/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json
```

**Запрос:**
```json
{
  "lat": 55.7600,
  "lon": 37.6200
}
```

**Ответ (200 OK):**
```json
{
  "id": 1,
  "name": "Сидоров Сидор",
  "current_lat": 55.7600,
  "current_lon": 37.6200,
  "current_position": {
    "lat": 55.7600,
    "lon": 37.6200
  },
  "last_location_update": "2024-01-01T12:15:00Z",
  ...
}
```

**Ошибка (400 Bad Request):**
```json
{
  "error": "Требуются lat и lon"
}
```

---

#### 4. Обновить онлайн статус водителя
**PATCH** `/api/mobile/drivers/online-status/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json
```

**Запрос (включить онлайн):**
```json
{
  "is_online": true
}
```

**Запрос (выключить онлайн):**
```json
{
  "is_online": false
}
```

**Ответ (200 OK):**
```json
{
  "id": 1,
  "is_online": true,
  "status": "online_idle",
  "idle_since": "2024-01-01T12:15:00Z",
  ...
}
```

---

#### 5. Получить предложения заказов
**GET** `/api/mobile/drivers/offers/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Ответ (200 OK):**
```json
{
  "count": 2,
  "results": [
    {
      "offer_id": 1,
      "order_id": "order_1704110400000",
      "pickup_title": "ул. Ленина, 1",
      "dropoff_title": "ул. Пушкина, 10",
      "pickup_lat": 55.7558,
      "pickup_lon": 37.6173,
      "dropoff_lat": 55.7500,
      "dropoff_lon": 37.7000,
      "desired_pickup_time": "2024-01-01T12:30:00Z",
      "has_companion": false,
      "distance_km": 2.5,
      "eta_seconds": 300,
      "cost_score": 0.85,
      "created_at": "2024-01-01T12:10:00Z",
      "expires_at": "2024-01-01T12:10:15Z",
      "expires_in_seconds": 10,
      "passenger": {
        "id": 1,
        "full_name": "Иванов Иван Иванович",
        "disability_category": "I группа"
      }
    },
    {
      "offer_id": 2,
      "order_id": "order_1704110500000",
      "pickup_title": "пр. Мира, 5",
      "dropoff_title": "ул. Гагарина, 20",
      "pickup_lat": 55.7700,
      "pickup_lon": 37.6300,
      "dropoff_lat": 55.7800,
      "dropoff_lon": 37.6400,
      "desired_pickup_time": "2024-01-01T13:00:00Z",
      "has_companion": true,
      "distance_km": 5.2,
      "eta_seconds": 600,
      "cost_score": 0.92,
      "created_at": "2024-01-01T12:12:00Z",
      "expires_at": "2024-01-01T12:12:15Z",
      "expires_in_seconds": 8,
      "passenger": {
        "id": 2,
        "full_name": "Петрова Мария Ивановна",
        "disability_category": "II группа"
      }
    }
  ]
}
```

**Ответ (200 OK) - если нет предложений:**
```json
{
  "count": 0,
  "results": []
}
```

---

#### 6. Принять предложение заказа
**POST** `/api/mobile/drivers/offer/{offer_id}/accept/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Пример запроса:**
```
POST /api/mobile/drivers/offer/1/accept/
```

**Ответ (200 OK):**
```json
{
  "success": true,
  "order_id": "order_1704110400000",
  "driver_id": 1,
  "driver_name": "Сидоров Сидор"
}
```

**Ошибка (400 Bad Request):**
```json
{
  "success": false,
  "error": "Оффер истек"
}
```

**Ошибка (404 Not Found):**
```json
{
  "error": "Предложение не найдено"
}
```

---

#### 7. Отклонить предложение заказа
**POST** `/api/mobile/drivers/offer/{offer_id}/decline/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Пример запроса:**
```
POST /api/mobile/drivers/offer/1/decline/
```

**Ответ (200 OK):**
```json
{
  "success": true,
  "message": "Оффер отклонен, поиск продолжается",
  "reassignment": {
    "success": true,
    ...
  }
}
```

---

#### 8. Получить список заказов водителя
**GET** `/api/mobile/drivers/orders/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Query параметры:**
- `status` (опционально) - фильтр по статусу: `?status=completed`
- `limit` (опционально) - количество заказов: `?limit=20`

**Ответ (200 OK):** (аналогично списку заказов пассажира)

---

#### 9. Получить активный заказ водителя
**GET** `/api/mobile/drivers/active-order/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Ответ (200 OK) - если водитель в пути к клиенту:**
```json
{
  "has_active_order": true,
  "id": "order_1704110400000",
  "status": "driver_en_route",
  "passenger": {
    "id": 1,
    "full_name": "Иванов Иван Иванович",
    "disability_category": "I группа",
    "allowed_companion": true
  },
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "pickup_lat": 55.7558,
  "pickup_lon": 37.6173,
  "dropoff_lat": 55.7500,
  "dropoff_lon": 37.7000,
  "route_to_pickup": {
    "distance_km": 2.5,
    "duration_minutes": 5,
    "eta": "2024-01-01T12:20:00Z"
  },
  "quote": 850.50,
  "created_at": "2024-01-01T12:00:00Z",
  "assigned_at": "2024-01-01T12:05:00Z"
}
```

**Ответ (200 OK) - если поездка началась:**
```json
{
  "has_active_order": true,
  "id": "order_1704110400000",
  "status": "ride_ongoing",
  "passenger": {...},
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "route": {
    "distance_km": 10.5,
    "duration_minutes": 20,
    "eta": "2024-01-01T12:40:00Z"
  },
  "quote": 850.50,
  ...
}
```

**Ответ (200 OK) - если нет активного заказа:**
```json
{
  "has_active_order": false,
  "order": null
}
```

---

#### 10. Получить статистику водителя
**GET** `/api/mobile/drivers/statistics/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Ответ (200 OK):**
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

### Для заказов:

#### 1. Создать заказ
**POST** `/api/mobile/orders/create/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json
```

**Запрос:**
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

**Ответ (201 Created):**
```json
{
  "id": "order_1704110400000",
  "passenger": {
    "id": 1,
    "full_name": "Иванов Иван Иванович"
  },
  "pickup_title": "ул. Ленина, 1",
  "dropoff_title": "ул. Пушкина, 10",
  "pickup_lat": 55.7558,
  "pickup_lon": 37.6173,
  "dropoff_lat": 55.7500,
  "dropoff_lon": 37.7000,
  "status": "submitted",
  "created_at": "2024-01-01T12:00:00Z",
  "desired_pickup_time": "2024-01-02T09:00:00Z",
  "has_companion": false,
  "note": "Нужна помощь с коляской",
  "distance_km": 10.5,
  "estimated_price": 850.50,
  "quote": 850.50
}
```

**Ошибка (403 Forbidden):**
```json
{
  "error": "Только пассажиры могут создавать заказы"
}
```

---

#### 2. Рассчитать предварительную цену (Quote)
**GET** `/api/mobile/orders/quote/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Query параметры:**
- `pickup_lat` (обязательно) - широта точки забора
- `pickup_lon` (обязательно) - долгота точки забора
- `dropoff_lat` (обязательно) - широта точки высадки
- `dropoff_lon` (обязательно) - долгота точки высадки
- `pickup_title` (опционально) - адрес забора
- `dropoff_title` (опционально) - адрес высадки
- `has_companion` (опционально) - с сопровождением, по умолчанию `false`

**Пример запроса:**
```
GET /api/mobile/orders/quote/?pickup_lat=55.7558&pickup_lon=37.6173&dropoff_lat=55.7500&dropoff_lon=37.7000&has_companion=false
```

**Ответ (200 OK):**
```json
{
  "quote": 850.50,
  "surge_multiplier": 1.2,
  "distance_km": 10.5,
  "duration_minutes": 20,
  "details": {
    "base_fare": 300.00,
    "distance_cost": 1260.00,
    "duration_cost": 500.00,
    "booking_fee": 100.00,
    "companion_fee": 0.00,
    "night_multiplier": 1.0,
    "weekend_multiplier": 1.1,
    "disability_multiplier": 1.0,
    "surge_multiplier": 1.2,
    "subtotal_before_surge": 2160.00,
    "subtotal_after_surge": 2592.00,
    "minimum_fare_adjustment": 0.00,
    "total": 2592.00
  }
}
```

**Ошибка (400 Bad Request):**
```json
{
  "error": "Требуются координаты pickup и dropoff"
}
```

---

#### 3. Отменить заказ
**POST** `/api/mobile/orders/{order_id}/cancel/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json
```

**Запрос:**
```json
{
  "reason": "Изменились планы"
}
```

**Пример запроса:**
```
POST /api/mobile/orders/order_1704110400000/cancel/
```

**Ответ (200 OK):**
```json
{
  "order": {
    "id": "order_1704110400000",
    "status": "cancelled",
    "rejection_reason": "Отменено пользователем",
    ...
  },
  "cancel_fee": 500.00,
  "cancel_fee_details": {
    "reason": "Отмена после назначения водителя",
    "grace_period_expired": true,
    "waiting_time_included": false
  }
}
```

**Ошибка (400 Bad Request):**
```json
{
  "error": "Заказ уже завершен или отменен"
}
```

---

#### 4. Обновить статус заказа
**PATCH** `/api/mobile/orders/{order_id}/status/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json
```

**Запрос (для водителя - водитель в пути):**
```json
{
  "status": "driver_en_route",
  "reason": "Выехал к клиенту"
}
```

**Запрос (для водителя - прибыл):**
```json
{
  "status": "arrived_waiting",
  "reason": "Прибыл к точке забора"
}
```

**Запрос (для водителя - поездка началась):**
```json
{
  "status": "ride_ongoing",
  "reason": "Поездка началась"
}
```

**Запрос (для водителя - поездка завершена):**
```json
{
  "status": "completed",
  "reason": "Поездка завершена"
}
```

**Пример запроса:**
```
PATCH /api/mobile/orders/order_1704110400000/status/
```

**Ответ (200 OK):**
```json
{
  "id": "order_1704110400000",
  "status": "driver_en_route",
  "driver": {...},
  "passenger": {...},
  ...
}
```

**Ошибка (400 Bad Request):**
```json
{
  "error": "Недопустимый переход статуса: assigned -> completed"
}
```

---

#### 5. Получить маршрут заказа
**GET** `/api/mobile/orders/{order_id}/route/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Пример запроса:**
```
GET /api/mobile/orders/order_1704110400000/route/
```

**Ответ (200 OK):**
```json
{
  "distance_km": 10.5,
  "duration_minutes": 20,
  "eta": "2024-01-01T12:20:00Z",
  "polyline": "encoded_polyline_string",
  "waypoints": [
    {
      "lat": 55.7558,
      "lon": 37.6173,
      "title": "ул. Ленина, 1"
    },
    {
      "lat": 55.7500,
      "lon": 37.7000,
      "title": "ул. Пушкина, 10"
    }
  ]
}
```

**Ошибка (400 Bad Request):**
```json
{
  "error": "Не удалось рассчитать маршрут"
}
```

---

#### 6. Получить детализацию цены заказа
**GET** `/api/mobile/orders/{order_id}/price-breakdown/`

**Заголовки:**
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Query параметры:**
- `type` (опционально) - тип цены: `quote` (предварительная) или `final` (финальная), по умолчанию `quote`

**Пример запроса:**
```
GET /api/mobile/orders/order_1704110400000/price-breakdown/?type=final
```

**Ответ (200 OK):**
```json
{
  "order_id": "order_1704110400000",
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
  "zone_fees": 0.00,
  "toll_fees": 0.00,
  "options_fees": 0.00,
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

**Ошибка (404 Not Found):**
```json
{
  "error": "Детализация цены типа final не найдена"
}
```

## Коды статусов HTTP

- `200 OK` - Успешный запрос
- `201 Created` - Ресурс успешно создан
- `400 Bad Request` - Неверный запрос (неверные параметры, валидация)
- `401 Unauthorized` - Не авторизован (отсутствует или неверный токен)
- `403 Forbidden` - Нет доступа (недостаточно прав)
- `404 Not Found` - Ресурс не найден
- `500 Internal Server Error` - Внутренняя ошибка сервера

## Общие примеры использования

### Пример 0: Регистрация нового пассажира

**Шаг 1: Запросить OTP код**
```bash
POST /api/mobile/auth/phone-login/
Content-Type: application/json

{
  "phone": "+7 (777) 777-77-77"
}

Ответ:
{
  "message": "OTP код отправлен",
  "expires_at": "2024-01-01T12:05:00Z",
  "expires_in_seconds": 300
}
```

**Шаг 2: Проверить OTP и получить токен**
```bash
POST /api/mobile/auth/verify-otp/
Content-Type: application/json

{
  "phone": "+7 (777) 777-77-77",
  "code": "123456"
}

Ответ:
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {...},
  "role": "passenger",
  "is_new_user": true,
  "has_profile": false
}
```

**Шаг 3: Зарегистрировать профиль пассажира**
```bash
POST /api/mobile/auth/register-passenger/
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json

{
  "full_name": "Иванов Иван Иванович",
  "region_id": "north",
  "disability_category": "I группа",
  "allowed_companion": true
}

Ответ:
{
  "success": true,
  "message": "Профиль пассажира успешно создан",
  "passenger": {...}
}
```

**Шаг 4: Теперь можно использовать все endpoint'ы для пассажиров**

---

### Пример 1: Пассажир создает заказ

**Шаг 1: Получить предварительную цену**
```bash
GET /api/mobile/orders/quote/?pickup_lat=55.7558&pickup_lon=37.6173&dropoff_lat=55.7500&dropoff_lon=37.7000&has_companion=false
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...

Ответ:
{
  "quote": 850.50,
  "surge_multiplier": 1.2,
  "distance_km": 10.5,
  "duration_minutes": 20
}
```

**Шаг 2: Создать заказ**
```bash
POST /api/mobile/orders/create/
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json

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

**Шаг 3: Отслеживать активный заказ**
```bash
GET /api/mobile/passengers/active-order/
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...

Ответ (когда водитель назначен):
{
  "has_active_order": true,
  "status": "driver_en_route",
  "driver": {...},
  "eta": {
    "seconds": 300,
    "formatted": "5 минут"
  }
}
```

---

### Пример 2: Водитель работает

**Шаг 1: Включить онлайн статус**
```bash
PATCH /api/mobile/drivers/online-status/
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json

{
  "is_online": true
}
```

**Шаг 2: Обновить позицию (периодически)**
```bash
PATCH /api/mobile/drivers/location/
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json

{
  "lat": 55.7558,
  "lon": 37.6173
}
```

**Шаг 3: Получить предложения заказов**
```bash
GET /api/mobile/drivers/offers/
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...

Ответ:
{
  "count": 1,
  "results": [
    {
      "offer_id": 1,
      "order_id": "order_1704110400000",
      "distance_km": 2.5,
      "eta_seconds": 300,
      "expires_in_seconds": 10,
      ...
    }
  ]
}
```

**Шаг 4: Принять предложение**
```bash
POST /api/mobile/drivers/offer/1/accept/
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...

Ответ:
{
  "success": true,
  "order_id": "order_1704110400000",
  "driver_id": 1
}
```

**Шаг 5: Обновить статус заказа**
```bash
# Водитель выехал
PATCH /api/mobile/orders/order_1704110400000/status/
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
Content-Type: application/json

{
  "status": "driver_en_route",
  "reason": "Выехал к клиенту"
}

# Водитель прибыл
PATCH /api/mobile/orders/order_1704110400000/status/
{
  "status": "arrived_waiting",
  "reason": "Прибыл к точке забора"
}

# Поездка началась
PATCH /api/mobile/orders/order_1704110400000/status/
{
  "status": "ride_ongoing",
  "reason": "Поездка началась"
}

# Поездка завершена
PATCH /api/mobile/orders/order_1704110400000/status/
{
  "status": "completed",
  "reason": "Поездка завершена"
}
```

---

## Особенности

1. **Оптимизировано для мобильных устройств** - компактные ответы, только необходимая информация
2. **Автоматическое определение роли** - endpoint'ы автоматически определяют, пассажир это или водитель
3. **Активные заказы** - специальные endpoint'ы для получения активных заказов с дополнительной информацией (ETA, маршрут, позиция водителя)
4. **Предложения заказов** - водители получают список предложений с детальной информацией
5. **Статистика** - водители могут получать свою статистику
6. **Валидация** - все запросы валидируются на сервере
7. **Безопасность** - все endpoint'ы требуют JWT токен

## Аутентификация

Все endpoint'ы (кроме авторизации) требуют JWT токен в заголовке:
```
Authorization: Bearer <access_token>
```

### Процесс авторизации/регистрации:

**1. Запросить OTP код:**
```bash
POST /api/mobile/auth/phone-login/
Content-Type: application/json

{
  "phone": "+7 (777) 777-77-77"
}
```

**2. Проверить OTP и получить токен:**
```bash
POST /api/mobile/auth/verify-otp/
Content-Type: application/json

{
  "phone": "+7 (777) 777-77-77",
  "code": "123456"
}
```

**3. Если пользователь новый (`has_profile: false`), зарегистрировать профиль:**
```bash
POST /api/mobile/auth/register-passenger/
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "full_name": "Иванов Иван Иванович",
  "region_id": "north",
  "disability_category": "I группа",
  "allowed_companion": true
}
```

**4. Обновить токен при истечении:**
```bash
POST /api/mobile/auth/refresh-token/
Content-Type: application/json

{
  "refresh": "<refresh_token>"
}
```

## Документация

Полная документация находится в файле `MOBILE_API_DOCUMENTATION.md`

## Тестирование

Для тестирования можно использовать:
- **Postman** - импорт коллекции API
- **curl** - командная строка
- **Flutter/Dart** - HTTP клиент в мобильном приложении

### Пример curl запроса:
```bash
curl -X GET "http://localhost:8000/api/mobile/passengers/profile/" \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc..." \
  -H "Content-Type: application/json"
```
