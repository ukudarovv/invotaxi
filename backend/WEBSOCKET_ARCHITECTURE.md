# Архитектура WebSocket и HTTP в Django

## Важно: Один сервер, один порт!

**Daphne обрабатывает И HTTP, И WebSocket на одном порту (8000).**

## Как это работает

```
Клиент
  │
  ├─ HTTP запрос → http://localhost:8000/api/regions/
  │                 ↓
  │            [Daphne на порту 8000]
  │                 ↓
  │            [ProtocolTypeRouter]
  │                 ↓
  │            [HTTP Handler] → Django REST API
  │
  └─ WebSocket → ws://localhost:8000/ws/test/
                  ↓
            [Daphne на порту 8000]
                  ↓
            [ProtocolTypeRouter]
                  ↓
            [WebSocket Handler] → Channels Consumers
```

## ProtocolTypeRouter

В файле `invo_backend/asgi.py` настроен `ProtocolTypeRouter`, который автоматически определяет тип соединения:

```python
application = LoggingProtocolTypeRouter({
    "http": django_asgi_app,           # Обработка HTTP запросов
    "websocket": JWTAuthMiddlewareStack(  # Обработка WebSocket соединений
        URLRouter(websocket_urlpatterns)
    ),
})
```

**Daphne автоматически определяет тип соединения по заголовкам:**
- HTTP запросы → обрабатываются как `http`
- WebSocket upgrade запросы → обрабатываются как `websocket`

## Текущая проблема

У вас запущены **ДВА сервера одновременно:**

1. **Daphne** (правильно) - обрабатывает HTTP и WebSocket на порту 8000
2. **Runserver** (неправильно) - обрабатывает только HTTP, перехватывает запросы

### Почему это проблема?

Когда запущены оба сервера:
- HTTP запросы могут попадать на runserver (который не поддерживает WebSocket)
- WebSocket запросы не работают, потому что runserver их не понимает
- Возникают конфликты портов

## Решение

**Запустите ТОЛЬКО один сервер - daphne:**

```bash
# Остановите ВСЕ серверы (Ctrl+C во всех терминалах)

# Затем запустите ТОЛЬКО daphne:
cd backend
START_SERVER.bat  # Windows
# или
./START_SERVER.sh  # Linux/Mac
```

**Daphne сам обработает:**
- ✅ HTTP запросы: `http://localhost:8000/api/...`
- ✅ WebSocket соединения: `ws://localhost:8000/ws/...`

## Проверка

После запуска только daphne, в логах должно быть:

```
[ASGI] Application initialized
[ASGI] WebSocket patterns: 5
Listening on TCP address 0.0.0.0:8000
```

При HTTP запросе:
```
[ASGI] Protocol type: http, Path: /api/regions/
```

При WebSocket подключении:
```
[ASGI] Protocol type: websocket, Path: /ws/test/
[TestWebSocketConsumer] Connection attempt
```

## Частые ошибки

❌ **Неправильно:** Запустить runserver на порту 8000 и daphne на порту 8001
✅ **Правильно:** Запустить ТОЛЬКО daphne на порту 8000

❌ **Неправильно:** Два сервера на одном порту
✅ **Правильно:** Один сервер (daphne) обрабатывает все

## Итог

- **Один порт (8000)**
- **Один сервер (daphne)**
- **Два протокола (HTTP и WebSocket)**
- **Автоматическое определение типа соединения**
