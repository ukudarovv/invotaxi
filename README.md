MIT License

Copyright (c) 2026
Общественное объединение
«Атырауское областное общество лиц с инвалидностью»
БИН 911240001611
Республика Казахстан, г. Атырау

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Инво Такси - Полнофункциональное приложение такси

Проект состоит из трех основных компонентов:
- **Backend** (Django REST API)
- **Frontend** (React + TypeScript + Vite)
- **Mobile App** (Flutter)

## Быстрый старт

### Backend

1. Перейдите в папку `backend/`
2. Создайте виртуальное окружение:
   ```bash
   python -m venv venv
   venv\Scripts\activate  # Windows
   # или
   source venv/bin/activate  # Linux/Mac
   ```
3. Установите зависимости:
   ```bash
   pip install -r requirements.txt
   ```
4. **Создайте файл `.env`** в папке `backend/`:
   ```env
   SECRET_KEY=ваш-секретный-ключ-здесь
   DEBUG=True
   ```
   **Как заполнить:**
   - `SECRET_KEY`: сгенерируйте случайную строку минимум 50 символов. Для production используйте команду:
     ```bash
     python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
     ```
   - `DEBUG`: `True` для разработки, `False` для production
5. Примените миграции:
   ```bash
   python manage.py migrate
   ```
6. Загрузите тестовые данные:
   ```bash
   python manage.py load_mock_data
   ```
7. Запустите сервер:
   ```bash
   python manage.py runserver
   ```

Подробнее см. `backend/README.md` и `backend/SETUP_BACKEND.md`

### Frontend

1. Перейдите в папку `frontend/`
2. Установите зависимости:
   ```bash
   npm install
   ```
3. Запустите dev сервер:
   ```bash
   npm run dev
   ```

Подробнее см. `frontend/README.md`

### Mobile App (Flutter)

1. Перейдите в папку `invo_taxi_app/`
2. Установите зависимости:
   ```bash
   flutter pub get
   ```
3. Запустите приложение:
   ```bash
   flutter run
   ```

Подробнее см. `invo_taxi_app/README.md`

## Структура проекта

```
invotaxi/
├── backend/          # Django REST API
├── frontend/         # React Admin Dashboard
└── invo_taxi_app/    # Flutter Mobile App
```

## Конфигурация

### Backend переменные окружения

Создайте файл `backend/.env` со следующими переменными:

```env
# Обязательные переменные
SECRET_KEY=ваш-секретный-ключ-минимум-50-символов
DEBUG=True

# Для production
# DEBUG=False
# SECRET_KEY=очень-длинный-и-безопасный-ключ
```

### Frontend

Frontend использует переменные окружения из файла `.env` (если требуется). По умолчанию настроен для работы с `http://localhost:8000`

### Mobile App

Настройте URL backend в файлах конфигурации Flutter приложения.

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

## Документация

- Backend: `backend/README.md`, `backend/API_DOCUMENTATION.md`
- Frontend: `frontend/README.md`
- Mobile App: `invo_taxi_app/README.md`

## Разработка

Для разработки рекомендуется:
1. Backend запущен на `http://localhost:8000`
2. Frontend запущен на `http://localhost:5174` (или другой порт Vite)
3. Mobile App подключен к backend через настроенный URL

## Production

Для production окружения:
1. Настройте PostgreSQL вместо SQLite
2. Настройте Redis для WebSocket
3. Установите `DEBUG=False`
4. Настройте безопасный `SECRET_KEY`
5. Настройте `ALLOWED_HOSTS` и `CORS_ALLOWED_ORIGINS`

Подробнее см. `backend/FINAL_CHECKLIST.md`
