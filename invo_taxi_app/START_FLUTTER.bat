@echo off
echo ========================================
echo   Запуск Flutter приложения
echo ========================================
echo.

cd /d %~dp0

echo Установка зависимостей...
call flutter pub get

echo.
echo Запуск приложения в Chrome...
echo.
echo Для остановки нажмите q или Ctrl+C
echo.

flutter run -d chrome

pause

