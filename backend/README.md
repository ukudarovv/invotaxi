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

3. **Настройте переменные окружения:**

Создайте файл `.env` в папке `backend/` со следующим содержимым:

```env
# Django настройки
SECRET_KEY=ваш-секретный-ключ-здесь-сгенерируйте-случайную-строку
DEBUG=True

# Для production используйте:
# DEBUG=False
# SECRET_KEY=очень-длинный-и-безопасный-секретный-ключ
```

**Как заполнить SECRET_KEY:**
- Для разработки можно использовать любую случайную строку длиной минимум 50 символов
- Для production используйте безопасный ключ, сгенерированный командой:
  ```bash
  python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
  ```
- Или используйте онлайн генератор Django secret key

**Как заполнить DEBUG:**
- `DEBUG=True` - для разработки (показывает детальные ошибки)
- `DEBUG=False` - для production (скрывает детали ошибок, требует настройки ALLOWED_HOSTS)

**Пример заполненного .env файла:**
```env
SECRET_KEY=django-insecure-abc123xyz789-замените-на-свой-ключ-для-production
DEBUG=True
```

4. Примените миграции:
```bash
python manage.py migrate
```

5. Создайте суперпользователя:
```bash
python manage.py createsuperuser
```

6. Загрузите начальные данные:
```bash
python manage.py load_mock_data
```

7. Запустите сервер:
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

## Конфигурация для Production

Для production окружения рекомендуется настроить:

1. **PostgreSQL вместо SQLite:**
   - Измените настройки базы данных в `settings.py`
   - Или используйте `docker-compose.yml` с PostgreSQL

2. **Redis для WebSocket:**
   - Установите Redis
   - Измените `CHANNEL_LAYERS` в `settings.py` на использование Redis

3. **Настройте ALLOWED_HOSTS:**
   - В `settings.py` укажите конкретные домены вместо `['*']`

4. **Настройте CORS:**
   - Укажите конкретные домены в `CORS_ALLOWED_ORIGINS`

Подробнее см. `SETUP_BACKEND.md` и `FINAL_CHECKLIST.md`
