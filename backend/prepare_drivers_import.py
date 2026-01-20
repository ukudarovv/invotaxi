"""
Подготовка и импорт водителей

Этот скрипт поможет:
1. Найти файл с данными о водителях
2. Преобразовать его в нужный формат
3. Импортировать водителей в систему
"""
import os
import sys
from pathlib import Path
import django

# Настройка Django
sys.path.insert(0, str(Path(__file__).parent))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invo_backend.settings')
django.setup()

from regions.models import Region


def find_driver_files():
    """Ищет файлы с данными о водителях"""
    backend_dir = Path(__file__).parent
    project_root = backend_dir.parent
    
    possible_files = [
        backend_dir / 'data.xlsx',
        project_root / 'data' / 'водитель (1).xlsx',
        backend_dir / 'drivers.xlsx',
        backend_dir / 'водитель.xlsx',
        project_root / 'data' / 'drivers.xlsx',
    ]
    
    found_files = []
    for f in possible_files:
        if f.exists():
            found_files.append(f)
    
    return found_files


def list_regions():
    """Выводит список доступных регионов"""
    regions = Region.objects.select_related('city').all()
    print('\nДоступные регионы:')
    print('=' * 60)
    for r in regions:
        print(f'  ID: {r.id:10s} | {r.title:30s} | Город: {r.city.title}')
    print(f'\nВсего регионов: {regions.count()}\n')
    return regions


def main():
    print('=' * 60)
    print('Подготовка импорта водителей')
    print('=' * 60)
    
    # Ищем файлы
    print('\n1. Поиск файлов с данными о водителях...')
    files = find_driver_files()
    
    if files:
        print(f'\n[OK] Найдено {len(files)} файл(ов):')
        for i, f in enumerate(files, 1):
            print(f'  {i}. {f}')
        
        print('\nДля импорта используйте команду:')
        print(f'  python manage.py import_drivers_from_excel "путь_к_файлу" --skip-errors')
        print('\nПример:')
        print(f'  python manage.py import_drivers_from_excel "{files[0]}" --skip-errors')
    else:
        print('\n[!] Файлы с данными о водителях не найдены')
        print('\nДля создания шаблона используйте:')
        print('  python manage.py import_drivers_from_excel --generate-template')
        print('\nИли создайте файл Excel со следующей структурой:')
        print('  Колонки: Имя, Телефон, Пароль, Регион, Машина, Гос. номер, Вместимость')
    
    # Выводим регионы
    print('\n2. Список доступных регионов:')
    list_regions()
    
    print('\n' + '=' * 60)
    print('Инструкция по импорту:')
    print('=' * 60)
    print('''
Формат файла для импорта должен содержать следующие колонки:

ОБЯЗАТЕЛЬНЫЕ:
  - Имя (или Name, ФИО)
  - Телефон (или Phone)
  - Пароль (или Password) - минимум 8 символов
  - Регион (или Region) - название региона или ID
  - Машина (или Car Model) - модель автомобиля
  - Гос. номер (или Plate Number)
  - Вместимость (или Capacity) - количество мест (1-20)

ОПЦИОНАЛЬНЫЕ:
  - Email
  - Водитель онлайн (Да/Нет, True/False)
  - Рейтинг (0-5)

Команда для импорта:
  python manage.py import_drivers_from_excel "путь_к_файлу.xlsx" --skip-errors

Режим проверки (без создания):
  python manage.py import_drivers_from_excel "путь_к_файлу.xlsx" --dry-run

Создание шаблона:
  python manage.py import_drivers_from_excel --generate-template
    ''')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'\n[ERROR] Ошибка: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
