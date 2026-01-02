"""
Management command для загрузки мок-данных из Flutter приложения
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from regions.models import Region, City
from accounts.models import User, Passenger, Driver
from orders.models import Order, OrderStatus, PricingConfig
from orders.services import PriceCalculator


class Command(BaseCommand):
    help = 'Загружает мок-данные (регионы, водители, пассажиры)'

    def handle(self, *args, **options):
        self.stdout.write('Загрузка мок-данных...')

        # Создаем город Атырау
        # Координаты Атырау: 55.7558, 37.6173 (центр города)
        atyrau_city, city_created = City.objects.get_or_create(
            id='atyrau',
            defaults={
                'title': 'Атырау',
                'center_lat': 55.7558,
                'center_lon': 37.6173
            }
        )
        # Обновляем координаты города, если он уже существует
        if not city_created:
            atyrau_city.center_lat = 55.7558
            atyrau_city.center_lon = 37.6173
            atyrau_city.save()
            self.stdout.write(f'Обновлены координаты города: {atyrau_city.title}')
        else:
            self.stdout.write(self.style.SUCCESS(f'Создан город: {atyrau_city.title}'))

        # Создаем регионы для города Атырау
        regions_data = [
            {'id': 'atyrau_center', 'title': 'Центральный район', 'center_lat': 55.7558, 'center_lon': 37.6173},
            {'id': 'atyrau_north', 'title': 'Северный район', 'center_lat': 55.8, 'center_lon': 37.6},
            {'id': 'atyrau_south', 'title': 'Южный район', 'center_lat': 55.6, 'center_lon': 37.6},
            {'id': 'atyrau_east', 'title': 'Восточный район', 'center_lat': 55.75, 'center_lon': 37.7},
            {'id': 'atyrau_west', 'title': 'Западный район', 'center_lat': 55.75, 'center_lon': 37.5},
        ]

        regions_dict = {}
        for region_data in regions_data:
            region, created = Region.objects.get_or_create(
                id=region_data['id'],
                defaults={
                    'title': region_data['title'],
                    'city': atyrau_city,
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
                'region': regions_dict['atyrau_center'],
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

        # Создаем конфигурацию ценообразования для Атырау
        pricing_config, _ = PricingConfig.objects.get_or_create(
            region=None,  # Общая конфигурация
            defaults={
                'price_per_km': 50.00,
                'price_per_minute_waiting': 10.00,
                'minimum_fare': 200.00,
                'companion_fee': 100.00,
                'disability_category_multiplier': {
                    'I группа': 1.0,
                    'II группа': 1.0,
                    'III группа': 1.0,
                    'Ребенок-инвалид': 0.8
                },
                'night_time_multiplier': 1.2,
                'weekend_multiplier': 1.1,
                'is_active': True
            }
        )
        self.stdout.write(self.style.SUCCESS('Создана конфигурация ценообразования'))

        # Создаем тестовые заказы с адресами в Атырау
        atyrau_addresses = [
            {'pickup': 'ул. Сатпаева, 1', 'pickup_lat': 47.1067, 'pickup_lon': 51.9167, 'dropoff': 'пр. Азаттык, 45', 'dropoff_lat': 47.1100, 'dropoff_lon': 51.9200},
            {'pickup': 'мкр. Привокзальный, д. 12', 'pickup_lat': 47.1000, 'pickup_lon': 51.9100, 'dropoff': 'ул. Бейбитшилик, 78', 'dropoff_lat': 47.1150, 'dropoff_lon': 51.9250},
            {'pickup': 'пр. Абая, 123', 'pickup_lat': 47.1050, 'pickup_lon': 51.9150, 'dropoff': 'ул. Курмангазы, 56', 'dropoff_lat': 47.1080, 'dropoff_lon': 51.9180},
            {'pickup': 'мкр. Жилой массив, д. 34', 'pickup_lat': 47.1200, 'pickup_lon': 51.9300, 'dropoff': 'ул. Махамбета, 90', 'dropoff_lat': 47.1020, 'dropoff_lon': 51.9120},
            {'pickup': 'пр. Нефтяников, 67', 'pickup_lat': 47.0950, 'pickup_lon': 51.9050, 'dropoff': 'ул. Айтеке би, 23', 'dropoff_lat': 47.1120, 'dropoff_lon': 51.9220},
        ]

        # Получаем первых 5 пассажиров для создания заказов
        passengers_list = list(Passenger.objects.all()[:5])
        drivers_list = list(Driver.objects.filter(is_online=True)[:5])

        for i, addr in enumerate(atyrau_addresses):
            if i < len(passengers_list):
                passenger = passengers_list[i]
                driver = drivers_list[i] if i < len(drivers_list) else None
                
                import time
                order_id = f'order_atyrau_{int(time.time() * 1000) + i}'
                
                order, created = Order.objects.get_or_create(
                    id=order_id,
                    defaults={
                        'passenger': passenger,
                        'driver': driver,
                        'pickup_title': addr['pickup'],
                        'dropoff_title': addr['dropoff'],
                        'pickup_lat': addr['pickup_lat'],
                        'pickup_lon': addr['pickup_lon'],
                        'dropoff_lat': addr['dropoff_lat'],
                        'dropoff_lon': addr['dropoff_lon'],
                        'desired_pickup_time': timezone.now() + timedelta(hours=i+1),
                        'has_companion': passenger.allowed_companion,
                        'status': OrderStatus.ASSIGNED if driver else OrderStatus.ACTIVE_QUEUE,
                        'assigned_at': timezone.now() if driver else None,
                    }
                )
                
                if created:
                    # Рассчитываем цену
                    price_data = PriceCalculator.calculate_estimated_price(order)
                    order.distance_km = price_data['distance_km']
                    order.waiting_time_minutes = price_data['waiting_time_minutes']
                    order.estimated_price = price_data['estimated_price']
                    order.price_breakdown = price_data['price_breakdown']
                    
                    # Если заказ завершен, рассчитываем финальную цену
                    if order.status == OrderStatus.COMPLETED:
                        final_price_data = PriceCalculator.calculate_final_price(order)
                        order.final_price = final_price_data['final_price']
                    
                    order.save()
                    self.stdout.write(self.style.SUCCESS(f'Создан заказ: {order.id}'))

        self.stdout.write(self.style.SUCCESS('Мок-данные успешно загружены!'))

