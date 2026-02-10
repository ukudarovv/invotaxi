from django.db import models


class Coordinate(models.Model):
    """Модель для хранения координат"""
    lat = models.FloatField(verbose_name='Широта')
    lon = models.FloatField(verbose_name='Долгота')

    class Meta:
        abstract = True

    def __str__(self):
        return f'({self.lat}, {self.lon})'

