# Инструкция по запуску приложения

## Запуск Backend (Django)

### 1. Откройте терминал в папке backend

```bash
cd backend
```

### 2. Активируйте виртуальное окружение

**Windows (PowerShell):**
```powershell
.\venv\Scripts\Activate.ps1
```

**Windows (CMD):**
```cmd
venv\Scripts\activate.bat
```

**Linux/Mac:**
```bash
source venv/bin/activate
```

### 3. Запустите сервер

```bash
python manage.py runserver
```

Сервер будет доступен по адресу: **http://localhost:8000**

### Альтернатива: Используйте готовый скрипт

**Windows:**
```cmd
cd backend
START_SERVER.bat
```

**Linux/Mac:**
```bash
cd backend
./START_SERVER.sh
```

---

## Запуск Flutter приложения

### 1. Откройте терминал в папке Flutter приложения

```bash
cd invo_taxi_app
```

### 2. Установите зависимости (если еще не установлены)

```bash
flutter pub get
```

### 3. Запустите приложение

**В Chrome (веб-версия):**
```bash
flutter run -d chrome
```

**На Windows:**
```bash
flutter run -d windows
```

**На Android эмуляторе:**
```bash
flutter run -d android
```

**На iOS симуляторе (только Mac):**
```bash
flutter run -d ios
```

**На подключенном устройстве:**
```bash
flutter devices  # Посмотреть доступные устройства
flutter run -d <device_id>
```

---

## Порядок запуска

1. **Сначала запустите Backend:**
   - Откройте первый терминал
   - Перейдите в папку `backend`
   - Активируйте виртуальное окружение
   - Запустите `python manage.py runserver`
   - Дождитесь сообщения "Starting development server at http://127.0.0.1:8000/"

2. **Затем запустите Flutter:**
   - Откройте второй терминал
   - Перейдите в папку `invo_taxi_app`
   - Запустите `flutter run -d chrome` (или другую платформу)

---

## Проверка работы

### Backend
Откройте в браузере: http://localhost:8000/api/regions/

Должен вернуться JSON с регионами.

### Flutter
После запуска откроется окно приложения (Chrome/Windows) или эмулятор.

---

## Остановка

### Backend
В терминале нажмите `Ctrl+C`

### Flutter
В терминале нажмите `q` или `Ctrl+C`

---

## Важные замечания

1. **Backend должен быть запущен ПЕРЕД Flutter приложением**
2. **Порт 8000 должен быть свободен** - если занят, Django выведет ошибку
3. **Для Android эмулятора** используется `10.0.2.2:8000` (настроено автоматически)
4. **Для веб (Chrome)** используется `localhost:8000` (настроено автоматически)

---

## Быстрый старт (Windows)

### Терминал 1 - Backend:
```powershell
cd C:\Users\Umar\Desktop\invo\backend
.\venv\Scripts\Activate.ps1
python manage.py runserver
```

### Терминал 2 - Flutter:
```powershell
cd C:\Users\Umar\Desktop\invo\invo_taxi_app
flutter run -d chrome
```

---

## Решение проблем

### Backend не запускается
- Проверьте, что виртуальное окружение активировано
- Убедитесь, что порт 8000 свободен
- Проверьте, что все зависимости установлены: `pip install -r requirements.txt`

### Flutter не запускается
- Проверьте, что Flutter установлен: `flutter doctor`
- Установите зависимости: `flutter pub get`
- Убедитесь, что backend запущен

### Ошибки подключения
- Проверьте, что backend работает: откройте http://localhost:8000/api/regions/
- Для Android эмулятора используйте `10.0.2.2` вместо `localhost`
- Проверьте настройки CORS в backend (уже настроено для localhost)

