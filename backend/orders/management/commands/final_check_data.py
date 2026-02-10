"""
Management command для финальной проверки данных после импорта
Проверяет все водители и заказы на готовность к работе с районными ограничениями
"""
from django.core.management.base import BaseCommand
from accounts.models import Driver
from orders.models import Order, OrderStatus
from regions.services import get_region_by_coordinates


class Command(BaseCommand):
    help = 'Финальная проверка данных: все водители с регионом, все заказы могут определить район'

    def handle(self, *args, **options):
        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS('ФИНАЛЬНАЯ ПРОВЕРКА ДАННЫХ'))
        self.stdout.write('=' * 60)
        self.stdout.write('')
        
        # 1. Проверка водителей
        self.stdout.write(self.style.WARNING('1. Проверка водителей...'))
        self.stdout.write('-' * 60)
        
        all_drivers = Driver.objects.all()
        online_drivers = Driver.objects.filter(is_online=True)
        drivers_without_region = Driver.objects.filter(region__isnull=True)
        online_drivers_without_region = Driver.objects.filter(is_online=True, region__isnull=True)
        
        self.stdout.write(f'Всего водителей: {all_drivers.count()}')
        self.stdout.write(f'Онлайн водителей: {online_drivers.count()}')
        self.stdout.write(self.style.SUCCESS(f'Водителей с регионом: {all_drivers.exclude(region__isnull=True).count()}'))
        
        if drivers_without_region.exists():
            self.stdout.write(self.style.ERROR(f'Водителей без региона: {drivers_without_region.count()}'))
            if online_drivers_without_region.exists():
                self.stdout.write(self.style.ERROR(
                    f'  ВНИМАНИЕ: {online_drivers_without_region.count()} онлайн водителей БЕЗ РЕГИОНА!'
                ))
                self.stdout.write('  Эти водители НЕ МОГУТ получать заказы!')
        else:
            self.stdout.write(self.style.SUCCESS('[OK] Все водители имеют заполненный регион'))
        
        self.stdout.write('')
        
        # 2. Проверка заказов
        self.stdout.write(self.style.WARNING('2. Проверка заказов...'))
        self.stdout.write('-' * 60)
        
        active_orders = Order.objects.filter(
            status__in=[
                OrderStatus.CREATED,
                OrderStatus.MATCHING,
                OrderStatus.ACTIVE_QUEUE,
                OrderStatus.OFFERED,
                OrderStatus.ASSIGNED,
            ]
        )
        
        orders_with_region = 0
        orders_with_fallback = 0
        orders_without_region = 0
        
        for order in active_orders:
            pickup_region = get_region_by_coordinates(order.pickup_lat, order.pickup_lon)
            if pickup_region:
                orders_with_region += 1
            else:
                if hasattr(order, 'passenger') and order.passenger and hasattr(order.passenger, 'region'):
                    orders_with_fallback += 1
                else:
                    orders_without_region += 1
        
        self.stdout.write(f'Активных заказов: {active_orders.count()}')
        self.stdout.write(self.style.SUCCESS(
            f'  С определенным регионом по координатам: {orders_with_region}'
        ))
        if orders_with_fallback > 0:
            self.stdout.write(self.style.WARNING(
                f'  С fallback на район пассажира: {orders_with_fallback}'
            ))
        if orders_without_region > 0:
            self.stdout.write(self.style.ERROR(
                f'  БЕЗ РЕГИОНА: {orders_without_region}'
            ))
            self.stdout.write('  Эти заказы НЕ МОГУТ участвовать в автоматическом матчинге!')
        else:
            self.stdout.write(self.style.SUCCESS(
                '[OK] Все активные заказы могут определить регион'
            ))
        
        self.stdout.write('')
        
        # 3. Итоговая оценка
        self.stdout.write('=' * 60)
        self.stdout.write(self.style.WARNING('ИТОГОВАЯ ОЦЕНКА ГОТОВНОСТИ'))
        self.stdout.write('=' * 60)
        
        issues = []
        
        if drivers_without_region.exists():
            issues.append(f'{drivers_without_region.count()} водителей без региона')
        if online_drivers_without_region.exists():
            issues.append(
                f'{online_drivers_without_region.count()} ОНЛАЙН водителей без региона (КРИТИЧНО!)'
            )
        if orders_without_region > 0:
            issues.append(f'{orders_without_region} заказов без определенного региона')
        
        if not issues:
            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS('[OK] СИСТЕМА ГОТОВА К РАБОТЕ'))
            self.stdout.write('')
            self.stdout.write('Все данные корректны:')
            self.stdout.write('  - Все водители имеют регион')
            self.stdout.write('  - Все активные заказы могут определить регион')
            self.stdout.write('  - Алгоритм распределения готов к работе')
        else:
            self.stdout.write('')
            self.stdout.write(self.style.ERROR('[ERROR] НАЙДЕНЫ ПРОБЛЕМЫ:'))
            for issue in issues:
                self.stdout.write(f'  - {issue}')
            self.stdout.write('')
            self.stdout.write('Рекомендуемые действия:')
            if drivers_without_region.exists():
                self.stdout.write('  1. Назначить регион водителям:')
                self.stdout.write('     python manage.py validate_driver_regions --fix')
            if orders_without_region > 0:
                self.stdout.write('  2. Проверить заказы без региона:')
                self.stdout.write('     python manage.py validate_order_regions')
        
        self.stdout.write('')
