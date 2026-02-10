@echo off
REM Скрипт для быстрого запуска сервера на Windows с поддержкой WebSocket

cd /d %~dp0
call venv\Scripts\activate.bat
echo Запуск Django сервера с поддержкой WebSocket через daphne...
python -m daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application
pause

