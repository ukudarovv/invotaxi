"""
Management command для добавления регионов города Атырау
"""
from django.core.management.base import BaseCommand
from regions.models import City, Region
import re
import unicodedata
import time
import requests


def transliterate_to_english(text):
    """Транслитерация кириллицы в латиницу для создания ID"""
    translit_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
        'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
        'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
        'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
        'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
    }
    result = []
    for char in text:
        if char in translit_map:
            result.append(translit_map[char])
        elif char.isalnum() or char in ['-', '_']:
            result.append(char)
        else:
            result.append('_')
    return ''.join(result)


def normalize_region_name(name):
    """Нормализация названия региона"""
    # Убираем лишние пробелы
    name = ' '.join(name.split())
    # Убираем скобки и их содержимое
    name = re.sub(r'\([^)]*\)', '', name).strip()
    # Приводим к стандартному виду: первая буква заглавная, остальные строчные
    # Но сохраняем специальные случаи
    if name.isupper():
        # Если все заглавные, делаем Title Case
        words = name.split()
        name = ' '.join([w.capitalize() if w.isupper() else w for w in words])
    elif name.islower():
        # Если все строчные, делаем Title Case
        words = name.split()
        name = ' '.join([w.capitalize() for w in words])
    
    # Специальные исправления
    corrections = {
        'ЖУМЫСКЕР': 'Жумыскер',
        'ЖУЛДЫЗ': 'Жулдыз',
        'СТАРЫЙ Аэропорт': 'Старый Аэропорт',
        'строй контора': 'Строй Контора',
        'авангард': 'Авангард',
        'Алмагул': 'Алмагуль',  # Нормализация вариантов
        'Алмалы': 'Алмалы',
        'Таскала Курилкино': 'Таскала Курилкино',
        'Таскала Водник': 'Таскала Водник',
        'Балыкшы-Еркинкала': 'Балыкшы-Еркинкала',
        'Балыкши': 'Балыкши',
        'Дамбы': 'Дамба',
    }
    
    if name in corrections:
        name = corrections[name]
    
    return name


def generate_region_id(name, city_id='atyrau'):
    """Генерация ID региона"""
    # Нормализуем название
    normalized = normalize_region_name(name)
    # Транслитерируем
    transliterated = transliterate_to_english(normalized)
    # Убираем лишние символы, оставляем только буквы, цифры, дефисы и подчеркивания
    transliterated = re.sub(r'[^a-zA-Z0-9_-]', '_', transliterated)
    # Заменяем множественные подчеркивания на одно
    transliterated = re.sub(r'_+', '_', transliterated)
    # Убираем подчеркивания в начале и конце
    transliterated = transliterated.strip('_')
    # Делаем нижний регистр
    transliterated = transliterated.lower()
    # Объединяем с ID города
    return f"{city_id}_{transliterated}"


def geocode_region(region_name, city_name="Атырау"):
    """Геокодирование региона через Nominatim API"""
    try:
        query = f"{region_name}, {city_name}, Казахстан"
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": query,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "kz",
        }
        headers = {
            "User-Agent": "InvoTaxi-RegionGeoCoder/1.0 (contact: admin@invotaxi.kz)"
        }
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data and len(data) > 0:
            return float(data[0]['lat']), float(data[0]['lon'])
        
        # Если не найдено, возвращаем координаты города Атырау
        return None, None
    except Exception as e:
        # В случае ошибки возвращаем None
        return None, None


class Command(BaseCommand):
    help = '''
    Добавляет регионы в город Атырау.
    
    Использование:
    python manage.py add_atyrau_regions
    python manage.py add_atyrau_regions --geocode  # С геокодированием координат
    python manage.py add_atyrau_regions --dry-run  # Только проверка, без создания
    '''

    def add_arguments(self, parser):
        parser.add_argument(
            '--geocode',
            action='store_true',
            help='Геокодировать координаты регионов через Nominatim API',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только проверка, регионы не будут созданы',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        use_geocode = options.get('geocode', False)
        
        # Координаты города Атырау (по умолчанию)
        DEFAULT_LAT = 47.1067
        DEFAULT_LON = 51.9167
        
        # Список всех регионов из изображения (уникальные, нормализованные)
        region_names = [
            'Память Ильича',
            'Алмалы',
            'Еркинкала',
            'Балыкшы-Еркинкала',
            'Жумыскер',
            'Мкр Атырау',
            'Черная речка',
            'Нурсая',
            'Первый Участок',
            'Химпоселок',
            'Сатпаева',
            'Алмагуль',
            'Чехов',
            'Авангард',
            'Привокзальный',
            'Светлана',
            'Самал',
            'Старый Аэропорт',
            'Абай',
            'Киткрай',
            'Строй Контора',
            'Таскала Курилкино',
            'Балыкши',
            'Дамба',
            'Мкр Бирлик',
            'Талгайран-2',
            'Жулдыз',
            'Аксай (минивен)',
            'Таскала Водник',
        ]
        
        # Получаем или создаем город Атырау
        try:
            city = City.objects.get(id='atyrau')
            self.stdout.write(self.style.SUCCESS(f'Найден город: {city.title}'))
        except City.DoesNotExist:
            if dry_run:
                self.stdout.write(self.style.WARNING('Город Атырау будет создан'))
                city = None
            else:
                city = City.objects.create(
                    id='atyrau',
                    title='Атырау',
                    center_lat=DEFAULT_LAT,
                    center_lon=DEFAULT_LON
                )
                self.stdout.write(self.style.SUCCESS(f'Создан город: {city.title}'))
        
        if dry_run:
            self.stdout.write(self.style.WARNING('Режим проверки (dry-run): регионы не будут созданы'))
        
        self.stdout.write('=' * 60)
        self.stdout.write(f'Обработка {len(region_names)} регионов...\n')
        
        created_count = 0
        updated_count = 0
        skipped_count = 0
        
        for i, region_name in enumerate(region_names, 1):
            normalized_name = normalize_region_name(region_name)
            region_id = generate_region_id(normalized_name, 'atyrau')
            
            # Убираем "(минивен)" из названия для ID, но оставляем в title
            if '(минивен)' in normalized_name.lower():
                region_id = generate_region_id(normalized_name.replace('(минивен)', '').strip(), 'atyrau')
            
            try:
                existing_region = Region.objects.get(id=region_id) if not dry_run else None
                
                if existing_region:
                    self.stdout.write(f'[{i}/{len(region_names)}] ! Пропущен (существует): {normalized_name} ({region_id})')
                    skipped_count += 1
                    continue
                    
            except Region.DoesNotExist:
                pass
            
            # Определяем координаты
            lat = DEFAULT_LAT
            lon = DEFAULT_LON
            
            if use_geocode and not dry_run:
                self.stdout.write(f'[{i}/{len(region_names)}] -> Геокодирование: {normalized_name}...', ending=' ')
                geocode_lat, geocode_lon = geocode_region(normalized_name)
                if geocode_lat and geocode_lon:
                    lat = geocode_lat
                    lon = geocode_lon
                    self.stdout.write(self.style.SUCCESS(f'[OK] Найдено: {lat:.6f}, {lon:.6f}'))
                else:
                    self.stdout.write(self.style.WARNING('[WARN] Не найдено, используются координаты города'))
                # Rate limiting для Nominatim API (1 запрос в секунду)
                time.sleep(1.0)
            
            if not dry_run:
                region, created = Region.objects.update_or_create(
                    id=region_id,
                    defaults={
                        'title': normalized_name,
                        'city': city,
                        'center_lat': lat,
                        'center_lon': lon,
                    }
                )
                
                if created:
                    self.stdout.write(f'[{i}/{len(region_names)}] [OK] Создан: {normalized_name} ({region_id})')
                    created_count += 1
                else:
                    self.stdout.write(f'[{i}/{len(region_names)}] [UPD] Обновлен: {normalized_name} ({region_id})')
                    updated_count += 1
            else:
                self.stdout.write(f'[{i}/{len(region_names)}] -> Будет создан: {normalized_name} ({region_id})')
                created_count += 1
        
        self.stdout.write('=' * 60)
        if not dry_run:
            self.stdout.write(self.style.SUCCESS(
                f'\nГотово! Создано: {created_count}, Обновлено: {updated_count}, Пропущено: {skipped_count}'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'\nПроверка завершена. Будет создано: {created_count}, Пропущено: {skipped_count}'
            ))
