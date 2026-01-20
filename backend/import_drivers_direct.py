"""
Прямой импорт водителей из Excel файла (без проблем с кодировкой)
"""
import os
import sys
import django
from pathlib import Path

# Настройка Django
sys.path.insert(0, str(Path(__file__).parent))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invo_backend.settings')
django.setup()

from django.core.management import call_command
from io import StringIO

# Перенаправляем вывод
old_stdout = sys.stdout
sys.stdout = mystdout = StringIO()

try:
    file_path = str(Path(__file__).parent / 'data' / 'drivers_for_import.xlsx')
    print(f'Импорт водителей из: {file_path}')
    print('=' * 60)
    
    # Запускаем команду импорта
    call_command('import_drivers_from_excel', file_path, skip_errors=True)
    
    # Получаем вывод
    output = mystdout.getvalue()
    
    # Выводим результат
    print(output)
    
    # Проверяем результат
    from accounts.models import Driver
    count = Driver.objects.count()
    print('=' * 60)
    print(f'Всего водителей в системе: {count}')
    
    if count > 0:
        print('\nПоследние 5 водителей:')
        drivers = Driver.objects.select_related('region', 'user').all().order_by('-id')[:5]
        for i, d in enumerate(drivers, 1):
            phone = d.user.phone if d.user else 'N/A'
            region = d.region.title if d.region else 'N/A'
            print(f'  {i}. {d.name} | {phone} | {region} | {d.car_model} {d.plate_number}')
    
except Exception as e:
    import traceback
    print(f'Ошибка: {e}')
    traceback.print_exc()
finally:
    sys.stdout = old_stdout
