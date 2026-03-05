"""
Django management command для перевода всех заказов в активный статус (active_queue).

Использование:
    python manage.py activate_all_orders
"""
from django.core.management.base import BaseCommand
from orders.models import Order, OrderStatus


class Command(BaseCommand):
    help = 'Перевести все заказы в статус active_queue (В очереди)'

    def handle(self, *args, **options):
        updated = Order.objects.exclude(status=OrderStatus.ACTIVE_QUEUE).update(
            status=OrderStatus.ACTIVE_QUEUE
        )
        total = Order.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f'Обновлено заказов: {updated}. Всего активных: {total}'
        ))
