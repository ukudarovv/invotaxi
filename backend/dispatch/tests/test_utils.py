"""
Тесты для вспомогательных функций
"""
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from accounts.models import Driver, User
from orders.models import Order, Passenger
from regions.models import Region, City
from dispatch.utils import (
    calculate_load_bonus,
    calculate_region_bonus,
    calculate_city_bonus,
    get_driver_current_orders
)
from dispatch.config import DispatchParams


class UtilsTestCase(TestCase):
    """Тесты для вспомогательных функций"""
    
    def setUp(self):
        """Настройка тестовых данных"""
        # Создаем город и регион
        self.city = City.objects.create(id='test_city', title='Test City')
        self.region = Region.objects.create(
            id='test_region',
            title='Test Region',
            city=self.city,
            center_lat=51.1694,
            center_lon=71.4491,
            service_radius_meters=5000
        )
        
        # Создаем пользователя и водителя
        self.user = User.objects.create_user(
            username='test_driver',
            phone='+77001234567',
            password='testpass'
        )
        self.driver = Driver.objects.create(
            user=self.user,
            name='Test Driver',
            region=self.region,
            car_model='Test Car',
            plate_number='TEST001',
            capacity=4,
            is_online=True,
            current_lat=51.1694,
            current_lon=71.4491
        )
        
        # Создаем параметры
        self.params = DispatchParams.get_default()
    
    def test_calculate_load_bonus_zero_load(self):
        """Тест расчета бонуса для водителя без заказов"""
        routes_dict = {}
        bonus = calculate_load_bonus(
            self.driver.id, routes_dict, self.params
        )
        
        self.assertEqual(bonus, self.params.zero_load_driver_bonus)
    
    def test_calculate_load_bonus_with_orders(self):
        """Тест расчета бонуса для водителя с заказами"""
        # Создаем тестовые заказы
        passenger_user = User.objects.create_user(
            username='test_passenger',
            phone='+77001234568',
            password='testpass'
        )
        passenger = Passenger.objects.create(
            user=passenger_user,
            full_name='Test Passenger',
            region=self.region,
            disability_category='I группа'
        )
        
        orders = []
        for i in range(3):
            order = Order.objects.create(
                id=f'test_order_{i}',
                passenger=passenger,
                pickup_title='Test Pickup',
                dropoff_title='Test Dropoff',
                pickup_lat=51.1694,
                pickup_lon=71.4491,
                dropoff_lat=51.1700,
                dropoff_lon=71.4500,
                desired_pickup_time=timezone.now() + timedelta(hours=i)
            )
            orders.append(order)
        
        routes_dict = {self.driver.id: orders}
        bonus = calculate_load_bonus(
            self.driver.id, routes_dict, self.params
        )
        
        # Для 3 заказов должен быть бонус (4 - 3) * 30 * multiplier
        expected_bonus = (4 - 3) * 30.0 * self.params.underload_bonus_multiplier
        self.assertEqual(bonus, expected_bonus)
    
    def test_get_driver_current_orders(self):
        """Тест получения текущих заказов водителя"""
        routes_dict = {}
        orders = get_driver_current_orders(self.driver.id, routes_dict)
        self.assertEqual(len(orders), 0)
        
        # Добавляем заказы
        passenger_user = User.objects.create_user(
            username='test_passenger2',
            phone='+77001234569',
            password='testpass'
        )
        passenger = Passenger.objects.create(
            user=passenger_user,
            full_name='Test Passenger 2',
            region=self.region,
            disability_category='I группа'
        )
        
        order = Order.objects.create(
            id='test_order_1',
            passenger=passenger,
            pickup_title='Test Pickup',
            dropoff_title='Test Dropoff',
            pickup_lat=51.1694,
            pickup_lon=71.4491,
            dropoff_lat=51.1700,
            dropoff_lon=71.4500,
            desired_pickup_time=timezone.now()
        )
        
        routes_dict = {self.driver.id: [order]}
        orders = get_driver_current_orders(self.driver.id, routes_dict)
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0].id, 'test_order_1')
