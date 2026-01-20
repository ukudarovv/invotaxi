"""
Management command для проверки определения региона у заказов
"""
from django.core.management.base import BaseCommand
from orders.models import Order, OrderStatus
from regions.services import get_region_by_coordinates


class Command(BaseCommand):
    help = 'Проверяет возможность определения pickup_region для заказов'

    def add_arguments(self, parser):
        parser.add_argument(
            '--status',
            type=str,
            help='Фильтр по статусу заказа (например: created,matching,active_queue)',
        )

    def handle(self, *args, **options):
        status_filter = options.get('status')
        
        self.stdout.write('Проверка определения региона у заказов...')
        self.stdout.write('=' * 60)
        
        # Получаем заказы
        orders = Order.objects.all()
        
        # Фильтр по статусу
        if status_filter:
            statuses = [s.strip() for s in status_filter.split(',')]
            orders = orders.filter(status__in=statuses)
            self.stdout.write(f'Фильтр по статусам: {status_filter}')
        else:
            # По умолчанию проверяем активные заказы
            active_statuses = [
                OrderStatus.CREATED,
                OrderStatus.MATCHING,
                OrderStatus.ACTIVE_QUEUE,
                OrderStatus.OFFERED,
                OrderStatus.ASSIGNED,
            ]
            orders = orders.filter(status__in=active_statuses)
            self.stdout.write(f'Проверка активных заказов (CREATED, MATCHING, ACTIVE_QUEUE, OFFERED, ASSIGNED)')
        
        total_orders = orders.count()
        self.stdout.write(f'Всего заказов для проверки: {total_orders}')
        self.stdout.write('')
        
        orders_with_region = []
        orders_without_region = []
        orders_with_fallback = []
        
        for order in orders:
            # Пытаемся определить регион по координатам
            pickup_region = get_region_by_coordinates(order.pickup_lat, order.pickup_lon)
            
            if pickup_region:
                orders_with_region.append((order, pickup_region, 'coordinates'))
            else:
                # Fallback на район пассажира
                if hasattr(order, 'passenger') and order.passenger and hasattr(order.passenger, 'region'):
                    passenger_region = order.passenger.region
                    orders_without_region.append((order, passenger_region, 'fallback'))
                    orders_with_fallback.append(order)
                else:
                    orders_without_region.append((order, None, 'none'))
        
        # Выводим статистику
        self.stdout.write('Статистика:')
        self.stdout.write('-' * 60)
        self.stdout.write(self.style.SUCCESS(
            f'Заказов с определенным регионом по координатам: {len(orders_with_region)}'
        ))
        if orders_with_fallback:
            self.stdout.write(self.style.WARNING(
                f'Заказов с fallback на район пассажира: {len(orders_with_fallback)}'
            ))
        self.stdout.write(self.style.ERROR(
            f'Заказов без определенного региона: {len([o for o, r, s in orders_without_region if r is None])}'
        ))
        self.stdout.write('')
        
        # Выводим распределение по регионам
        from collections import Counter
        region_counts = Counter()
        for order, region, source in orders_with_region:
            if region:
                region_counts[region.title] += 1
        for order, region, source in orders_without_region:
            if region:
                region_counts[region.title] += 1
        
        if region_counts:
            self.stdout.write('Распределение заказов по регионам:')
            self.stdout.write('-' * 60)
            for region_title, count in region_counts.most_common():
                self.stdout.write(f'  {region_title}: {count}')
            self.stdout.write('')
        
        # Выводим проблемные заказы
        problematic_orders = [order for order, region, source in orders_without_region if region is None]
        if problematic_orders:
            self.stdout.write(self.style.ERROR('Заказы без определенного региона:'))
            self.stdout.write('-' * 60)
            for order in problematic_orders[:20]:  # Показываем первые 20
                self.stdout.write(
                    f'ID: {order.id}, Статус: {order.status}, '
                    f'Pickup: ({order.pickup_lat}, {order.pickup_lon}), '
                    f'Пассажир: {order.passenger.full_name if order.passenger else "N/A"}'
                )
            if len(problematic_orders) > 20:
                self.stdout.write(f'... и еще {len(problematic_orders) - 20} заказов')
            self.stdout.write('')
        
        # Выводим заказы с fallback
        if orders_with_fallback:
            self.stdout.write(self.style.WARNING('Заказы с fallback на район пассажира (первые 10):'))
            self.stdout.write('-' * 60)
            for order in orders_with_fallback[:10]:
                region = order.passenger.region if order.passenger and hasattr(order.passenger, 'region') else None
                self.stdout.write(
                    f'ID: {order.id}, Статус: {order.status}, '
                    f'Pickup: ({order.pickup_lat}, {order.pickup_lon}), '
                    f'Регион пассажира: {region.title if region else "N/A"}'
                )
            if len(orders_with_fallback) > 10:
                self.stdout.write(f'... и еще {len(orders_with_fallback) - 10} заказов')
            self.stdout.write('')
        
        # Итог
        self.stdout.write('=' * 60)
        if problematic_orders:
            self.stdout.write(self.style.ERROR(
                f'ВНИМАНИЕ: {len(problematic_orders)} заказов не могут определить регион! '
                'Эти заказы не смогут участвовать в автоматическом матчинге.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                'Все проверенные заказы могут определить регион (напрямую или через fallback)'
            ))
