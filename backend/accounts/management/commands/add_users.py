"""
Management command для добавления водителей и пассажиров в БД
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.hashers import make_password
from regions.models import Region
from accounts.models import User, Passenger, Driver
import random


class Command(BaseCommand):
    help = 'Добавляет 10 водителей и 20 пассажиров, распределяя их по существующим регионам'

    def handle(self, *args, **options):
        self.stdout.write('Добавление водителей и пассажиров...')

        # Получаем все существующие регионы
        regions = list(Region.objects.all())
        
        if not regions:
            self.stdout.write(self.style.ERROR('В базе данных нет регионов! Сначала создайте регионы.'))
            return

        self.stdout.write(f'Найдено регионов: {len(regions)}')

        # Данные для водителей
        driver_first_names = ['Иван', 'Петр', 'Алексей', 'Дмитрий', 'Сергей', 'Андрей', 'Николай', 'Владимир', 'Максим', 'Александр']
        driver_last_names = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Смирнов', 'Волков', 'Соколов', 'Лебедев', 'Козлов', 'Новиков']
        car_models = ['Toyota Camry', 'Hyundai Solaris', 'Kia Rio', 'Lada Granta', 'Renault Logan', 'Nissan Almera', 'Volkswagen Polo', 'Skoda Rapid', 'Chevrolet Cobalt', 'Lada Vesta']

        # Создаем 10 водителей
        drivers_created = 0
        for i in range(10):
            # Выбираем регион (распределяем равномерно)
            region = regions[i % len(regions)]
            
            # Генерируем уникальные данные
            first_name = driver_first_names[i % len(driver_first_names)]
            last_name = driver_last_names[i % len(driver_last_names)]
            name = f'{last_name} {first_name}'
            
            # Генерируем уникальный телефон
            phone_base = 7000000000 + i * 1000 + random.randint(1, 999)
            phone = f'+7 ({phone_base // 10000000}) {(phone_base // 10000) % 1000:03d}-{(phone_base // 100) % 100:02d}-{phone_base % 100:02d}'
            
            # Проверяем, не существует ли уже пользователь с таким телефоном
            if User.objects.filter(phone=phone).exists():
                phone = f'+7 (9{i:02d}) {(100 + i * 7):03d}-{(10 + i * 3):02d}-{(10 + i * 5):02d}'
            
            username = f'driver_add_{i}_{phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")}'
            
            # Создаем пользователя
            user, user_created = User.objects.get_or_create(
                username=username,
                defaults={
                    'phone': phone,
                    'role': 'driver',
                    'password': make_password('driver123')  # Стандартный пароль
                }
            )
            
            if not user_created:
                # Если пользователь уже существует, пропускаем
                self.stdout.write(f'Пользователь с телефоном {phone} уже существует, пропускаем')
                continue
            
            # Создаем водителя
            car_model = car_models[i % len(car_models)]
            plate_number = f'А{(100 + i):03d}БВ {777 + i}'
            
            driver = Driver.objects.create(
                user=user,
                name=name,
                region=region,
                car_model=car_model,
                plate_number=plate_number,
                capacity=4,
                is_online=random.choice([True, False]),  # Случайно онлайн/оффлайн
                current_lat=region.center_lat if random.choice([True, False]) else None,
                current_lon=region.center_lon if random.choice([True, False]) else None,
            )
            
            drivers_created += 1
            self.stdout.write(self.style.SUCCESS(f'Создан водитель: {driver.name} в регионе {region.title}'))

        self.stdout.write(f'\nСоздано водителей: {drivers_created}')

        # Данные для пассажиров
        passenger_first_names = ['Александр', 'Михаил', 'Елена', 'Анна', 'Мария', 'Дмитрий', 'Алексей', 'Ирина', 'Ольга', 'Наталья', 'Сергей', 'Татьяна', 'Екатерина', 'Виктория', 'Юлия', 'Андрей', 'Павел', 'Роман', 'Артем', 'Владимир']
        passenger_last_names = ['Смирнов', 'Иванов', 'Кузнецов', 'Попов', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Петров', 'Волков', 'Соловьев', 'Васильев', 'Зайцев', 'Павлов', 'Семенов', 'Голубев', 'Виноградов', 'Богданов', 'Воробьев']
        passenger_middle_names = ['Иванович', 'Петрович', 'Александрович', 'Дмитриевич', 'Сергеевич', 'Ивановна', 'Петровна', 'Александровна', 'Дмитриевна', 'Сергеевна', 'Андреевич', 'Николаевич', 'Владимирович', 'Андреевна', 'Николаевна', 'Владимировна', 'Максимович', 'Алексеевич', 'Максимовна', 'Алексеевна']
        disability_categories = ['I группа', 'II группа', 'III группа', 'Ребенок-инвалид']

        # Создаем 20 пассажиров
        passengers_created = 0
        for i in range(20):
            # Выбираем регион (распределяем равномерно)
            region = regions[i % len(regions)]
            
            # Генерируем уникальные данные
            first_name = passenger_first_names[i % len(passenger_first_names)]
            last_name = passenger_last_names[i % len(passenger_last_names)]
            middle_name = passenger_middle_names[i % len(passenger_middle_names)]
            full_name = f'{last_name} {first_name} {middle_name}'
            
            # Генерируем уникальный телефон
            phone_base = 8000000000 + i * 1000 + random.randint(1, 999)
            phone = f'+7 ({phone_base // 10000000}) {(phone_base // 10000) % 1000:03d}-{(phone_base // 100) % 100:02d}-{phone_base % 100:02d}'
            
            # Проверяем, не существует ли уже пользователь с таким телефоном
            if User.objects.filter(phone=phone).exists():
                phone = f'+7 (8{i:02d}) {(200 + i * 7):03d}-{(20 + i * 3):02d}-{(20 + i * 5):02d}'
            
            username = f'passenger_add_{i}_{phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")}'
            
            # Создаем пользователя
            user, user_created = User.objects.get_or_create(
                username=username,
                defaults={
                    'phone': phone,
                    'role': 'passenger',
                    'password': make_password('passenger123')  # Стандартный пароль
                }
            )
            
            if not user_created:
                # Если пользователь уже существует, пропускаем
                self.stdout.write(f'Пользователь с телефоном {phone} уже существует, пропускаем')
                continue
            
            # Выбираем категорию инвалидности
            category = disability_categories[i % len(disability_categories)]
            # Разрешаем сопровождение для I и II группы в некоторых случаях
            allowed_companion = category in ['I группа', 'II группа'] and i % 3 == 0
            
            # Создаем пассажира
            passenger = Passenger.objects.create(
                user=user,
                full_name=full_name,
                region=region,
                disability_category=category,
                allowed_companion=allowed_companion
            )
            
            passengers_created += 1
            self.stdout.write(self.style.SUCCESS(f'Создан пассажир: {passenger.full_name} в регионе {region.title}'))

        self.stdout.write(f'\nСоздано пассажиров: {passengers_created}')
        self.stdout.write(self.style.SUCCESS(f'\nВсего создано: {drivers_created} водителей и {passengers_created} пассажиров!'))
