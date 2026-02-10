"""
Django management command для очистки таблиц пассажиров и заказов.

Использование:
    python manage.py clear_passengers_orders
    python manage.py clear_passengers_orders --confirm
"""
from django.core.management.base import BaseCommand, CommandError
from accounts.models import Passenger, User
from orders.models import Order


class Command(BaseCommand):
    help = 'Очистка таблиц пассажиров и заказов'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Подтверждение очистки (без этого флага команда не выполнится)'
        )
        parser.add_argument(
            '--orders-only',
            action='store_true',
            help='Удалить только заказы, пассажиров оставить'
        )
        parser.add_argument(
            '--passengers-only',
            action='store_true',
            help='Удалить только пассажиров (и связанные заказы), заказы без пассажиров оставить'
        )

    def handle(self, *args, **options):
        confirm = options.get('confirm', False)
        orders_only = options.get('orders_only', False)
        passengers_only = options.get('passengers_only', False)
        
        if not confirm:
            self.stdout.write(self.style.WARNING(
                '\nВНИМАНИЕ: Эта команда удалит данные из базы!\n'
                'Используйте --confirm для подтверждения.'
            ))
            
            if orders_only:
                orders_count = Order.objects.count()
                self.stdout.write(f'Будет удалено заказов: {orders_count}')
            elif passengers_only:
                passengers_count = Passenger.objects.count()
                orders_count = Order.objects.count()
                self.stdout.write(f'Будет удалено пассажиров: {passengers_count}')
                self.stdout.write(f'Будет удалено связанных заказов: {orders_count}')
            else:
                orders_count = Order.objects.count()
                passengers_count = Passenger.objects.count()
                self.stdout.write(f'Будет удалено заказов: {orders_count}')
                self.stdout.write(f'Будет удалено пассажиров: {passengers_count}')
            
            self.stdout.write(self.style.WARNING('\nДобавьте --confirm для подтверждения.'))
            return
        
        try:
            if orders_only:
                # Удаляем только заказы
                orders_count = Order.objects.count()
                Order.objects.all().delete()
                self.stdout.write(self.style.SUCCESS(f'Удалено заказов: {orders_count}'))
                
            elif passengers_only:
                # Удаляем пассажиров и связанные заказы
                passengers_count = Passenger.objects.count()
                orders_count = Order.objects.count()
                
                # Сначала удаляем заказы (так как они ссылаются на пассажиров)
                Order.objects.all().delete()
                
                # Затем удаляем пассажиров
                # Также удаляем пользователей, которые были связаны только с пассажирами
                for passenger in Passenger.objects.all():
                    user = passenger.user
                    passenger.delete()
                    # Проверяем, нет ли у пользователя других связанных объектов
                    if not hasattr(user, 'driver'):
                        user.delete()
                
                self.stdout.write(self.style.SUCCESS(f'Удалено пассажиров: {passengers_count}'))
                self.stdout.write(self.style.SUCCESS(f'Удалено заказов: {orders_count}'))
                
            else:
                # Удаляем все: сначала заказы, затем пассажиров
                orders_count = Order.objects.count()
                passengers_count = Passenger.objects.count()
                
                # Удаляем заказы
                Order.objects.all().delete()
                self.stdout.write(self.style.SUCCESS(f'Удалено заказов: {orders_count}'))
                
                # Удаляем пассажиров и связанных пользователей
                for passenger in Passenger.objects.all():
                    user = passenger.user
                    passenger.delete()
                    # Проверяем, нет ли у пользователя других связанных объектов
                    if not hasattr(user, 'driver'):
                        user.delete()
                
                self.stdout.write(self.style.SUCCESS(f'Удалено пассажиров: {passengers_count}'))
                
            self.stdout.write(self.style.SUCCESS('\nОчистка завершена успешно!'))
            
        except Exception as e:
            raise CommandError(f'Ошибка при очистке: {e}')
