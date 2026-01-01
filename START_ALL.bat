@echo off
echo ========================================
echo   Запуск всего приложения
echo ========================================
echo.
echo Этот скрипт запустит Backend в отдельном окне
echo и Flutter приложение в текущем окне
echo.

cd /d %~dp0

echo Запуск Backend в новом окне...
start "Django Backend" cmd /k "cd backend && venv\Scripts\activate.bat && python manage.py runserver"

echo.
echo Ожидание запуска Backend (5 секунд)...
timeout /t 5 /nobreak >nul

echo.
echo Запуск Flutter приложения...
cd invo_taxi_app
call flutter pub get
flutter run -d chrome

pause

