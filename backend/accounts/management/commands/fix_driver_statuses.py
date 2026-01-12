"""
Команда для исправления статусов водителей
Устанавливает статус ONLINE_IDLE для всех онлайн водителей без статуса
"""
from django.core.management.base import BaseCommand
from accounts.models import Driver, DriverStatus
from django.utils import timezone


class Command(BaseCommand):
    help = 'Исправляет статусы водителей: устанавливает ONLINE_IDLE для онлайн водителей'

    def handle(self, *args, **options):
        # Получаем всех онлайн водителей
        online_drivers = Driver.objects.filter(is_online=True)
        
        updated_count = 0
        
        for driver in online_drivers:
            # Если статус не установлен или OFFLINE, но водитель онлайн
            if not hasattr(driver, 'status') or driver.status is None:
                driver.status = DriverStatus.ONLINE_IDLE
                driver.idle_since = timezone.now()
                driver.save(update_fields=['status', 'idle_since'])
                updated_count += 1
                self.stdout.write(f'Обновлен водитель {driver.name}: установлен статус ONLINE_IDLE')
            elif driver.status == DriverStatus.OFFLINE:
                driver.status = DriverStatus.ONLINE_IDLE
                driver.idle_since = timezone.now()
                driver.save(update_fields=['status', 'idle_since'])
                updated_count += 1
                self.stdout.write(f'Обновлен водитель {driver.name}: изменен статус OFFLINE -> ONLINE_IDLE')
        
        # Устанавливаем OFFLINE для всех офлайн водителей
        offline_drivers = Driver.objects.filter(is_online=False)
        for driver in offline_drivers:
            if not hasattr(driver, 'status') or driver.status != DriverStatus.OFFLINE:
                driver.status = DriverStatus.OFFLINE
                driver.idle_since = None
                driver.save(update_fields=['status', 'idle_since'])
                updated_count += 1
        
        self.stdout.write(
            self.style.SUCCESS(f'Обновлено статусов водителей: {updated_count}')
        )
