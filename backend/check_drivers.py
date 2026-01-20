"""Проверка импортированных водителей"""
import django
import os
import sys

sys.path.insert(0, '.')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invo_backend.settings')
django.setup()

from accounts.models import Driver

count = Driver.objects.count()
print(f'Всего водителей в системе: {count}')

if count > 0:
    print('\nПоследние 10 водителей:')
    drivers = Driver.objects.select_related('region', 'user').all().order_by('-id')[:10]
    for i, d in enumerate(drivers, 1):
        phone = d.user.phone if d.user else 'N/A'
        region = d.region.title if d.region else 'N/A'
        print(f'  {i}. {d.name} | Телефон: {phone} | Регион: {region} | Машина: {d.car_model} {d.plate_number}')
else:
    print('\nВодители не найдены. Проверьте логи импорта.')
