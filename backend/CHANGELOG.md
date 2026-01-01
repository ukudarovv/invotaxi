# Changelog

## [1.0.0] - 2024-01-01

### Добавлено
- Базовая структура Django проекта
- Модели данных: User, Passenger, Driver, Order, Region, OTPCode
- REST API для всех сущностей
- OTP аутентификация по телефону
- JWT токены для авторизации
- WebSocket поддержка для real-time обновлений
- Сервис диспетчеризации заказов (DispatchEngine)
- Геолокационные сервисы (Geo, GeofenceService)
- Management команда для загрузки мок-данных
- API документация
- Docker конфигурация

### Технологии
- Django 5.0.1
- Django REST Framework
- Django Channels (WebSocket)
- JWT аутентификация
- SQLite (для разработки)

