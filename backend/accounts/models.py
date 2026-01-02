from django.contrib.auth.models import AbstractUser
from django.db import models
from regions.models import Region


class User(AbstractUser):
    """Базовая модель пользователя"""
    phone = models.CharField(max_length=20, unique=True, verbose_name='Телефон')
    role = models.CharField(
        max_length=20,
        choices=[
            ('passenger', 'Пассажир'),
            ('driver', 'Водитель'),
            ('admin', 'Администратор'),
        ],
        default='passenger',
        verbose_name='Роль'
    )

    class Meta:
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'

    def __str__(self):
        return f'{self.username} ({self.phone})'


class OTPCode(models.Model):
    """Модель для хранения OTP кодов"""
    phone = models.CharField(max_length=20, verbose_name='Телефон')
    code = models.CharField(max_length=6, verbose_name='Код')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    is_used = models.BooleanField(default=False, verbose_name='Использован')
    expires_at = models.DateTimeField(verbose_name='Истекает')

    class Meta:
        verbose_name = 'OTP код'
        verbose_name_plural = 'OTP коды'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.phone} - {self.code}'


class Passenger(models.Model):
    """Модель пассажира"""
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='passenger',
        verbose_name='Пользователь'
    )
    full_name = models.CharField(max_length=200, verbose_name='Полное имя')
    region = models.ForeignKey(
        Region,
        on_delete=models.PROTECT,
        related_name='passengers',
        verbose_name='Регион'
    )
    disability_category = models.CharField(
        max_length=50,
        verbose_name='Категория инвалидности',
        choices=[
            ('I группа', 'I группа'),
            ('II группа', 'II группа'),
            ('III группа', 'III группа'),
            ('Ребенок-инвалид', 'Ребенок-инвалид'),
        ]
    )
    allowed_companion = models.BooleanField(
        default=False,
        verbose_name='Разрешено сопровождение'
    )

    class Meta:
        verbose_name = 'Пассажир'
        verbose_name_plural = 'Пассажиры'

    def __str__(self):
        return self.full_name


class Driver(models.Model):
    """Модель водителя"""
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='driver',
        verbose_name='Пользователь'
    )
    name = models.CharField(max_length=200, verbose_name='Имя')
    region = models.ForeignKey(
        Region,
        on_delete=models.PROTECT,
        related_name='drivers',
        verbose_name='Регион'
    )
    car_model = models.CharField(max_length=100, verbose_name='Модель машины')
    plate_number = models.CharField(max_length=20, verbose_name='Номер машины')
    capacity = models.IntegerField(default=4, verbose_name='Вместимость')
    is_online = models.BooleanField(default=False, verbose_name='Онлайн')
    current_lat = models.FloatField(null=True, blank=True, verbose_name='Текущая широта')
    current_lon = models.FloatField(null=True, blank=True, verbose_name='Текущая долгота')
    last_location_update = models.DateTimeField(null=True, blank=True, verbose_name='Последнее обновление позиции')

    class Meta:
        verbose_name = 'Водитель'
        verbose_name_plural = 'Водители'

    def __str__(self):
        return f'{self.name} ({self.car_model})'

    @property
    def current_position(self):
        """Возвращает текущую позицию как кортеж или None"""
        if self.current_lat is not None and self.current_lon is not None:
            return (self.current_lat, self.current_lon)
        return None


class UserActivityLog(models.Model):
    """Модель для отслеживания действий пользователей"""
    ACTION_TYPES = [
        ('create', 'Создание'),
        ('update', 'Обновление'),
        ('delete', 'Удаление'),
        ('block', 'Блокировка'),
        ('unblock', 'Разблокировка'),
        ('password_reset', 'Сброс пароля'),
        ('role_change', 'Изменение роли'),
        ('login', 'Вход в систему'),
        ('logout', 'Выход из системы'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='activity_logs',
        verbose_name='Пользователь'
    )
    action_type = models.CharField(
        max_length=20,
        choices=ACTION_TYPES,
        verbose_name='Тип действия'
    )
    description = models.TextField(verbose_name='Описание')
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name='IP адрес')
    performed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='performed_actions',
        verbose_name='Выполнено пользователем'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создано')

    class Meta:
        verbose_name = 'Лог активности пользователя'
        verbose_name_plural = 'Логи активности пользователей'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['action_type', '-created_at']),
        ]

    def __str__(self):
        return f'{self.user.username} - {self.get_action_type_display()} - {self.created_at}'
