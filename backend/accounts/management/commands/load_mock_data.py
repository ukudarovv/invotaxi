"""
Management command для загрузки мок-данных из Flutter приложения
"""
from django.core.management.base import BaseCommand
from regions.models import Region
from accounts.models import User, Passenger, Driver


class Command(BaseCommand):
    help = 'Загружает мок-данные (регионы, водители, пассажиры)'

    def handle(self, *args, **options):
        self.stdout.write('Загрузка мок-данных...')

        # Создаем регионы
        regions_data = [
            {'id': 'north', 'title': 'Северный', 'center_lat': 55.8000, 'center_lon': 37.6000},
            {'id': 'south', 'title': 'Южный', 'center_lat': 55.6000, 'center_lon': 37.6000},
            {'id': 'center', 'title': 'Центральный', 'center_lat': 55.7558, 'center_lon': 37.6173},
            {'id': 'east', 'title': 'Восточный', 'center_lat': 55.7500, 'center_lon': 37.7000},
            {'id': 'west', 'title': 'Западный', 'center_lat': 55.7500, 'center_lon': 37.5000},
        ]

        regions_dict = {}
        for region_data in regions_data:
            region, created = Region.objects.get_or_create(
                id=region_data['id'],
                defaults={
                    'title': region_data['title'],
                    'center_lat': region_data['center_lat'],
                    'center_lon': region_data['center_lon']
                }
            )
            regions_dict[region_data['id']] = region
            if created:
                self.stdout.write(self.style.SUCCESS(f'Создан регион: {region.title}'))
            else:
                self.stdout.write(f'Регион уже существует: {region.title}')

        # Создаем водителей
        first_names = ['Иван', 'Петр', 'Алексей', 'Дмитрий', 'Сергей']
        last_names = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Смирнов']
        car_models = ['Toyota Camry', 'Hyundai Solaris', 'Kia Rio', 'Lada Granta', 'Renault Logan']

        for i in range(10):
            region_index = i % len(regions_data)
            region = regions_dict[regions_data[region_index]['id']]

            name = f'{last_names[i % len(last_names)]} {first_names[i % len(first_names)]}'
            phone = f'+7 (9{i:02d}) {(100 + i * 7):03d}-{(10 + i * 3):02d}-{(10 + i * 5):02d}'

            # Создаем пользователя
            username = f'driver_{i}'
            user, user_created = User.objects.get_or_create(
                username=username,
                defaults={
                    'phone': phone,
                    'role': 'driver'
                }
            )

            # Создаем водителя
            driver, driver_created = Driver.objects.get_or_create(
                user=user,
                defaults={
                    'name': name,
                    'region': region,
                    'car_model': car_models[i % len(car_models)],
                    'plate_number': f'А{i:03d}БВ {777 + i}',
                    'capacity': 4,
                    'is_online': i < 5,  # Первые 5 онлайн
                    'current_lat': region.center_lat if i < 5 else None,
                    'current_lon': region.center_lon if i < 5 else None,
                }
            )

            if driver_created:
                self.stdout.write(self.style.SUCCESS(f'Создан водитель: {driver.name}'))
            else:
                self.stdout.write(f'Водитель уже существует: {driver.name}')

        # Создаем пассажиров
        first_names_p = ['Александр', 'Михаил', 'Елена', 'Анна', 'Мария', 'Дмитрий', 'Алексей', 'Ирина', 'Ольга', 'Наталья']
        last_names_p = ['Смирнов', 'Иванов', 'Кузнецов', 'Попов', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Петров']
        middle_names = ['Иванович', 'Петрович', 'Александрович', 'Дмитриевич', 'Сергеевич', 'Ивановна', 'Петровна', 'Александровна', 'Дмитриевна', 'Сергеевна']
        disability_categories = ['I группа', 'II группа', 'III группа', 'Ребенок-инвалид']

        # Тестовый пассажир
        test_phone = '+7 (777) 777-77-77'
        test_user, _ = User.objects.get_or_create(
            username='test_passenger',
            defaults={'phone': test_phone, 'role': 'passenger'}
        )
        Passenger.objects.get_or_create(
            user=test_user,
            defaults={
                'full_name': 'Тестов Тест Тестович',
                'region': regions_dict['north'],
                'disability_category': 'I группа',
                'allowed_companion': True
            }
        )
        self.stdout.write(self.style.SUCCESS('Создан тестовый пассажир'))

        # Остальные пассажиры
        for i in range(1, 51):
            category_index = i % len(disability_categories)
            category = disability_categories[category_index]
            allowed_companion = category_index < 2 and (i % 3 == 0)

            full_name = f'{last_names_p[i % len(last_names_p)]} {first_names_p[i % len(first_names_p)]} {middle_names[i % len(middle_names)]}'
            phone = f'+7 (9{(10 + i % 90):02d}) {(100 + i * 7 % 900):03d}-{(10 + i * 3 % 90):02d}-{(10 + i * 5 % 90):02d}'
            region = regions_dict[regions_data[i % len(regions_data)]['id']]

            username = f'passenger_{i}'
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={'phone': phone, 'role': 'passenger'}
            )

            passenger, created = Passenger.objects.get_or_create(
                user=user,
                defaults={
                    'full_name': full_name,
                    'region': region,
                    'disability_category': category,
                    'allowed_companion': allowed_companion
                }
            )

            if created and i % 10 == 0:
                self.stdout.write(f'Создано пассажиров: {i}')

        self.stdout.write(self.style.SUCCESS('Мок-данные успешно загружены!'))

