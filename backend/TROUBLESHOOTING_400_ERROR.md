# Диагностика ошибки 400 Bad Request при обновлении статуса заказа

## Описание проблемы

При попытке обновить статус заказа через endpoint `/api/orders/{order_id}/status/` возникает ошибка 400 Bad Request.

## Возможные причины

### 1. Невалидный статус в запросе

**Симптомы:**
- Статус не из списка допустимых значений OrderStatus
- Неправильный формат данных

**Решение:**
Проверьте, что отправляемый статус соответствует одному из допустимых значений:
- `draft`, `submitted`, `awaiting_dispatcher_decision`, `rejected`
- `created`, `matching`, `active_queue`, `offered`, `assigned`
- `driver_en_route`, `arrived_waiting`, `no_show`
- `ride_ongoing`, `completed`, `cancelled`, `incident`

**Пример правильного запроса:**
```json
{
  "status": "driver_en_route",
  "reason": "Водитель выехал"
}
```

### 2. Недопустимый переход статуса

**Симптомы:**
- Текущий статус заказа не позволяет перейти к запрашиваемому статусу

**Решение:**
Проверьте таблицу допустимых переходов статусов:

| Текущий статус | Допустимые переходы |
|----------------|---------------------|
| `draft` | `submitted`, `cancelled` |
| `submitted` | `awaiting_dispatcher_decision`, `rejected`, `cancelled`, `created`, `matching` |
| `active_queue` | `matching`, `offered`, `assigned`, `cancelled` |
| `assigned` | `driver_en_route`, `matching`, `cancelled` |
| `driver_en_route` | `arrived_waiting`, `cancelled` |
| `arrived_waiting` | `ride_ongoing`, `no_show`, `cancelled` |
| `ride_ongoing` | `completed`, `incident`, `cancelled` |
| `completed` | *(нет переходов)* |
| `cancelled` | `submitted`, `active_queue`, `matching` |

### 3. Недостаточно прав

**Симптомы:**
- Пользователь пытается изменить статус, но не имеет прав

**Правила доступа:**
- **Пассажир**: может только отменять свои заказы (`cancelled`)
- **Водитель**: может изменять статусы своих заказов на:
  - `driver_en_route`
  - `arrived_waiting`
  - `ride_ongoing`
  - `completed`
  - `cancelled`
- **Администратор**: может изменять любой статус

## Улучшенная обработка ошибок

После обновления кода, при ошибке 400 вы получите детальную информацию:

```json
{
  "error": "Недопустимый переход статуса: assigned -> completed",
  "current_status": "assigned",
  "requested_status": "completed",
  "valid_transitions": ["driver_en_route", "matching", "cancelled"],
  "order_id": "order_1767955276674"
}
```

## Как диагностировать

1. **Проверьте логи сервера Django:**
   ```bash
   # В консоли Django сервера будут логи:
   # "Обновление статуса заказа {id}: текущий статус = {status}, запрос = {data}"
   # "Недопустимый переход статуса для заказа {id}: {old} -> {new}"
   ```

2. **Проверьте текущий статус заказа:**
   ```bash
   GET /api/orders/order_1767955276674/
   ```

3. **Проверьте допустимые переходы:**
   Используйте таблицу выше или проверьте ответ ошибки, который теперь содержит `valid_transitions`

## Примеры правильных запросов

### Переход из `assigned` в `driver_en_route`:
```bash
PATCH /api/orders/order_1767955276674/status/
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "driver_en_route",
  "reason": "Водитель выехал к клиенту"
}
```

### Переход из `driver_en_route` в `arrived_waiting`:
```bash
PATCH /api/orders/order_1767955276674/status/
{
  "status": "arrived_waiting",
  "reason": "Водитель прибыл"
}
```

### Переход из `arrived_waiting` в `ride_ongoing`:
```bash
PATCH /api/orders/order_1767955276674/status/
{
  "status": "ride_ongoing",
  "reason": "Поездка началась"
}
```

### Переход из `ride_ongoing` в `completed`:
```bash
PATCH /api/orders/order_1767955276674/status/
{
  "status": "completed",
  "reason": "Поездка завершена"
}
```

## Проверка на фронтенде

Убедитесь, что фронтенд отправляет правильный формат:

```typescript
// Правильно:
await ordersApi.updateOrderStatus(orderId, {
  status: "driver_en_route",
  reason: "Водитель выехал"
});

// Неправильно (статус не из списка):
await ordersApi.updateOrderStatus(orderId, {
  status: "in_progress",  // ❌ Такого статуса нет
  reason: "..."
});
```

## Логирование

Все ошибки теперь логируются в Django с детальной информацией:
- Текущий статус заказа
- Запрашиваемый статус
- Допустимые переходы
- Данные запроса

Проверьте логи Django сервера для получения дополнительной информации.
