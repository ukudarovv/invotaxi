#!/bin/bash
echo "Запуск имитации местоположения водителей..."
cd "$(dirname "$0")"
source venv/bin/activate
python manage.py simulate_driver_movement --interval 5 --step-size 50 --online-only
