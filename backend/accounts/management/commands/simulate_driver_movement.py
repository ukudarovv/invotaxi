"""
Management command для непрерывной имитации движения водителей по районам
Обновляет местоположение водителей небольшими шагами, имитируя реальное движение
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from accounts.models import Driver
from regions.models import Region
from geo.services import Geo
import random
import math
import time


class Command(BaseCommand):
    help = 'Непрерывно имитирует движение водителей в пределах их регионов'

    def add_arguments(self, parser):
        parser.add_argument(
            '--interval',
            type=int,
            default=5,
            help='Интервал обновления в секундах (по умолчанию 5 секунд)'
        )
        parser.add_argument(
            '--step-size',
            type=float,
            default=50.0,
            help='Размер шага движения в метрах (по умолчанию 50м)'
        )
        parser.add_argument(
            '--online-only',
            action='store_true',
            help='Обновлять местоположение только для онлайн водителей'
        )
        parser.add_argument(
            '--duration',
            type=int,
            default=0,
            help='Длительность работы в секундах (0 = бесконечно)'
        )

    def get_random_direction(self):
        """Возвращает случайное направление в радианах"""
        return random.uniform(0, 2 * math.pi)

    def move_driver_in_region(self, driver: Driver, step_size_meters: float):
        """
        Перемещает водителя на небольшое расстояние в случайном направлении
        в пределах его региона
        """
        region = driver.region
        
        # Если у водителя нет текущей позиции, генерируем новую в центре региона
        if driver.current_lat is None or driver.current_lon is None:
            # Генерируем начальную позицию в пределах региона
            lat_radius = 500 / 111000.0  # ~500 метров
            lon_radius = 500 / (111000.0 * math.cos(math.radians(region.center_lat)))
            
            angle = random.uniform(0, 2 * math.pi)
            distance_factor = math.sqrt(random.uniform(0, 0.5))  # В пределах 500м
            
            driver.current_lat = region.center_lat + lat_radius * distance_factor * math.cos(angle)
            driver.current_lon = region.center_lon + lon_radius * distance_factor * math.sin(angle)
            return driver.current_lat, driver.current_lon
        
        # Вычисляем текущее расстояние от центра региона
        current_distance = Geo.calculate_distance(
            region.center_lat, region.center_lon,
            driver.current_lat, driver.current_lon
        )
        
        # Получаем радиус региона
        if region.service_radius_meters:
            max_radius = region.service_radius_meters
        else:
            max_radius = 2000.0  # По умолчанию 2км
        
        # Если водитель слишком далеко от центра, направляем его к центру
        if current_distance > max_radius * 0.9:
            # Направление к центру региона
            angle_to_center = math.atan2(
                region.center_lat - driver.current_lat,
                region.center_lon - driver.current_lon
            )
            direction = angle_to_center + random.uniform(-0.5, 0.5)  # Небольшое отклонение
        else:
            # Случайное направление
            direction = self.get_random_direction()
        
        # Конвертируем шаг из метров в градусы
        lat_step = step_size_meters / 111000.0
        lon_step = step_size_meters / (111000.0 * math.cos(math.radians(driver.current_lat)))
        
        # Вычисляем новую позицию
        new_lat = driver.current_lat + lat_step * math.cos(direction)
        new_lon = driver.current_lon + lon_step * math.sin(direction)
        
        # Проверяем, что новая позиция не слишком далеко от центра
        new_distance = Geo.calculate_distance(
            region.center_lat, region.center_lon,
            new_lat, new_lon
        )
        
        if new_distance > max_radius:
            # Если вышли за границы, корректируем позицию
            # Направляем к центру
            angle_to_center = math.atan2(
                region.center_lat - driver.current_lat,
                region.center_lon - driver.current_lon
            )
            # Уменьшаем шаг
            correction_factor = 0.5
            new_lat = driver.current_lat + lat_step * correction_factor * math.cos(angle_to_center)
            new_lon = driver.current_lon + lon_step * correction_factor * math.sin(angle_to_center)
        
        return new_lat, new_lon

    def handle(self, *args, **options):
        interval = options['interval']
        step_size = options['step_size']
        online_only = options['online_only']
        duration = options['duration']
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Запуск имитации движения водителей...\n'
                f'Интервал обновления: {interval} секунд\n'
                f'Размер шага: {step_size} метров\n'
                f'Только онлайн: {online_only}\n'
                f'Длительность: {"бесконечно" if duration == 0 else f"{duration} секунд"}'
            )
        )
        
        start_time = time.time()
        iteration = 0
        
        try:
            while True:
                iteration += 1
                current_time = time.time()
                
                # Проверяем длительность работы
                if duration > 0 and (current_time - start_time) >= duration:
                    self.stdout.write(self.style.SUCCESS(f'\nДостигнута заданная длительность работы'))
                    break
                
                # Получаем водителей
                if online_only:
                    drivers = Driver.objects.filter(is_online=True)
                else:
                    drivers = Driver.objects.all()
                
                drivers = drivers.select_related('region').filter(region__isnull=False)
                
                updated_count = 0
                
                for driver in drivers:
                    try:
                        # Перемещаем водителя
                        new_lat, new_lon = self.move_driver_in_region(driver, step_size)
                        
                        # Обновляем местоположение
                        driver.current_lat = new_lat
                        driver.current_lon = new_lon
                        driver.last_location_update = timezone.now()
                        
                        # Сохраняем
                        driver.save(update_fields=['current_lat', 'current_lon', 'last_location_update'])
                        
                        updated_count += 1
                        
                    except Exception as e:
                        self.stdout.write(
                            self.style.ERROR(f'Ошибка при обновлении водителя {driver.name}: {e}')
                        )
                
                if iteration % 10 == 0:  # Выводим статус каждые 10 итераций
                    elapsed = current_time - start_time
                    self.stdout.write(
                        f'Итерация {iteration}: обновлено {updated_count} водителей '
                        f'(время работы: {elapsed:.1f}с)'
                    )
                
                # Ждем до следующего обновления
                time.sleep(interval)
                
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING('\n\nОстановка по запросу пользователя...'))
        
        elapsed_total = time.time() - start_time
        self.stdout.write(
            self.style.SUCCESS(
                f'\nИмитация движения завершена.\n'
                f'Всего итераций: {iteration}\n'
                f'Время работы: {elapsed_total:.1f} секунд'
            )
        )
