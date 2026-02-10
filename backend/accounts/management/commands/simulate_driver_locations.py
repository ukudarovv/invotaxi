"""
Management command для имитации текущего местоположения водителей по районам
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from accounts.models import Driver
from regions.models import Region
import random
import math


class Command(BaseCommand):
    help = 'Имитирует текущее местоположение водителей в пределах их регионов'

    def add_arguments(self, parser):
        parser.add_argument(
            '--radius',
            type=float,
            default=2000.0,
            help='Радиус в метрах от центра региона для генерации координат (по умолчанию 2000м)'
        )
        parser.add_argument(
            '--online-only',
            action='store_true',
            help='Обновлять местоположение только для онлайн водителей'
        )

    def generate_random_location_in_region(self, region: Region, radius_meters: float = 2000.0):
        """
        Генерирует случайные координаты в пределах региона
        
        Использует радиус обслуживания региона, если он задан,
        иначе использует переданный радиус
        """
        # Используем радиус обслуживания региона, если он задан
        if region.service_radius_meters:
            radius = region.service_radius_meters
        else:
            radius = radius_meters
        
        # Конвертируем радиус из метров в градусы (приблизительно)
        # 1 градус широты ≈ 111 км
        # 1 градус долготы ≈ 111 км * cos(широта)
        lat_radius = radius / 111000.0
        lon_radius = radius / (111000.0 * math.cos(math.radians(region.center_lat)))
        
        # Генерируем случайное смещение в пределах радиуса
        # Используем равномерное распределение внутри круга
        angle = random.uniform(0, 2 * math.pi)
        distance_factor = math.sqrt(random.uniform(0, 1))  # Для равномерного распределения внутри круга
        
        lat_offset = lat_radius * distance_factor * math.cos(angle)
        lon_offset = lon_radius * distance_factor * math.sin(angle)
        
        # Если есть полигон границ, можно было бы проверить, попадает ли точка внутрь
        # Но для простоты используем круговую область
        new_lat = region.center_lat + lat_offset
        new_lon = region.center_lon + lon_offset
        
        return new_lat, new_lon

    def handle(self, *args, **options):
        radius = options['radius']
        online_only = options['online_only']
        
        self.stdout.write('Имитация местоположения водителей...')
        
        # Получаем водителей
        if online_only:
            drivers = Driver.objects.filter(is_online=True)
            self.stdout.write(f'Обновление местоположения только для онлайн водителей...')
        else:
            drivers = Driver.objects.all()
        
        drivers = drivers.select_related('region')
        
        updated_count = 0
        skipped_count = 0
        
        for driver in drivers:
            if not driver.region:
                self.stdout.write(
                    self.style.WARNING(f'Водитель {driver.name} не имеет региона, пропускаем')
                )
                skipped_count += 1
                continue
            
            # Генерируем новое местоположение в пределах региона
            new_lat, new_lon = self.generate_random_location_in_region(driver.region, radius)
            
            # Обновляем местоположение
            driver.current_lat = new_lat
            driver.current_lon = new_lon
            driver.last_location_update = timezone.now()
            
            # Сохраняем без отправки сигналов (чтобы избежать лишних обновлений через WebSocket)
            driver.save(update_fields=['current_lat', 'current_lon', 'last_location_update'])
            
            updated_count += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f'Обновлено местоположение водителя {driver.name} '
                    f'({driver.region.title}): ({new_lat:.6f}, {new_lon:.6f})'
                )
            )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\nОбновлено местоположений: {updated_count}'
            )
        )
        if skipped_count > 0:
            self.stdout.write(
                self.style.WARNING(f'Пропущено водителей: {skipped_count}')
            )
