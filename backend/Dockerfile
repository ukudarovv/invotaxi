# Dockerfile для production деплоя (опционально)
FROM python:3.10-slim

WORKDIR /app

# Установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование проекта
COPY . .

# Сбор статики
RUN python manage.py collectstatic --noinput

# Применение миграций
RUN python manage.py migrate

# Запуск сервера
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "invo_backend.wsgi:application"]

