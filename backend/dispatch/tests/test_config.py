"""
Тесты для модуля конфигурации параметров
"""
from django.test import TestCase
from dispatch.config import DispatchParams


class DispatchParamsTestCase(TestCase):
    """Тесты для класса DispatchParams"""
    
    def test_default_params(self):
        """Тест параметров по умолчанию"""
        params = DispatchParams.get_default()
        
        self.assertEqual(params.speed_kmh, 50.0)
        self.assertEqual(params.wait_limit_min, 20.0)
        self.assertEqual(params.region_penalty, 15.0)
        self.assertEqual(params.max_orders_per_driver, 20)
        self.assertFalse(params.allow_city_drivers_to_remote_regions)
    
    def test_from_dict(self):
        """Тест создания из словаря"""
        data = {
            'speed_kmh': 60.0,
            'wait_limit_min': 30.0,
            'max_orders_per_driver': 25
        }
        params = DispatchParams.from_dict(data)
        
        self.assertEqual(params.speed_kmh, 60.0)
        self.assertEqual(params.wait_limit_min, 30.0)
        self.assertEqual(params.max_orders_per_driver, 25)
        # Проверяем, что остальные параметры остались по умолчанию
        self.assertEqual(params.region_penalty, 15.0)
    
    def test_to_dict(self):
        """Тест преобразования в словарь"""
        params = DispatchParams.get_default()
        data = params.to_dict()
        
        self.assertIn('speed_kmh', data)
        self.assertIn('wait_limit_min', data)
        self.assertIn('region_penalty', data)
        self.assertEqual(data['speed_kmh'], 50.0)
