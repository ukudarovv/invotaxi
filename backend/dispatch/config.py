"""
Модуль конфигурации параметров алгоритма распределения заказов
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class DispatchParams:
    """Параметры алгоритма распределения заказов"""
    
    # Параметры времени
    speed_kmh: float = 50.0  # Скорость движения (км/ч)
    road_factor: float = 1.25  # Коэффициент дороги (увеличение расстояния)
    wait_limit_min: float = 20.0  # Лимит ожидания (минуты)
    wait_period_min: float = 20.0  # Фиксированный период ожидания после scheduled_time (минуты)
    dropoff_buffer_min: float = 7.0  # Время высадки пассажира 5-10 мин (среднее 7)
    
    # Параметры штрафов
    region_penalty: float = 15.0  # Штраф за несовпадение региона
    first_last_order_region_penalty: float = 1000.0  # Штраф за первый/последний заказ вне региона
    first_last_order_region_bonus: float = -200.0  # Бонус за первый/последний заказ в регионе водителя
    remote_driver_first_order_penalty: float = 1000.0  # Штраф для отдаленных водителей за первый заказ вне региона
    remote_driver_last_order_penalty: float = 1000.0  # Штраф для отдаленных водителей за последний заказ вне региона
    risk_slack_min: float = 5.0  # Минимальный slack для применения штрафа за риск (минуты)
    risk_penalty: float = 20.0  # Штраф за риск опоздания
    imbalance_weight: float = 1.0  # Вес штрафа за перегруз
    
    # Параметры балансировки нагрузки
    max_orders_per_driver: int = 20  # Максимальное количество заказов на водителя
    underload_bonus_multiplier: float = 2.0  # Множитель бонуса для недогруженных водителей
    zero_load_driver_bonus: float = 500.0  # Бонус для водителей без заказов (минуты)
    city_driver_load_balance_bonus: float = 150.0  # Бонус для городских водителей (минуты)
    max_load_imbalance: int = 3  # Максимальная допустимая разница в загрузке
    enable_load_balancing: bool = True  # Включить балансировку нагрузки для равномерного распределения
    enable_final_load_balancing: bool = True  # Включить финальную балансировку
    
    # Параметры региональных ограничений
    allow_city_drivers_to_remote_regions: bool = False  # Разрешить городским водителям брать заказы из отдаленных регионов
    allow_remote_driver_first_order_outside_region: bool = False  # Разрешить отдаленным водителям брать первый заказ вне региона
    zero_load_driver_region_penalty_multiplier: float = 0.1  # Множитель регионального штрафа для водителей без заказов
    
    # Параметры маршрутизации
    use_osrm: bool = True  # Использовать OSRM для маршрутизации
    osrm_base_url: str = 'https://router.project-osrm.org'  # Базовый URL OSRM сервера
    use_ml_eta: bool = False  # Использовать ML для предсказания времени
    traffic_enabled: bool = True  # Учитывать пробки
    percentage_buffer: float = 0.15  # Процентный буфер для учета пробок (15%)
    fixed_buffer_min: float = 5.0  # Фиксированный буфер в минутах
    use_traffic_api: bool = False  # Использовать API пробок
    
    @classmethod
    def from_dict(cls, data: dict) -> 'DispatchParams':
        """Создать экземпляр из словаря"""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
    
    def to_dict(self) -> dict:
        """Преобразовать в словарь"""
        return {
            field.name: getattr(self, field.name)
            for field in self.__dataclass_fields__.values()
        }
    
    @classmethod
    def get_default(cls) -> 'DispatchParams':
        """Получить параметры по умолчанию"""
        return cls()


# Глобальный экземпляр параметров по умолчанию
default_params = DispatchParams.get_default()
