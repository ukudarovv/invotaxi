# Примеры использования API

## 1. Получение регионов (публичный)

```bash
curl http://localhost:8000/api/regions/
```

**Ответ:**
```json
{
  "count": 5,
  "results": [
    {
      "id": "north",
      "title": "Северный",
      "center_lat": 55.8,
      "center_lon": 37.6,
      "center": {"lat": 55.8, "lon": 37.6}
    },
    ...
  ]
}
```

## 2. Аутентификация

### Шаг 1: Запрос OTP

```bash
curl -X POST http://localhost:8000/api/auth/phone-login/ \
  -H "Content-Type: application/json" \
  -d '{"phone": "+7 (777) 777-77-77"}'
```

**Ответ:**
```json
{
  "message": "OTP код отправлен",
  "expires_at": "2024-01-01T12:05:00Z"
}
```

**Важно:** OTP код выводится в консоль Django сервера.

### Шаг 2: Проверка OTP

```bash
curl -X POST http://localhost:8000/api/auth/verify-otp/ \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+7 (777) 777-77-77",
    "code": "123456"
  }'
```

**Ответ:**
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

## 3. Создание заказа

```bash
curl -X POST http://localhost:8000/api/orders/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "pickup_title": "ул. Ленина, 1",
    "dropoff_title": "ул. Пушкина, 10",
    "pickup_lat": 55.7558,
    "pickup_lon": 37.6173,
    "dropoff_lat": 55.7500,
    "dropoff_lon": 37.7000,
    "desired_pickup_time": "2024-12-02T09:00:00Z",
    "has_companion": false,
    "note": "Нужна помощь с коляской"
  }'
```

**Ответ:**
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

## 4. Получение заказов

```bash
curl http://localhost:8000/api/orders/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

С фильтрами:
```bash
curl "http://localhost:8000/api/orders/?status=assigned" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 5. Обновление статуса заказа

```bash
curl -X PATCH http://localhost:8000/api/orders/order_123/status/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "status": "driver_en_route",
    "reason": "Водитель выехал"
  }'
```

## 6. Обновление позиции водителя

```bash
curl -X PATCH http://localhost:8000/api/drivers/1/location/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "lat": 55.7558,
    "lon": 37.6173
  }'
```

## 7. Назначение заказа водителю

```bash
curl -X POST http://localhost:8000/api/dispatch/assign/order_123/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Ответ:**
```json
{
  "success": true,
  "driver_id": "1",
  "reason": "Назначен водитель...",
  "order": {
    "id": "order_123",
    "status": "assigned",
    "driver": {
      "id": "1",
      "name": "Иванов Иван",
      "car_model": "Toyota Camry"
    }
  }
}
```

## 8. Получение кандидатов для заказа

```bash
curl http://localhost:8000/api/dispatch/candidates/order_123/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Python примеры

```python
import requests

BASE_URL = 'http://localhost:8000/api'

# 1. Получение регионов
response = requests.get(f'{BASE_URL}/regions/')
regions = response.json()['results']

# 2. Аутентификация
response = requests.post(
    f'{BASE_URL}/auth/phone-login/',
    json={'phone': '+7 (777) 777-77-77'}
)

# Получить OTP из консоли Django, затем:
response = requests.post(
    f'{BASE_URL}/auth/verify-otp/',
    json={'phone': '+7 (777) 777-77-77', 'code': '123456'}
)
token = response.json()['access']

# 3. Создание заказа
headers = {'Authorization': f'Bearer {token}'}
response = requests.post(
    f'{BASE_URL}/orders/',
    json={
        'pickup_title': 'ул. Ленина, 1',
        'dropoff_title': 'ул. Пушкина, 10',
        'pickup_lat': 55.7558,
        'pickup_lon': 37.6173,
        'dropoff_lat': 55.7500,
        'dropoff_lon': 37.7000,
        'desired_pickup_time': '2024-12-02T09:00:00Z',
        'has_companion': False
    },
    headers=headers
)
order = response.json()
```

## JavaScript примеры

```javascript
const BASE_URL = 'http://localhost:8000/api';

// 1. Получение регионов
fetch(`${BASE_URL}/regions/`)
  .then(res => res.json())
  .then(data => console.log(data));

// 2. Аутентификация
fetch(`${BASE_URL}/auth/phone-login/`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({phone: '+7 (777) 777-77-77'})
})
  .then(res => res.json())
  .then(data => console.log(data));

// 3. Создание заказа (с токеном)
const token = 'YOUR_ACCESS_TOKEN';
fetch(`${BASE_URL}/orders/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    pickup_title: 'ул. Ленина, 1',
    dropoff_title: 'ул. Пушкина, 10',
    pickup_lat: 55.7558,
    pickup_lon: 37.6173,
    dropoff_lat: 55.7500,
    dropoff_lon: 37.7000,
    desired_pickup_time: '2024-12-02T09:00:00Z',
    has_companion: false
  })
})
  .then(res => res.json())
  .then(data => console.log(data));
```

## WebSocket примеры

### JavaScript

```javascript
const token = 'YOUR_ACCESS_TOKEN';
const orderId = 'order_123';
const ws = new WebSocket(`ws://localhost:8000/ws/orders/${orderId}/?token=${token}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Получено обновление:', data);
  
  if (data.type === 'order_update') {
    console.log('Заказ обновлен:', data.data);
  } else if (data.type === 'order_status_changed') {
    console.log('Статус изменен:', data.data.status);
  }
};

ws.onopen = () => {
  console.log('WebSocket подключен');
  // Отправка ping
  ws.send(JSON.stringify({type: 'ping'}));
};
```

### Python

```python
import asyncio
import websockets
import json

async def connect_to_order(order_id, token):
    uri = f'ws://localhost:8000/ws/orders/{order_id}/?token={token}'
    async with websockets.connect(uri) as websocket:
        # Отправка ping
        await websocket.send(json.dumps({'type': 'ping'}))
        
        # Получение сообщений
        async for message in websocket:
            data = json.loads(message)
            print(f'Получено: {data}')

# Использование
asyncio.run(connect_to_order('order_123', 'YOUR_ACCESS_TOKEN'))
```

