"""
Management command для удаления всех водителей и пассажиров
"""
from django.core.management.base import BaseCommand
from accounts.models import Driver, Passenger, User
from orders.models import Order


class Command(BaseCommand):
    help = 'Удаляет всех водителей и пассажиров (включая связанных пользователей и заказы)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--delete-orders',
            action='store_true',
            help='Также удалить все заказы',
        )

    def handle(self, *args, **options):
        delete_orders = options.get('delete_orders', False)

        # Подсчитываем количество записей
        drivers_count = Driver.objects.count()
        passengers_count = Passenger.objects.count()
        orders_count = Order.objects.count()

        self.stdout.write(f'Найдено водителей: {drivers_count}')
        self.stdout.write(f'Найдено пассажиров: {passengers_count}')
        self.stdout.write(f'Найдено заказов: {orders_count}')

        if drivers_count == 0 and passengers_count == 0:
            self.stdout.write(self.style.WARNING('Водители и пассажиры не найдены.'))
            return

        # Удаляем заказы, если указан флаг или если они мешают удалению пассажиров
        # Заказы связаны с пассажирами через PROTECT, поэтому их нужно удалить сначала
        if delete_orders or (orders_count > 0 and passengers_count > 0):
            if orders_count > 0:
                self.stdout.write('Удаление заказов...')
                deleted_orders = Order.objects.all().delete()
                self.stdout.write(
                    self.style.SUCCESS(f'Удалено заказов: {deleted_orders[0]}')
                )

        # Удаляем водителей (это также удалит связанных пользователей из-за CASCADE)
        if drivers_count > 0:
            self.stdout.write('Удаление водителей...')
            # Получаем пользователей водителей перед удалением для подсчета
            driver_users = User.objects.filter(role='driver')
            driver_users_count = driver_users.count()
            
            deleted_drivers = Driver.objects.all().delete()
            self.stdout.write(
                self.style.SUCCESS(f'Удалено водителей: {deleted_drivers[0]}')
            )
            self.stdout.write(
                self.style.SUCCESS(f'Удалено пользователей водителей: {driver_users_count}')
            )

        # Удаляем пассажиров (это также удалит связанных пользователей из-за CASCADE)
        if passengers_count > 0:
            self.stdout.write('Удаление пассажиров...')
            # Получаем пользователей пассажиров перед удалением для подсчета
            passenger_users = User.objects.filter(role='passenger')
            passenger_users_count = passenger_users.count()
            
            deleted_passengers = Passenger.objects.all().delete()
            self.stdout.write(
                self.style.SUCCESS(f'Удалено пассажиров: {deleted_passengers[0]}')
            )
            self.stdout.write(
                self.style.SUCCESS(f'Удалено пользователей пассажиров: {passenger_users_count}')
            )

        self.stdout.write(self.style.SUCCESS('Все водители и пассажиры успешно удалены!'))
