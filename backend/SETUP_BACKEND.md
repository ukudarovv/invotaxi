# Инструкция по установке и запуску Backend

## Требования

- Python 3.10+
- pip
- virtualenv (рекомендуется)

## Установка

1. Создайте виртуальное окружение:
```bash
cd backend
python -m venv venv
```

2. Активируйте виртуальное окружение:
```bash
# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

3. Установите зависимости:
```bash
pip install -r requirements.txt
```

4. Создайте файл `.env` (скопируйте из `.env.example`):
```bash
cp .env.example .env
```

5. Примените миграции:
```bash
python manage.py migrate
```

6. Загрузите мок-данные:
```bash
python manage.py load_mock_data
```

7. Создайте суперпользователя (опционально):
```bash
python manage.py createsuperuser
```

8. Запустите сервер:
```bash
python manage.py runserver
```

Backend будет доступен по адресу: `http://localhost:8000`

## API Endpoints

- API документация: см. `API_DOCUMENTATION.md`
- Admin панель: `http://localhost:8000/admin/`

## WebSocket

WebSocket endpoints доступны по адресу `ws://localhost:8000/ws/...`

## Тестирование

Для тестирования API можно использовать:
- Postman
- curl
- httpie
- Flutter приложение

### Пример запроса OTP:

```bash
curl -X POST http://localhost:8000/api/auth/phone-login/ \
  -H "Content-Type: application/json" \
  -d '{"phone": "+7 (777) 777-77-77"}'
```

### Пример проверки OTP:

```bash
curl -X POST http://localhost:8000/api/auth/verify-otp/ \
  -H "Content-Type: application/json" \
  -d '{"phone": "+7 (777) 777-77-77", "code": "123456"}'
```

## Структура проекта

```
backend/
├── invo_backend/      # Главный проект Django
├── accounts/          # Аутентификация и пользователи
├── orders/            # Заказы
├── dispatch/          # Диспетчеризация
├── geo/               # Геолокация
├── regions/           # Регионы
└── websocket/         # WebSocket consumers
```

## Troubleshooting

### Ошибка миграций
Если возникают ошибки с миграциями:
```bash
python manage.py makemigrations
python manage.py migrate
```

### Ошибка с WebSocket
Убедитесь, что установлен `channels` и правильно настроен `ASGI_APPLICATION` в `settings.py`

### Ошибка с CORS
Проверьте настройки `CORS_ALLOWED_ORIGINS` в `settings.py`

