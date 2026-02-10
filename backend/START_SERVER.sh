#!/bin/bash
# Скрипт для быстрого запуска сервера на Linux/Mac с поддержкой WebSocket

cd "$(dirname "$0")"
source venv/bin/activate
echo "Запуск Django сервера с поддержкой WebSocket через daphne..."
daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application

