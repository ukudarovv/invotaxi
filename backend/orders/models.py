from django.db import models
from django.core.validators import MinValueValidator
from accounts.models import User, Passenger, Driver
from regions.models import Region
from .validators import validate_pickup_time, validate_coordinates


class OrderStatus(models.TextChoices):
    """Статусы заказа"""
    DRAFT = 'draft', 'Черновик'
    SUBMITTED = 'submitted', 'Отправлено'
    AWAITING_DISPATCHER_DECISION = 'awaiting_dispatcher_decision', 'Ожидание решения диспетчера'
    REJECTED = 'rejected', 'Отклонено'
    ACTIVE_QUEUE = 'active_queue', 'В очереди'
    ASSIGNED = 'assigned', 'Назначено'
    DRIVER_EN_ROUTE = 'driver_en_route', 'Водитель в пути'
    ARRIVED_WAITING = 'arrived_waiting', 'Ожидание пассажира'
    NO_SHOW = 'no_show', 'Пассажир не пришел'
    RIDE_ONGOING = 'ride_ongoing', 'Поездка началась'
    COMPLETED = 'completed', 'Завершено'
    CANCELLED = 'cancelled', 'Отменено'
    INCIDENT = 'incident', 'Инцидент'


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

