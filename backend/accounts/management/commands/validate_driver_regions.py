"""
Management command для проверки заполненности региона у водителей
"""
from django.core.management.base import BaseCommand
from accounts.models import Driver
from regions.models import Region


class Command(BaseCommand):
    help = 'Проверяет заполненность региона у всех водителей'

    def add_arguments(self, parser):
        parser.add_argument(
            '--online-only',
            action='store_true',
            help='Проверять только онлайн водителей',
        )
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Показать интерактивное меню для назначения региона водителям без региона',
        )

    def handle(self, *args, **options):
        online_only = options['online_only']
        fix = options['fix']
        
        self.stdout.write('Проверка заполненности региона у водителей...')
        self.stdout.write('=' * 60)
        
        # Получаем водителей
        drivers = Driver.objects.all()
        if online_only:
            drivers = drivers.filter(is_online=True)
            self.stdout.write(f'Проверка онлайн водителей (всего: {drivers.count()})...')
        else:
            self.stdout.write(f'Проверка всех водителей (всего: {drivers.count()})...')
        
        drivers_without_region = []
        drivers_with_region = []
        
        for driver in drivers:
            if not driver.region:
                drivers_without_region.append(driver)
            else:
                drivers_with_region.append(driver)
        
        # Выводим статистику
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Водителей с регионом: {len(drivers_with_region)}'))
        self.stdout.write(self.style.WARNING(f'Водителей без региона: {len(drivers_without_region)}'))
        self.stdout.write('')
        
        # Выводим список водителей без региона
        if drivers_without_region:
            self.stdout.write(self.style.ERROR('Водители без региона:'))
            self.stdout.write('-' * 60)
            for driver in drivers_without_region:
                status_info = f' ({driver.status})' if hasattr(driver, 'status') else ''
                online_info = ' [ОНЛАЙН]' if driver.is_online else ' [ОФЛАЙН]'
                self.stdout.write(
                    f'ID: {driver.id}, Имя: {driver.name}, '
                    f'Телефон: {driver.user.phone if driver.user else "N/A"}{status_info}{online_info}'
                )
            self.stdout.write('')
            
            # Если включен режим исправления
            if fix:
                self.stdout.write(self.style.WARNING('Режим исправления включен.'))
                regions = Region.objects.all().order_by('city__title', 'title')
                
                if not regions.exists():
                    self.stdout.write(self.style.ERROR('В базе нет регионов! Сначала создайте регионы.'))
                    return
                
                self.stdout.write('')
                self.stdout.write('Доступные регионы:')
                for idx, region in enumerate(regions, 1):
                    self.stdout.write(f'{idx}. {region.title} ({region.city.title}) - ID: {region.id}')
                
                self.stdout.write('')
                self.stdout.write('Для каждого водителя без региона можно:')
                self.stdout.write('- Ввести номер региона из списка выше')
                self.stdout.write('- Ввести "skip" для пропуска')
                self.stdout.write('- Ввести "all <номер>" для назначения одного региона всем оставшимся')
                self.stdout.write('')
                
                region_map = {str(idx): region for idx, region in enumerate(regions, 1)}
                
                for driver in drivers_without_region:
                    self.stdout.write('')
                    self.stdout.write(f'Водитель: {driver.name} (ID: {driver.id})')
                    if driver.is_online:
                        self.stdout.write(self.style.WARNING(f'  ВНИМАНИЕ: Водитель онлайн, но без региона!'))
                    
                    user_input = input(f'Выберите регион (skip для пропуска, all <номер> для всех): ').strip()
                    
                    if user_input.lower() == 'skip':
                        self.stdout.write(self.style.WARNING(f'  Пропущен'))
                        continue
                    
                    if user_input.lower().startswith('all '):
                        region_num = user_input.split()[1]
                        if region_num in region_map:
                            selected_region = region_map[region_num]
                            # Назначаем этот регион всем оставшимся водителям
                            remaining = [d for d in drivers_without_region if drivers_without_region.index(d) >= drivers_without_region.index(driver)]
                            for d in remaining:
                                d.region = selected_region
                                d.save()
                                self.stdout.write(self.style.SUCCESS(f'  Назначен регион {selected_region.title} водителю {d.name}'))
                            self.stdout.write(self.style.SUCCESS(f'  Назначен регион {selected_region.title} всем оставшимся ({len(remaining)} водителей)'))
                            break
                        else:
                            self.stdout.write(self.style.ERROR(f'  Неверный номер региона'))
                            continue
                    
                    if user_input in region_map:
                        selected_region = region_map[user_input]
                        driver.region = selected_region
                        driver.save()
                        self.stdout.write(self.style.SUCCESS(f'  Назначен регион {selected_region.title}'))
                    else:
                        self.stdout.write(self.style.ERROR(f'  Неверный номер региона, водитель пропущен'))
        
        # Финальная статистика
        self.stdout.write('')
        self.stdout.write('=' * 60)
        if drivers_without_region:
            if not fix:
                self.stdout.write(self.style.WARNING(
                    'Для назначения региона водителям используйте: '
                    'python manage.py validate_driver_regions --fix'
                ))
            else:
                # Перепроверяем после исправлений
                remaining = Driver.objects.filter(region__isnull=True)
                if online_only:
                    remaining = remaining.filter(is_online=True)
                if remaining.exists():
                    self.stdout.write(self.style.WARNING(
                        f'Осталось водителей без региона: {remaining.count()}'
                    ))
                else:
                    self.stdout.write(self.style.SUCCESS(
                        'Все водители имеют заполненный регион!'
                    ))
        else:
            self.stdout.write(self.style.SUCCESS('Все водители имеют заполненный регион!'))
