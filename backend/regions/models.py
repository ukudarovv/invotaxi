from django.db import models


class City(models.Model):
    """Модель города"""
    id = models.CharField(max_length=50, primary_key=True, verbose_name='ID города')
    title = models.CharField(max_length=100, verbose_name='Название города')
    center_lat = models.FloatField(verbose_name='Широта центра')
    center_lon = models.FloatField(verbose_name='Долгота центра')

    class Meta:
        verbose_name = 'Город'
        verbose_name_plural = 'Города'
        ordering = ['title']

    def __str__(self):
        return self.title

    @property
    def center(self):
        """Возвращает координаты центра как кортеж"""
        return (self.center_lat, self.center_lon)


class Region(models.Model):
    """Модель региона"""
    id = models.CharField(max_length=50, primary_key=True, verbose_name='ID региона')
    title = models.CharField(max_length=100, verbose_name='Название')
    city = models.ForeignKey(
        City,
        on_delete=models.CASCADE,
        related_name='regions',
        verbose_name='Город'
    )
    center_lat = models.FloatField(verbose_name='Широта центра')
    center_lon = models.FloatField(verbose_name='Долгота центра')
    polygon_coordinates = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Координаты полигона границ',
        help_text='Массив координат [[lat, lon], ...] для границ региона'
    )
    service_radius_meters = models.FloatField(
        null=True,
        blank=True,
        verbose_name='Радиус обслуживания (метры)',
        help_text='Радиус обслуживания от центра региона в метрах'
    )

    class Meta:
        verbose_name = 'Регион'
        verbose_name_plural = 'Регионы'
        ordering = ['city', 'title']

    def __str__(self):
        return f'{self.title} ({self.city.title})'

    @property
    def center(self):
        """Возвращает координаты центра как кортеж"""
        return (self.center_lat, self.center_lon)

