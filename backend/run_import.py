"""Запуск импорта водителей"""
import subprocess
import sys
from pathlib import Path

backend_dir = Path(__file__).parent
file_path = backend_dir / 'data' / 'drivers_for_import.xlsx'

print(f'Запуск импорта водителей из: {file_path}')
print('=' * 60)

# Запускаем команду
result = subprocess.run(
    [sys.executable, 'manage.py', 'import_drivers_from_excel', str(file_path), '--skip-errors'],
    cwd=str(backend_dir),
    capture_output=True,
    text=True,
    encoding='utf-8',
    errors='replace'
)

# Выводим результат
if result.stdout:
    print(result.stdout)
if result.stderr:
    print('STDERR:', result.stderr)

print('=' * 60)
print(f'Exit code: {result.returncode}')

# Проверяем результат
try:
    import django
    import os
    sys.path.insert(0, str(backend_dir))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invo_backend.settings')
    django.setup()
    
    from accounts.models import Driver
    count = Driver.objects.count()
    print(f'\nВсего водителей в системе: {count}')
    
    if count > 0:
        print('\nПоследние 5 водителей:')
        drivers = Driver.objects.select_related('region', 'user').all().order_by('-id')[:5]
        for i, d in enumerate(drivers, 1):
            phone = d.user.phone if d.user else 'N/A'
            region = d.region.title if d.region else 'N/A'
            print(f'  {i}. {d.name} | {phone} | {region} | {d.car_model} {d.plate_number}')
except Exception as e:
    print(f'Ошибка при проверке: {e}')
