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
- `ws://localhost:8000/ws/dispatch-map/?token={jwt_token}` (только для staff/admin)
- `ws://localhost:8000/ws/test/` (тестовый endpoint без авторизации)

## Диагностика проблем

### Health Check Endpoint

Проверьте конфигурацию WebSocket через HTTP endpoint:

```bash
curl http://localhost:8000/api/websocket/health/
```

Или откройте в браузере: `http://localhost:8000/api/websocket/health/`

Этот endpoint покажет:
- Статус ASGI приложения
- Конфигурацию Channels
- Статус WebSocket routing
- Рекомендации по исправлению проблем

### Диагностический скрипт

Используйте встроенный скрипт для тестирования WebSocket:

**Установите зависимости (если еще не установлены):**
```bash
pip install websockets requests
```

**Запустите скрипт:**
```bash
cd backend
venv\Scripts\activate.bat  # Windows
python test_websocket.py
```

**Для тестирования с токеном:**
```bash
python test_websocket.py http://localhost:8000 YOUR_JWT_TOKEN
```

Скрипт проверит:
1. Работает ли HTTP сервер
2. Конфигурацию WebSocket (health endpoint)
3. Базовое WebSocket подключение (без авторизации)
4. Авторизованное WebSocket подключение (если указан токен)

### Логирование

После запуска через daphne, вы увидите подробные логи в консоли:
- Попытки подключения WebSocket с полной информацией о scope
- Аутентификация пользователей
- Ошибки подключения с детальными сообщениями

Пример логов:
```
[ASGI] Protocol type: websocket, Path: /ws/dispatch-map/
[JWTAuthMiddleware] WebSocket connection attempt to /ws/dispatch-map/, token present: True
[DispatchMapConsumer] Connection attempt
[DispatchMapConsumer] Connection accepted successfully
```

## Важно

- **НЕ используйте** `python manage.py runserver` для WebSocket
- **Используйте** `daphne` для запуска сервера с поддержкой WebSocket
- После установки daphne, перезапустите сервер

## Устранение неполадок

### Ошибка: WebSocket connection failed (Code 1006)

**Причины:**
1. Сервер запущен через `runserver` вместо `daphne`
2. Сервер не запущен
3. Неправильная конфигурация Channels

**Решение:**
1. Остановите сервер (если запущен через runserver)
2. Запустите через daphne: `daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application`
3. Проверьте health endpoint: `http://localhost:8000/api/websocket/health/`
4. Запустите диагностический скрипт: `python test_websocket.py`

### Ошибка: Unauthorized (Code 4001)

**Причины:**
- JWT токен отсутствует или недействителен
- Токен истек

**Решение:**
1. Проверьте наличие токена в localStorage
2. Обновите токен через API авторизации
3. Проверьте срок действия токена

### Ошибка: Forbidden (Code 4003)

**Причины:**
- Пользователь не является staff/admin
- Endpoint `/ws/dispatch-map/` доступен только для staff/admin

**Решение:**
1. Убедитесь, что пользователь имеет флаг `is_staff=True`
2. Проверьте в Django admin: Users → выберите пользователя → Staff status
3. Для обычных пользователей используйте другие endpoints:
   - `/ws/orders/{order_id}/` - для пассажиров
   - `/ws/drivers/{driver_id}/` - для водителей

### Ошибка: Basic connection test failed

**Причины:**
- WebSocket не работает вообще
- Сервер не запущен с daphne

**Решение:**
1. Убедитесь, что сервер запущен через daphne
2. Проверьте логи сервера - должны быть сообщения `[ASGI] Protocol type: websocket`
3. Если видите `Protocol type: http`, сервер не распознает WebSocket upgrade

## Проверка работы

1. Запустите сервер через daphne
2. Проверьте health endpoint: `http://localhost:8000/api/websocket/health/`
3. Запустите диагностический скрипт: `python test_websocket.py`
4. Откройте приложение и проверьте консоль браузера
5. Проверьте консоль Django - должны появиться логи о подключении WebSocket
6. Если видите ошибки, проверьте:
   - Правильность JWT токена
   - Существование order_id в базе данных (для order endpoints)
   - Права доступа пользователя (staff/admin для dispatch-map)

