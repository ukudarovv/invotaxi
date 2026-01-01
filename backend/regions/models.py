from django.db import models


class Region(models.Model):
    """Модель региона"""
    id = models.CharField(max_length=50, primary_key=True, verbose_name='ID региона')
    title = models.CharField(max_length=100, verbose_name='Название')
    center_lat = models.FloatField(verbose_name='Широта центра')
    center_lon = models.FloatField(verbose_name='Долгота центра')

    class Meta:
        verbose_name = 'Регион'
        verbose_name_plural = 'Регионы'
        ordering = ['title']

    def __str__(self):
        return self.title

    @property
    def center(self):
        """Возвращает координаты центра как кортеж"""
        return (self.center_lat, self.center_lon)

