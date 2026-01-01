# Настройка WebSocket для Django Backend

## Проблема

Django `runserver` **не поддерживает WebSocket**. Для работы WebSocket необходимо использовать ASGI сервер, например `daphne`.

## Решение

### 1. Установите daphne

```bash
cd backend
# Активируйте виртуальное окружение
venv\Scripts\activate.bat  # Windows
# или
source venv/bin/activate  # Linux/Mac

# Установите daphne
pip install daphne==4.0.0
```

Или установите все зависимости из requirements.txt:
```bash
pip install -r requirements.txt
```

### 2. Перезапустите сервер через daphne

**Windows:**
```bash
cd backend
START_SERVER.bat
```

**Linux/Mac:**
```bash
cd backend
./START_SERVER.sh
```

**Или вручную:**
```bash
cd backend
venv\Scripts\activate.bat  # Windows
# или
source venv/bin/activate  # Linux/Mac

daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application
```

### 3. Проверьте подключение

После запуска через daphne, WebSocket должен работать по адресу:
- `ws://localhost:8000/ws/orders/{order_id}/?token={jwt_token}`

## Логирование

После запуска через daphne, вы увидите логи в консоли:
- Попытки подключения WebSocket
- Аутентификация пользователей
- Ошибки подключения

## Важно

- **НЕ используйте** `python manage.py runserver` для WebSocket
- **Используйте** `daphne` для запуска сервера с поддержкой WebSocket
- После установки daphne, перезапустите сервер

## Проверка работы

1. Запустите сервер через daphne
2. Откройте Flutter приложение
3. Проверьте консоль Django - должны появиться логи о подключении WebSocket
4. Если видите ошибки, проверьте:
   - Правильность JWT токена
   - Существование order_id в базе данных
   - Права доступа пользователя к заказу

