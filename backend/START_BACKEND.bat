@echo off
echo ========================================
echo   Запуск Django Backend
echo ========================================
echo.

cd /d %~dp0

echo Активация виртуального окружения...
call venv\Scripts\activate.bat

echo.
echo Применение миграций...
python manage.py migrate

echo.
echo Запуск сервера с поддержкой WebSocket...
echo Backend будет доступен по адресу: http://localhost:8000
echo WebSocket будет доступен по адресу: ws://localhost:8000/ws/...
echo.
echo Для остановки нажмите Ctrl+C
echo.

daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application

pause

