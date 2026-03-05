"""
Management command для добавления административных районов Атырауской области.

7 районов:
- Курмангазинский (центр: Курмангазы)
- Макатский (центр: Макат)
- Индерский (центр: Индербор)
- Махамбетский (центр: Махамбет)
- Жылыойский (центр: Кульсары)
- Исатайский (центр: Аккистау)
- Город Атырау (областной центр)

Использование:
    python manage.py add_districts
"""
from django.core.management.base import BaseCommand
from regions.models import District, City


# Районы: (id, title, lat, lon)
DISTRICTS = [
    ("kurmangazinskiy", "Курмангазинский район", 46.6, 49.267),
    ("makatskiy", "Макатский район", 47.65, 53.317),
    ("inderskiy", "Индерский район", 48.0, 51.5),
    ("makhambetskiy", "Махамбетский район", 47.67, 51.58),
    ("zhyloyskiy", "Жылыойский район", 46.969, 54.007),
    ("isatayskiy", "Исатайский район", 47.42, 52.92),
    ("atyrau_city", "Город Атырау", 47.1067, 51.9167),
]

# Связь город -> район
CITY_TO_DISTRICT = {
    "kurmangazy": "kurmangazinskiy",
    "makat": "makatskiy",
    "inderbor": "inderskiy",
    "makhambet": "makhambetskiy",
    "kulsary": "zhyloyskiy",
    "akkistau": "isatayskiy",
    "dossor": "makatskiy",
    "miyaly": "makhambetskiy",
    "esbol": "makatskiy",
    "sagiz": "makatskiy",
    "atyrau": "atyrau_city",
}


class Command(BaseCommand):
    help = 'Добавляет административные районы Атырауской области'

    def handle(self, *args, **options):
        self.stdout.write('=' * 60)
        self.stdout.write('Наполнение районов Атырауской области')
        self.stdout.write('=' * 60)

        created = 0
        for district_id, title, lat, lon in DISTRICTS:
            _, created_flag = District.objects.update_or_create(
                id=district_id,
                defaults={
                    'title': title,
                    'center_lat': lat,
                    'center_lon': lon,
                }
            )
            if created_flag:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'Создан район: {title}'))

        # Привязка городов к районам
        for city_id, district_id in CITY_TO_DISTRICT.items():
            try:
                city = City.objects.get(id=city_id)
                district = District.objects.get(id=district_id)
                if city.district_id != district_id:
                    city.district = district
                    city.save()
                    self.stdout.write(f'  {city.title} -> {district.title}')
            except (City.DoesNotExist, District.DoesNotExist):
                pass

        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS(f'Готово. Районов: {District.objects.count()}'))
