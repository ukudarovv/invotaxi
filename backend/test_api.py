"""
Скрипт для тестирования API
"""
import requests
import json
import time

BASE_URL = 'http://localhost:8000/api'

def test_regions():
    """Тест получения регионов"""
    print("=" * 50)
    print("Тест: Получение регионов")
    print("=" * 50)
    response = requests.get(f'{BASE_URL}/regions/')
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        # API возвращает пагинированный ответ
        regions = data.get('results', data) if isinstance(data, dict) else data
        count = data.get('count', len(regions)) if isinstance(data, dict) else len(regions)
        print(f"Найдено регионов: {count}")
        for region in (regions[:3] if isinstance(regions, list) else list(regions)[:3]):
            print(f"  - {region['title']} ({region['id']})")
    print()

def test_phone_login():
    """Тест запроса OTP"""
    print("=" * 50)
    print("Тест: Запрос OTP кода")
    print("=" * 50)
    phone = '+7 (777) 777-77-77'
    response = requests.post(
        f'{BASE_URL}/auth/phone-login/',
        json={'phone': phone}
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Сообщение: {data.get('message')}")
        print(f"Код истекает: {data.get('expires_at')}")
        # В реальном приложении код придет по SMS
        # Для теста выводим в консоль (см. accounts/services.py)
        print("\n[!] Проверьте консоль Django сервера для OTP кода!")
    else:
        print(f"Ошибка: {response.text}")
    print()
    return response.status_code == 200

def test_verify_otp(otp_code=None):
    """Тест проверки OTP"""
    print("=" * 50)
    print("Тест: Проверка OTP кода")
    print("=" * 50)
    phone = '+7 (777) 777-77-77'
    
    if not otp_code:
        print("⚠️  Введите OTP код из консоли Django сервера:")
        otp_code = input("OTP код: ").strip()
    
    response = requests.post(
        f'{BASE_URL}/auth/verify-otp/',
        json={'phone': phone, 'code': otp_code}
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"[OK] Аутентификация успешна!")
        print(f"Роль: {data.get('role')}")
        if 'passenger' in data:
            print(f"Пассажир: {data['passenger']['full_name']}")
        print(f"Access token получен: {len(data.get('access', '')) > 0}")
        return data.get('access')
    else:
        print(f"❌ Ошибка: {response.text}")
    print()
    return None

def test_get_orders(token):
    """Тест получения заказов"""
    print("=" * 50)
    print("Тест: Получение заказов")
    print("=" * 50)
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.get(f'{BASE_URL}/orders/', headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Найдено заказов: {data.get('count', len(data.get('results', [])))}")
    else:
        print(f"Ошибка: {response.text}")
    print()

def test_create_order(token, passenger_id):
    """Тест создания заказа"""
    print("=" * 50)
    print("Тест: Создание заказа")
    print("=" * 50)
    headers = {'Authorization': f'Bearer {token}'}
    
    order_data = {
        'pickup_title': 'ул. Ленина, 1',
        'dropoff_title': 'ул. Пушкина, 10',
        'pickup_lat': 55.7558,
        'pickup_lon': 37.6173,
        'dropoff_lat': 55.7500,
        'dropoff_lon': 37.7000,
        'desired_pickup_time': '2024-12-02T09:00:00Z',
        'has_companion': False,
        'note': 'Тестовый заказ'
    }
    
    response = requests.post(
        f'{BASE_URL}/orders/',
        json=order_data,
        headers=headers
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 201:
        data = response.json()
        print(f"[OK] Заказ создан!")
        print(f"ID: {data.get('id')}")
        print(f"Статус: {data.get('status')}")
        return data.get('id')
    else:
        print(f"❌ Ошибка: {response.text}")
    print()
    return None

def main():
    print("\n" + "=" * 50)
    print("ТЕСТИРОВАНИЕ API ИНВО ТАКСИ")
    print("=" * 50 + "\n")
    
    # Тест 1: Регионы (публичный endpoint)
    test_regions()
    
    # Тест 2: Запрос OTP
    if test_phone_login():
        print("\nПодождите 2 секунды...")
        time.sleep(2)
        
        # Тест 3: Проверка OTP (нужно ввести код вручную)
        print("\n[!] Для продолжения тестирования нужно ввести OTP код.")
        print("Проверьте консоль Django сервера, где должен быть выведен код.")
        print("Или пропустите этот тест (нажмите Enter без ввода кода).\n")
        
        otp_code = input("Введите OTP код (или Enter для пропуска): ").strip()
        
        if otp_code:
            token = test_verify_otp(otp_code)
            
            if token:
                # Тест 4: Получение заказов
                test_get_orders(token)
                
                # Тест 5: Создание заказа (нужен passenger_id из ответа verify-otp)
                print("Для создания заказа нужен passenger_id.")
                print("Проверьте ответ verify-otp выше для получения passenger_id.\n")
        else:
            print("Тест OTP пропущен.\n")
    
    print("=" * 50)
    print("ТЕСТИРОВАНИЕ ЗАВЕРШЕНО")
    print("=" * 50)

if __name__ == '__main__':
    try:
        main()
    except requests.exceptions.ConnectionError:
        print("[ERROR] Ошибка: Не удалось подключиться к серверу.")
        print("Убедитесь, что Django сервер запущен: python manage.py runserver")
    except KeyboardInterrupt:
        print("\n\nТестирование прервано пользователем.")

