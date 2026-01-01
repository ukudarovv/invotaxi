# Backend для Инво Такси

Django REST API backend для приложения Инво Такси.

## Установка

1. Создайте виртуальное окружение:
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# или
venv\Scripts\activate  # Windows
```

2. Установите зависимости:
```bash
pip install -r requirements.txt
```

3. Примените миграции:
```bash
python manage.py migrate
```

4. Создайте суперпользователя:
```bash
python manage.py createsuperuser
```

5. Загрузите начальные данные:
```bash
python manage.py load_mock_data
```

6. Запустите сервер:
```bash
python manage.py runserver
```

## Структура проекта

- `accounts/` - Аутентификация и пользователи
- `orders/` - Заказы
- `dispatch/` - Система назначения заказов
- `geo/` - Геолокация
- `regions/` - Регионы
- `websocket/` - WebSocket consumers

## API Endpoints

- `/api/auth/` - Аутентификация
- `/api/orders/` - Заказы
- `/api/drivers/` - Водители
- `/api/passengers/` - Пассажиры
- `/api/dispatch/` - Диспетчеризация
- `/api/regions/` - Регионы

## WebSocket

- `/ws/orders/{order_id}/` - Обновления заказа
- `/ws/drivers/{driver_id}/` - Обновления для водителя
- `/ws/passengers/{passenger_id}/` - Обновления для пассажира

