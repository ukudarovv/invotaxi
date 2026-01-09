@echo off
echo Запуск имитации местоположения водителей...
cd /d %~dp0
call venv\Scripts\activate.bat
python manage.py simulate_driver_movement --interval 5 --step-size 50 --online-only
pause
