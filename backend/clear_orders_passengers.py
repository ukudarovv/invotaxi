"""
Скрипт для очистки всех заказов, пассажиров и водителей

Внимание: Этот скрипт удалит все данные!
- Все заказы (Order)
- Все пассажиры (Passenger) и связанных пользователей с ролью 'passenger'
- Все водители (Driver) и связанных пользователей с ролью 'driver'
"""
import os
import sys
import django
from pathlib import Path

# Настройка Django
sys.path.insert(0, str(Path(__file__).parent))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invo_backend.settings')
django.setup()

from orders.models import Order, OrderEvent, OrderOffer
from accounts.models import Passenger, Driver, User
from django.db import transaction


def clear_all():
    """Удаляет все заказы, пассажиров и водителей"""
    print('=' * 60)
    print('Очистка заказов, пассажиров и водителей')
    print('=' * 60)
    
    # Подсчитываем количество записей
    orders_count = Order.objects.count()
    order_events_count = OrderEvent.objects.count()
    order_offers_count = OrderOffer.objects.count()
    passengers_count = Passenger.objects.count()
    passenger_users_count = User.objects.filter(role='passenger').count()
    drivers_count = Driver.objects.count()
    driver_users_count = User.objects.filter(role='driver').count()
    
    print(f'\nТекущее состояние:')
    print(f'  Заказов (Order): {orders_count}')
    print(f'  Событий заказов (OrderEvent): {order_events_count}')
    print(f'  Предложений заказов (OrderOffer): {order_offers_count}')
    print(f'  Пассажиров (Passenger): {passengers_count}')
    print(f'  Пользователей с ролью passenger: {passenger_users_count}')
    print(f'  Водителей (Driver): {drivers_count}')
    print(f'  Пользователей с ролью driver: {driver_users_count}')
    
    if orders_count == 0 and passengers_count == 0 and drivers_count == 0:
        print('\n[OK] База данных уже пуста. Нечего удалять.')
        return
    
    # Подтверждение (автоматически при запуске из командной строки)
    print('\n' + '=' * 60)
    print('ВНИМАНИЕ: Все данные будут удалены!')
    print('=' * 60)
    
    # Проверяем, есть ли аргумент для автоматического режима
    auto_mode = len(sys.argv) > 1 and sys.argv[1] in ['--yes', '-y', '--auto']
    
    if not auto_mode:
        try:
            response = input('\nПродолжить? (yes/no): ')
            if response.lower() not in ['yes', 'y', 'да', 'д']:
                print('Отменено.')
                return
        except (EOFError, KeyboardInterrupt):
            # Если нет возможности ввести ответ (автоматический режим)
            print('\nАвтоматический режим: продолжаем удаление...')
    
    print('\nНачинаем удаление...')
    
    try:
        with transaction.atomic():
            # 1. Удаляем связанные данные заказов
            if order_events_count > 0:
                deleted_events = OrderEvent.objects.all().delete()
                print(f'  [OK] Удалено событий заказов: {deleted_events[0]}')
            
            if order_offers_count > 0:
                deleted_offers = OrderOffer.objects.all().delete()
                print(f'  [OK] Удалено предложений заказов: {deleted_offers[0]}')
            
            # 2. Удаляем заказы
            if orders_count > 0:
                deleted_orders = Order.objects.all().delete()
                print(f'  [OK] Удалено заказов: {deleted_orders[0]}')
            
            # 3. Удаляем пассажиров (это также удалит связанных пользователей)
            if passengers_count > 0:
                deleted_passengers = Passenger.objects.all().delete()
                print(f'  [OK] Удалено пассажиров: {deleted_passengers[0]}')
            
            # 4. Удаляем водителей (это также удалит связанных пользователей)
            if drivers_count > 0:
                deleted_drivers = Driver.objects.all().delete()
                print(f'  [OK] Удалено водителей: {deleted_drivers[0]}')
            
            # 5. Удаляем оставшихся пользователей с ролью passenger (на всякий случай)
            remaining_passenger_users = User.objects.filter(role='passenger')
            if remaining_passenger_users.exists():
                deleted_users = remaining_passenger_users.delete()
                print(f'  [OK] Удалено оставшихся пользователей с ролью passenger: {deleted_users[0]}')
            
            # 6. Удаляем оставшихся пользователей с ролью driver (на всякий случай)
            remaining_driver_users = User.objects.filter(role='driver')
            if remaining_driver_users.exists():
                deleted_driver_users = remaining_driver_users.delete()
                print(f'  [OK] Удалено оставшихся пользователей с ролью driver: {deleted_driver_users[0]}')
        
        print('\n' + '=' * 60)
        print('[OK] Очистка завершена успешно!')
        print('=' * 60)
        
        # Проверяем результат
        print(f'\nПроверка:')
        print(f'  Заказов: {Order.objects.count()}')
        print(f'  Пассажиров: {Passenger.objects.count()}')
        print(f'  Пользователей с ролью passenger: {User.objects.filter(role="passenger").count()}')
        print(f'  Водителей: {Driver.objects.count()}')
        print(f'  Пользователей с ролью driver: {User.objects.filter(role="driver").count()}')
        
    except Exception as e:
        print(f'\n[ERROR] Ошибка при удалении: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    clear_all()
