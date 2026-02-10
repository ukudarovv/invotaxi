from django.db import models
from django.db.models import Q
from django.core.validators import MinValueValidator
from decimal import Decimal
from accounts.models import User, Passenger, Driver
from regions.models import Region
from .validators import validate_pickup_time, validate_coordinates


class OrderStatus(models.TextChoices):
    """Статусы заказа"""
    DRAFT = 'draft', 'Черновик'
    SUBMITTED = 'submitted', 'Отправлено'
    AWAITING_DISPATCHER_DECISION = 'awaiting_dispatcher_decision', 'Ожидание решения диспетчера'
    REJECTED = 'rejected', 'Отклонено'
    CREATED = 'created', 'Создан'
    MATCHING = 'matching', 'Поиск водителя'
    ACTIVE_QUEUE = 'active_queue', 'В очереди'
    OFFERED = 'offered', 'Предложение отправлено'
    ASSIGNED = 'assigned', 'Назначено'
    DRIVER_EN_ROUTE = 'driver_en_route', 'Водитель в пути'
    ARRIVED_WAITING = 'arrived_waiting', 'Ожидание пассажира'
    NO_SHOW = 'no_show', 'Пассажир не пришел'
    RIDE_ONGOING = 'ride_ongoing', 'Поездка началась'
    COMPLETED = 'completed', 'Завершено'
    CANCELLED = 'cancelled', 'Отменено'
    INCIDENT = 'incident', 'Инцидент'


class PricingConfig(models.Model):
    """Модель конфигурации ценообразования (тариф)"""
    # Базовые параметры тарифа
    name = models.CharField(
        max_length=100,
        verbose_name='Название тарифа',
        help_text='Например: Econom, Comfort, Business',
        default='Econom'
    )
    base_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Посадка (базовая стоимость)',
        default=Decimal('300.00')
    )
    price_per_km = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Цена за километр',
        default=Decimal('120.00')
    )
    price_per_minute = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Цена за минуту в движении',
        default=Decimal('25.00'),
        help_text='Ставка за минуту поездки'
    )
    included_km = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Включенные километры',
        default=Decimal('0.00'),
        help_text='Бесплатные километры (обычно 0)'
    )
    included_min = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Включенные минуты',
        default=Decimal('0.00'),
        help_text='Бесплатные минуты (обычно 0)'
    )
    minimum_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Минимальная стоимость поездки',
        default=Decimal('500.00')
    )
    
    # Ожидание
    wait_free_min = models.IntegerField(
        default=3,
        verbose_name='Бесплатное ожидание (минуты)',
        help_text='Минуты бесплатного ожидания после прибытия'
    )
    wait_per_min = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Цена за минуту ожидания',
        default=Decimal('30.00'),
        help_text='Ставка за минуту ожидания после бесплатного периода'
    )
    price_per_minute_waiting = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Цена за минуту ожидания (старое поле)',
        default=Decimal('10.00'),
        help_text='DEPRECATED: используйте wait_per_min'
    )
    
    # Фиксированные сборы
    booking_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Сбор сервиса',
        default=Decimal('100.00'),
        help_text='Фиксированный сбор за бронирование'
    )
    companion_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Доплата за сопровождение',
        default=Decimal('100.00')
    )
    
    # Множители
    disability_category_multiplier = models.JSONField(
        default=dict,
        verbose_name='Множители для категорий инвалидности',
        help_text='Формат: {"I группа": 1.0, "II группа": 1.0, "III группа": 1.0, "Ребенок-инвалид": 0.8}'
    )
    night_time_multiplier = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Множитель для ночного времени',
        default=Decimal('1.2'),
        help_text='Применяется с 22:00 до 06:00'
    )
    weekend_multiplier = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Множитель для выходных',
        default=Decimal('1.1')
    )
    
    # Surge pricing параметры
    surge_enabled = models.BooleanField(
        default=True,
        verbose_name='Включен surge pricing',
        help_text='Разрешить динамическое изменение цены'
    )
    surge_min_multiplier = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('1.0'),
        verbose_name='Минимальный множитель surge',
        help_text='Минимальный множитель (обычно 1.0)'
    )
    surge_max_multiplier = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('3.0'),
        verbose_name='Максимальный множитель surge',
        help_text='Максимальный множитель (например 3.0 = +200%)'
    )
    surge_step = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.1'),
        verbose_name='Шаг множителя surge',
        help_text='Шаг округления (например 0.1 для 1.0, 1.1, 1.2...)'
    )
    surge_sensitivity = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.5'),
        verbose_name='Чувствительность surge',
        help_text='Коэффициент k для расчета множителя (0.3-0.7)'
    )
    surge_smoothing_alpha = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.7'),
        verbose_name='Коэффициент сглаживания surge',
        help_text='Alpha для экспоненциального сглаживания (0.6-0.9)'
    )
    
    # Округление
    ROUNDING_CHOICES = [
        ('1', 'До 1 ₸'),
        ('5', 'До 5 ₸'),
        ('10', 'До 10 ₸'),
        ('50', 'До 50 ₸'),
    ]
    rounding_rule = models.CharField(
        max_length=10,
        choices=ROUNDING_CHOICES,
        default='10',
        verbose_name='Правило округления',
        help_text='До какого значения округлять цену'
    )
    
    # Защита от "улета" финальной цены
    final_price_cap_multiplier = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('1.30'),
        verbose_name='Лимит отклонения финальной цены',
        help_text='Финальная цена не может превышать quote * этот множитель (например 1.30 = +30%)'
    )
    
    region = models.ForeignKey(
        Region,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pricing_configs',
        verbose_name='Регион',
        help_text='Если не указан, применяется ко всем регионам'
    )
    is_active = models.BooleanField(default=True, verbose_name='Активен')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлен')

    class Meta:
        verbose_name = 'Конфигурация ценообразования'
        verbose_name_plural = 'Конфигурации ценообразования'
        ordering = ['-is_active', '-created_at']

    def __str__(self):
        region_name = self.region.title if self.region else 'Все регионы'
        return f'{self.name} для {region_name} ({self.price_per_km} тг/км)'
    
    @staticmethod
    def get_pricing_config(region=None):
        """
        Получает активную конфигурацию ценообразования
        Сначала ищет конфигурацию для конкретного региона, затем общую
        """
        if region:
            config = PricingConfig.objects.filter(
                Q(region=region) | Q(region__isnull=True),
                is_active=True
            ).order_by('-region').first()
        else:
            config = PricingConfig.objects.filter(
                region__isnull=True,
                is_active=True
            ).first()
        
        # Если конфигурации нет, создаем дефолтную
        if not config:
            try:
                config = PricingConfig.objects.create(
                    name='Econom',
                    base_fare=Decimal('300.00'),
                    price_per_km=Decimal('120.00'),
                    price_per_minute=Decimal('25.00'),
                    minimum_fare=Decimal('500.00'),
                    wait_free_min=3,
                    wait_per_min=Decimal('30.00'),
                    booking_fee=Decimal('100.00'),
                    companion_fee=Decimal('100.00'),
                    disability_category_multiplier={
                        'I группа': 1.0,
                        'II группа': 1.0,
                        'III группа': 1.0,
                        'Ребенок-инвалид': 0.8
                    },
                    night_time_multiplier=Decimal('1.2'),
                    weekend_multiplier=Decimal('1.1'),
                    surge_enabled=True,
                    is_active=True
                )
            except Exception as e:
                import logging
                logger_instance = logging.getLogger(__name__)
                logger_instance.error(f'Ошибка создания конфигурации ценообразования: {str(e)}')
                # Если не удалось создать, пробуем получить любую активную конфигурацию
                config = PricingConfig.objects.filter(is_active=True).first()
                if not config:
                    raise ValueError('Не удалось создать или найти конфигурацию ценообразования')
        
        return config


class Order(models.Model):
    """Модель заказа"""
    id = models.CharField(max_length=100, primary_key=True, verbose_name='ID заказа')
    passenger = models.ForeignKey(
        Passenger,
        on_delete=models.PROTECT,
        related_name='orders',
        verbose_name='Пассажир'
    )
    driver = models.ForeignKey(
        Driver,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders',
        verbose_name='Водитель'
    )
    pickup_title = models.CharField(max_length=500, verbose_name='Адрес отправления')
    dropoff_title = models.CharField(max_length=500, verbose_name='Адрес назначения')
    pickup_lat = models.FloatField(verbose_name='Широта отправления')
    pickup_lon = models.FloatField(verbose_name='Долгота отправления')
    dropoff_lat = models.FloatField(verbose_name='Широта назначения')
    dropoff_lon = models.FloatField(verbose_name='Долгота назначения')
    desired_pickup_time = models.DateTimeField(
        verbose_name='Желаемое время забора',
        validators=[validate_pickup_time]
    )
    has_companion = models.BooleanField(default=False, verbose_name='С сопровождением')
    note = models.TextField(null=True, blank=True, verbose_name='Примечание')
    status = models.CharField(
        max_length=50,
        choices=OrderStatus.choices,
        default=OrderStatus.DRAFT,
        verbose_name='Статус'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    assigned_at = models.DateTimeField(null=True, blank=True, verbose_name='Назначен')
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name='Завершен')
    assignment_reason = models.TextField(null=True, blank=True, verbose_name='Причина назначения')
    rejection_reason = models.TextField(null=True, blank=True, verbose_name='Причина отклонения')
    video_recording = models.BooleanField(null=True, blank=True, verbose_name='Видеозапись')
    upload_started = models.BooleanField(null=True, blank=True, verbose_name='Загрузка начата')
    
    # Поля для расчета цены
    distance_km = models.FloatField(null=True, blank=True, verbose_name='Расстояние в километрах')
    waiting_time_minutes = models.IntegerField(null=True, blank=True, verbose_name='Время ожидания в минутах')
    
    # Предварительная цена (Quote)
    estimated_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Предварительная цена (старое поле)',
        help_text='DEPRECATED: используйте quote'
    )
    quote = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Предварительная цена (Quote)',
        help_text='Цена, показанная клиенту до поездки'
    )
    quote_surge_multiplier = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Surge множитель при расчете quote'
    )
    quote_calculated_at = models.DateTimeField(null=True, blank=True, verbose_name='Время расчета quote')
    
    # Финальная цена (Final Fare)
    final_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Финальная цена'
    )
    locked_surge_multiplier = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Зафиксированный surge множитель',
        help_text='Surge множитель, зафиксированный при назначении/старте поездки'
    )
    surge_locked_at = models.DateTimeField(null=True, blank=True, verbose_name='Время фиксации surge')
    
    # Защита от "улета" цены
    route_changed = models.BooleanField(
        default=False,
        verbose_name='Маршрут изменен',
        help_text='Клиент изменил маршрут (добавил точку/сменил адрес)'
    )
    route_change_reason = models.TextField(null=True, blank=True, verbose_name='Причина изменения маршрута')
    
    # Детализация цены (старое поле для совместимости)
    price_breakdown = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Детализация цены (старое поле)',
        help_text='Разбивка стоимости по компонентам (DEPRECATED: используйте PriceBreakdown)'
    )

    class Meta:
        verbose_name = 'Заказ'
        verbose_name_plural = 'Заказы'
        ordering = ['-created_at']

    def __str__(self):
        return f'Заказ {self.id} - {self.passenger.full_name}'

    @property
    def seats_needed(self):
        """Количество необходимых мест"""
        return 2 if self.has_companion else 1

    @property
    def pickup_coordinate(self):
        """Координаты отправления"""
        return (self.pickup_lat, self.pickup_lon)

    @property
    def dropoff_coordinate(self):
        """Координаты назначения"""
        return (self.dropoff_lat, self.dropoff_lon)

    @property
    def pickup_region(self):
        """
        Определяет регион по координатам точки pickup
        Использует regions.services.get_region_by_coordinates
        Fallback на order.passenger.region если регион не найден
        """
        from regions.services import get_region_by_coordinates
        
        # Пытаемся определить регион по координатам pickup
        region = get_region_by_coordinates(self.pickup_lat, self.pickup_lon)
        
        if region:
            return region
        
        # Fallback на район пассажира
        if hasattr(self, 'passenger') and self.passenger and hasattr(self.passenger, 'region'):
            return self.passenger.region
        
        return None


class OrderEvent(models.Model):
    """История изменений заказа"""
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='events',
        verbose_name='Заказ'
    )
    status_from = models.CharField(max_length=50, null=True, blank=True, verbose_name='Статус от')
    status_to = models.CharField(max_length=50, verbose_name='Статус до')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    description = models.TextField(null=True, blank=True, verbose_name='Описание')

    class Meta:
        verbose_name = 'Событие заказа'
        verbose_name_plural = 'События заказов'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.order.id} - {self.status_from} -> {self.status_to}'


class OrderOffer(models.Model):
    """Модель предложения заказа водителю"""
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='offers',
        verbose_name='Заказ'
    )
    driver = models.ForeignKey(
        Driver,
        on_delete=models.CASCADE,
        related_name='offers',
        verbose_name='Водитель'
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Ожидает ответа'),
            ('accepted', 'Принято'),
            ('declined', 'Отклонено'),
            ('timeout', 'Таймаут'),
        ],
        default='pending',
        verbose_name='Статус'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создано')
    expires_at = models.DateTimeField(verbose_name='Истекает')
    responded_at = models.DateTimeField(null=True, blank=True, verbose_name='Ответ получен')
    # Данные для аналитики
    eta_seconds = models.IntegerField(null=True, blank=True, verbose_name='ETA в секундах')
    distance_km = models.FloatField(null=True, blank=True, verbose_name='Расстояние в км')
    cost_score = models.FloatField(null=True, blank=True, verbose_name='Cost score')
    selection_reason = models.TextField(null=True, blank=True, verbose_name='Причина выбора')

    class Meta:
        verbose_name = 'Предложение заказа'
        verbose_name_plural = 'Предложения заказов'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['order', 'status']),
            models.Index(fields=['driver', 'status']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f'Оффер {self.order.id} -> {self.driver.name} ({self.status})'

    @property
    def is_expired(self):
        """Проверяет, истек ли оффер"""
        from django.utils import timezone
        return timezone.now() > self.expires_at


class DispatchConfig(models.Model):
    """Конфигурация алгоритма распределения заказов"""
    name = models.CharField(max_length=100, verbose_name='Название конфигурации')
    is_active = models.BooleanField(default=True, verbose_name='Активна')
    
    # Параметры фильтрации
    eta_max_seconds = models.IntegerField(
        default=720,  # 12 минут
        verbose_name='Максимальный ETA до подачи (секунды)'
    )
    k_candidates = models.IntegerField(
        default=50,
        verbose_name='Количество кандидатов для скоринга (Top-K)'
    )
    offer_timeout_seconds = models.IntegerField(
        default=15,
        verbose_name='Таймаут оффера (секунды)'
    )
    
    # Веса скоринга (нормализованные, сумма должна быть ~1.0)
    w_eta = models.FloatField(
        default=0.4,
        verbose_name='Вес ETA',
        help_text='Влияние времени подачи на cost'
    )
    w_deadhead = models.FloatField(
        default=0.15,
        verbose_name='Вес холостого пробега',
        help_text='Влияние расстояния до клиента'
    )
    w_reject = models.FloatField(
        default=0.2,
        verbose_name='Вес риска отказа',
        help_text='Штраф за вероятность отклонения'
    )
    w_cancel = models.FloatField(
        default=0.15,
        verbose_name='Вес риска отмены',
        help_text='Штраф за вероятность отмены'
    )
    w_fairness = models.FloatField(
        default=0.05,
        verbose_name='Вес справедливости',
        help_text='Баланс распределения заказов'
    )
    w_zone = models.FloatField(
        default=0.03,
        verbose_name='Вес баланса зон',
        help_text='Штраф за вытягивание из зоны спроса'
    )
    w_quality = models.FloatField(
        default=0.02,
        verbose_name='Вес качества',
        help_text='Штраф за низкий рейтинг/качество'
    )
    
    # Пороги и лимиты
    min_rating = models.FloatField(
        default=4.0,
        verbose_name='Минимальный рейтинг',
        help_text='Минимальный рейтинг для принятия заказа'
    )
    max_offers_per_hour = models.IntegerField(
        default=20,
        verbose_name='Максимум офферов в час',
        help_text='Лимит предложений водителю за час'
    )
    
    # Правила расширения поиска
    expand_search_after_seconds = models.IntegerField(
        default=30,
        verbose_name='Расширить поиск через (секунды)',
        help_text='Через сколько секунд увеличить радиус/ETA'
    )
    expand_eta_multiplier = models.FloatField(
        default=1.5,
        verbose_name='Множитель ETA при расширении',
        help_text='Во сколько раз увеличить максимальный ETA'
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создана')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлена')

    class Meta:
        verbose_name = 'Конфигурация распределения'
        verbose_name_plural = 'Конфигурации распределения'
        ordering = ['-is_active', '-created_at']

    def __str__(self):
        return f'{self.name} ({"активна" if self.is_active else "неактивна"})'

    @staticmethod
    def get_active_config():
        """Получить активную конфигурацию"""
        config = DispatchConfig.objects.filter(is_active=True).first()
        if not config:
            # Создаем дефолтную конфигурацию
            config = DispatchConfig.objects.create(
                name='Дефолтная конфигурация',
                is_active=True
            )
        return config


class SurgeZone(models.Model):
    """Модель зоны для surge pricing"""
    name = models.CharField(max_length=100, verbose_name='Название зоны')
    region = models.ForeignKey(
        Region,
        on_delete=models.CASCADE,
        related_name='surge_zones',
        verbose_name='Регион',
        null=True,
        blank=True
    )
    # Координаты зоны (полигон или центр + радиус)
    center_lat = models.FloatField(verbose_name='Широта центра')
    center_lon = models.FloatField(verbose_name='Долгота центра')
    radius_meters = models.FloatField(
        null=True,
        blank=True,
        verbose_name='Радиус (метры)',
        help_text='Если указан, зона - круг. Иначе используется polygon_coordinates'
    )
    polygon_coordinates = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Координаты полигона',
        help_text='Массив координат [[lat, lon], ...] для границ зоны'
    )
    
    # Текущий surge multiplier
    current_multiplier = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('1.0'),
        verbose_name='Текущий множитель surge'
    )
    smoothed_multiplier = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('1.0'),
        verbose_name='Сглаженный множитель surge'
    )
    
    # Метрики для расчета surge
    demand_count = models.IntegerField(default=0, verbose_name='Спрос (запросы за 5 мин)')
    supply_count = models.IntegerField(default=0, verbose_name='Предложение (доступные водители)')
    last_updated = models.DateTimeField(auto_now=True, verbose_name='Последнее обновление')
    
    is_active = models.BooleanField(default=True, verbose_name='Активна')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создана')
    
    class Meta:
        verbose_name = 'Зона surge pricing'
        verbose_name_plural = 'Зоны surge pricing'
        ordering = ['-last_updated']
        indexes = [
            models.Index(fields=['region', 'is_active']),
            models.Index(fields=['last_updated']),
        ]
    
    def __str__(self):
        return f'{self.name} (surge: {self.current_multiplier}x)'


class PriceBreakdown(models.Model):
    """Детализация цены заказа (line items)"""
    order = models.OneToOneField(
        Order,
        on_delete=models.CASCADE,
        related_name='price_breakdown_detail',
        verbose_name='Заказ'
    )
    
    # Базовые компоненты
    base_fare = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Посадка')
    distance_km = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Километры')
    distance_cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Стоимость за км')
    duration_min = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Минуты')
    duration_cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Стоимость за минуты')
    
    # Ожидание
    waiting_min = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Минуты ожидания')
    waiting_free_min = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Бесплатные минуты')
    waiting_cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Стоимость ожидания')
    
    # Фиксированные сборы
    booking_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Сбор сервиса')
    companion_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Доплата за сопровождение')
    zone_fees = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Зональные сборы')
    toll_fees = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Платные дороги')
    options_fees = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Дополнительные опции')
    
    # Множители
    night_multiplier = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('1.0'), verbose_name='Множитель ночного времени')
    weekend_multiplier = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('1.0'), verbose_name='Множитель выходных')
    disability_multiplier = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('1.0'), verbose_name='Множитель категории инвалидности')
    
    # Surge
    surge_multiplier = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('1.0'), verbose_name='Множитель surge')
    surge_applied_to = models.CharField(
        max_length=20,
        choices=[
            ('all', 'Вся сумма'),
            ('ride_only', 'Только поездка (без сборов)'),
        ],
        default='all',
        verbose_name='К чему применяется surge'
    )
    
    # Итоговые суммы
    subtotal_before_surge = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Промежуточная сумма до surge')
    subtotal_after_surge = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Промежуточная сумма после surge')
    minimum_fare_adjustment = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Доплата до минимума')
    total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Итоговая сумма')
    
    # Дополнительная информация
    rounding_applied = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'), verbose_name='Округление')
    price_type = models.CharField(
        max_length=20,
        choices=[
            ('quote', 'Предварительная (Quote)'),
            ('final', 'Финальная (Final)'),
        ],
        default='quote',
        verbose_name='Тип цены'
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создана')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлена')
    
    class Meta:
        verbose_name = 'Детализация цены'
        verbose_name_plural = 'Детализации цен'
        ordering = ['-created_at']
    
    def __str__(self):
        return f'Детализация {self.order.id} ({self.price_type})'


class CancelPolicy(models.Model):
    """Правила отмены заказов"""
    name = models.CharField(max_length=100, verbose_name='Название политики')
    region = models.ForeignKey(
        Region,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cancel_policies',
        verbose_name='Регион'
    )
    
    # Отмена до назначения водителя
    cancel_before_assigned_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        verbose_name='Штраф за отмену до назначения'
    )
    
    # Отмена после назначения, но до прибытия
    grace_cancel_seconds = models.IntegerField(
        default=120,
        verbose_name='Льготный период отмены (секунды)',
        help_text='Время после назначения, когда отмена бесплатна'
    )
    cancel_after_assigned_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('500.00'),
        verbose_name='Штраф за отмену после назначения'
    )
    
    # Отмена после прибытия водителя
    cancel_after_arrived_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('1000.00'),
        verbose_name='Штраф за отмену после прибытия'
    )
    cancel_after_arrived_include_waiting = models.BooleanField(
        default=True,
        verbose_name='Включать стоимость ожидания',
        help_text='Добавлять стоимость ожидания к штрафу'
    )
    
    is_active = models.BooleanField(default=True, verbose_name='Активна')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создана')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлена')
    
    class Meta:
        verbose_name = 'Политика отмены'
        verbose_name_plural = 'Политики отмены'
        ordering = ['-is_active', '-created_at']
    
    def __str__(self):
        return f'{self.name} ({"активна" if self.is_active else "неактивна"})'
    
    @staticmethod
    def get_active_policy(region=None):
        """Получить активную политику отмены"""
        query = CancelPolicy.objects.filter(is_active=True)
        if region:
            query = query.filter(Q(region=region) | Q(region__isnull=True))
        else:
            query = query.filter(region__isnull=True)
        
        policy = query.order_by('-region').first()
        if not policy:
            policy = CancelPolicy.objects.create(
                name='Дефолтная политика',
                is_active=True
            )
        return policy

