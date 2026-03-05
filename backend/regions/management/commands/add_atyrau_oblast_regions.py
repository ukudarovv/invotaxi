"""
Management command для добавления городов и регионов Атырауской области.

Создаёт населённые пункты области (кроме города Атырау, который заполняется add_atyrau_regions):
- Кульсары (Жылыойский район)
- Макат (Макатский район)
- Курмангазы (Курмангазинский район)
- Индербор (Индерский район)
- Махамбет (Махамбетский район)
- Доссор
- Миялы
- Есбол
- Сагиз
- Аккистау

Использование:
    python manage.py add_atyrau_oblast_regions
    python manage.py add_atyrau_oblast_regions --geocode
    python manage.py add_atyrau_oblast_regions --dry-run
"""
from django.core.management.base import BaseCommand
from regions.models import City, Region
import re
import time
import requests


def transliterate_to_english(text):
    """Транслитерация кириллицы в латиницу"""
    translit_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    }
    result = []
    for char in text:
        if char.lower() in translit_map:
            result.append(translit_map[char.lower()])
        elif char.isalnum() or char in ['-', '_']:
            result.append(char.lower())
        else:
            result.append('_')
    return ''.join(result)


def generate_id(name):
    """Генерация ID из названия"""
    t = transliterate_to_english(name)
    t = re.sub(r'[^a-zA-Z0-9_-]', '_', t)
    t = re.sub(r'_+', '_', t).strip('_')
    return t.lower()


def geocode_place(name, region_hint="Атырауская область"):
    """Геокодирование через Nominatim"""
    try:
        query = f"{name}, {region_hint}, Казахстан"
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "kz"}
        headers = {"User-Agent": "InvoTaxi-RegionGeoCoder/1.0"}
        r = requests.get(url, params=params, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data:
            return float(data[0]['lat']), float(data[0]['lon'])
    except Exception:
        pass
    return None, None


# Населённые пункты Атырауской области: (название, city_id, lat, lon)
# + дополнительные регионы для крупных населённых пунктов
OBLAST_SETTLEMENTS = [
    ("Кульсары", "kulsary", 46.969, 54.007),      # Жылыойский район
    ("Макат", "makat", 47.65, 53.317),            # Макатский район
    ("Курмангазы", "kurmangazy", 46.6, 49.267),   # Курмангазинский район (село)
    ("Индербор", "inderbor", 48.0, 51.5),         # Индерский район
    ("Махамбет", "makhambet", 47.67, 51.58),      # Махамбетский район
    ("Доссор", "dossor", 47.52, 52.98),           # Макатский район
    ("Миялы", "miyaly", 47.45, 51.75),            # Махамбетский район
    ("Есбол", "esbol", 47.38, 52.85),             # Макатский район
    ("Сагиз", "sagiz", 47.55, 53.15),             # Макатский район
    ("Аккистау", "akkistau", 47.42, 52.92),       # Макатский район
]

# Дополнительные регионы для крупных населённых пунктов
EXTRA_REGIONS = {
    "kulsary": ["Центр", "Север", "Юг", "Железнодорожный"],
    "makat": ["Центр", "Северная часть", "Южная часть"],
    "kurmangazy": ["Центр", "Западная часть"],
}


class Command(BaseCommand):
    help = 'Добавляет города и регионы Атырауской области (населённые пункты)'

    def add_arguments(self, parser):
        parser.add_argument('--geocode', action='store_true', help='Геокодировать координаты')
        parser.add_argument('--dry-run', action='store_true', help='Только проверка, без создания')

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        use_geocode = options.get('geocode', False)

        self.stdout.write('=' * 60)
        self.stdout.write('Наполнение регионов Атырауской области')
        self.stdout.write('=' * 60)

        created_cities = 0
        created_regions = 0

        for title, city_id, default_lat, default_lon in OBLAST_SETTLEMENTS:
            lat, lon = default_lat, default_lon

            if use_geocode and not dry_run:
                self.stdout.write(f'Геокодирование: {title}...', ending=' ')
                glat, glon = geocode_place(title)
                if glat and glon:
                    lat, lon = glat, glon
                    self.stdout.write(self.style.SUCCESS(f'OK ({lat:.4f}, {lon:.4f})'))
                else:
                    self.stdout.write(self.style.WARNING('не найдено, используются дефолтные'))
                time.sleep(1.0)

            if dry_run:
                self.stdout.write(f'[DRY] Город: {title} ({city_id}), регион: {title} (центр)')
                created_cities += 1
                created_regions += 1
                continue

            # Получаем район для города (если add_districts уже выполнен)
            district = None
            district_map = {
                "kulsary": "zhyloyskiy",
                "makat": "makatskiy",
                "kurmangazy": "kurmangazinskiy",
                "inderbor": "inderskiy",
                "makhambet": "makhambetskiy",
                "dossor": "makatskiy",
                "miyaly": "makhambetskiy",
                "esbol": "makatskiy",
                "sagiz": "makatskiy",
                "akkistau": "isatayskiy",
            }
            try:
                from regions.models import District
                dist_id = district_map.get(city_id)
                if dist_id:
                    district = District.objects.get(id=dist_id)
            except Exception:
                pass

            defaults = {
                'title': title,
                'center_lat': lat,
                'center_lon': lon,
            }
            if district:
                defaults['district'] = district

            city, city_created = City.objects.update_or_create(
                id=city_id,
                defaults=defaults
            )
            if city_created:
                created_cities += 1
                self.stdout.write(self.style.SUCCESS(f'Создан город: {title} ({city_id})'))

            # Основной регион (центр)
            region_id = f"{city_id}_center"
            region, region_created = Region.objects.update_or_create(
                id=region_id,
                defaults={
                    'title': f'{title} (центр)',
                    'city': city,
                    'center_lat': lat,
                    'center_lon': lon,
                }
            )
            if region_created:
                created_regions += 1
                self.stdout.write(f'  + регион: {region.title}')

            # Дополнительные регионы для крупных населённых пунктов
            extra_regions = EXTRA_REGIONS.get(city_id, [])
            for i, reg_name in enumerate(extra_regions[1:], 1):  # пропускаем "Центр" (уже есть)
                offset = 0.005 * i
                reg_id = f"{city_id}_{generate_id(reg_name)}"
                reg_lat = lat + (offset if i % 2 else -offset)
                reg_lon = lon + (offset if i % 2 else -offset)
                r, r_created = Region.objects.update_or_create(
                    id=reg_id,
                    defaults={
                        'title': f'{title}, {reg_name}',
                        'city': city,
                        'center_lat': reg_lat,
                        'center_lon': reg_lon,
                    }
                )
                if r_created:
                    created_regions += 1
                    self.stdout.write(f'  + регион: {r.title}')

        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS(
            f'Готово. Городов: {created_cities}, регионов: {created_regions}'
        ))
