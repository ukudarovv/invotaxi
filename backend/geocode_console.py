"""
Интерактивный скрипт для геокодирования адресов через OpenStreetMap Nominatim.

Просто запустите скрипт и вводите адреса - получите координаты.

Использование:
    python geocode_console.py
"""
import json
import time
import sys
from pathlib import Path
from typing import Dict, Optional, Any

try:
    import requests
except ImportError:
    print("ERROR: requests library not found. Install it with: pip install requests")
    sys.exit(1)

BASE_URL = "https://nominatim.openstreetmap.org/search"
CACHE_FILE = "cache_nominatim.json"


def add_city_prefix(address: str, city: str = "Атырау", country: str = "Казахстан") -> str:
    """
    Автоматически добавляет префикс города и страны к адресу, если он отсутствует.
    """
    if not address:
        return ""
    
    address_lower = address.lower().strip()
    
    # Проверяем, есть ли уже в адресе название города или страны
    has_country = any(word in address_lower for word in ["казахстан", "kz", "казахстан,"])
    has_city = any(word in address_lower for word in ["атырау", "atyrau", "атырау,", "atyrau,"])
    
    # Если уже есть город и страна, возвращаем как есть
    if has_country or has_city:
        return address.strip()
    
    # Если адрес не содержит город/страну, добавляем префикс
    return f"{country}, {city}, {address}".strip()


def normalize_address(address: str) -> str:
    """
    Нормализация адреса для лучшей точности геокодирования.
    Заменяет сокращения на полные формы.
    """
    if not address:
        return ""
    
    address = address.strip()
    # Замены для улучшения качества поиска
    replacements = {
        "ул.": "улица",
        "пр.": "проспект",
        "пр-т": "проспект",
        "пр-кт": "проспект",
        "бул.": "бульвар",
        "б-р": "бульвар",
        "пер.": "переулок",
        "пл.": "площадь",
        "ш.": "шоссе",
        "мкр.": "микрорайон",
        "мкрн": "микрорайон",
    }
    
    for abbrev, full in replacements.items():
        # Заменяем только целые слова
        import re
        pattern = r'\b' + re.escape(abbrev) + r'\b'
        address = re.sub(pattern, full, address, flags=re.IGNORECASE)
    
    # Убираем лишние пробелы и запятые
    address = " ".join(address.split())
    address = address.replace(" ,", ",").replace(", ,", ",").strip()
    
    return address


def geocode_nominatim(
    address: str,
    session: requests.Session,
    countrycodes: str = "kz",
    retry_count: int = 3,
    auto_add_city: bool = True
) -> Dict[str, Any]:
    """
    Геокодирование одного адреса через Nominatim API.
    
    Args:
        address: Адрес для геокодирования
        session: requests.Session объект
        countrycodes: Коды стран (по умолчанию "kz" - Казахстан)
        retry_count: Количество попыток при ошибках
        auto_add_city: Автоматически добавлять "Казахстан, Атырау" к адресу
    
    Returns:
        Словарь с результатами: status, lat, lon, display_name
    """
    # Автоматически добавляем префикс города и страны
    if auto_add_city:
        address = add_city_prefix(address)
    
    normalized_address = normalize_address(address)
    
    params = {
        "q": normalized_address,
        "format": "jsonv2",
        "limit": 1,
        "addressdetails": 1,
        "countrycodes": countrycodes,
    }
    
    for attempt in range(1, retry_count + 1):
        try:
            r = session.get(BASE_URL, params=params, timeout=20)
            
            # Nominatim может отвечать 429 (слишком много запросов)
            if r.status_code == 429:
                wait_time = 2 * attempt
                print(f"  ⏳ Rate limit (429). Ждем {wait_time}s перед повтором {attempt}/{retry_count}...")
                time.sleep(wait_time)
                continue
            
            r.raise_for_status()
            data = r.json()
            
            if not data or len(data) == 0:
                return {
                    "status": "not_found",
                    "lat": None,
                    "lon": None,
                    "display_name": None,
                    "original_address": address,
                    "normalized_address": normalized_address
                }
            
            return {
                "status": "ok",
                "lat": data[0].get("lat"),
                "lon": data[0].get("lon"),
                "display_name": data[0].get("display_name"),
                "original_address": address,
                "normalized_address": normalized_address
            }
            
        except requests.RequestException as e:
            if attempt < retry_count:
                wait_time = 2 * attempt
                print(f"  ⚠️  Ошибка запроса: {e}. Ждем {wait_time}s перед повтором {attempt}/{retry_count}...")
                time.sleep(wait_time)
            else:
                return {
                    "status": "error",
                    "lat": None,
                    "lon": None,
                    "display_name": None,
                    "error": str(e),
                    "original_address": address,
                    "normalized_address": normalized_address
                }
    
    return {
        "status": "error",
        "lat": None,
        "lon": None,
        "display_name": None,
        "original_address": address,
        "normalized_address": normalized_address
    }


def load_cache(cache_path: Path) -> Dict[str, Dict[str, Any]]:
    """Загрузка кэша из JSON файла."""
    if cache_path.exists():
        try:
            return json.loads(cache_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, IOError) as e:
            print(f"⚠️  Не удалось загрузить кэш: {e}")
            return {}
    return {}


def save_cache(cache_path: Path, cache: Dict[str, Dict[str, Any]]):
    """Сохранение кэша в JSON файл."""
    try:
        cache_path.write_text(
            json.dumps(cache, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
    except IOError as e:
        print(f"⚠️  Не удалось сохранить кэш: {e}")


def format_result(result: Dict[str, Any]) -> str:
    """Форматирование результата для вывода."""
    if result["status"] == "ok":
        return f"""
✅ Найдено:
   Адрес: {result['display_name']}
   Широта (lat): {result['lat']}
   Долгота (lon): {result['lon']}
   Координаты: {result['lat']}, {result['lon']}
"""
    elif result["status"] == "not_found":
        return f"""
❌ Адрес не найден: {result['original_address']}
   Попробуйте указать более полный адрес.
"""
    else:
        error_msg = result.get("error", "Неизвестная ошибка")
        return f"""
❌ Ошибка: {error_msg}
   Адрес: {result.get('original_address', 'N/A')}
"""


def main():
    """Главная функция - интерактивный режим."""
    cache_path = Path(CACHE_FILE)
    cache = load_cache(cache_path)
    
    # Настройка requests session с User-Agent
    session = requests.Session()
    session.headers.update({
        "User-Agent": "InvoTaxi-GeoCoder-Console/1.0 (contact: admin@invotaxi.kz)"
    })
    
    print("=" * 60)
    print("🗺️  Геокодер адресов Атырау (OpenStreetMap Nominatim)")
    print("=" * 60)
    print("📍 Все адреса автоматически относятся к Атырау, Казахстан")
    print()
    print("Введите адрес для получения координат (можно без города):")
    print("Примеры:")
    print("  - ул. Сатпаева 10")
    print("  - проспект Азаттык 45")
    print("  - улица Бокенбай батыра 23")
    print("  - Казахстан, Атырау, ул. Сатпаева 10 (тоже работает)")
    print()
    print("Команды:")
    print("  - 'q' или 'quit' - выход")
    print("  - 'clear' - очистить экран")
    print("  - 'cache' - показать статистику кэша")
    print("=" * 60)
    print()
    
    try:
        while True:
            try:
                address = input("📍 Введите адрес: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n\n👋 До свидания!")
                break
            
            if not address:
                continue
            
            # Команды
            if address.lower() in ['q', 'quit', 'exit', 'выход']:
                print("\n👋 До свидания!")
                break
            
            if address.lower() == 'clear':
                import os
                os.system('cls' if os.name == 'nt' else 'clear')
                continue
            
            if address.lower() == 'cache':
                print(f"\n📊 Кэш: {len(cache)} записей сохранено в {CACHE_FILE}\n")
                continue
            
            # Добавляем префикс города (для отображения)
            full_address = add_city_prefix(address)
            
            # Геокодирование
            print(f"\n🔍 Ищу: {address}")
            if full_address != address:
                print(f"   → {full_address}")
            
            # Проверяем кэш (используем оригинальный адрес как ключ)
            cache_key = address.lower().strip()
            if cache_key in cache:
                result = cache[cache_key]
                print("   (из кэша)")
            else:
                result = geocode_nominatim(address, session=session, countrycodes="kz", auto_add_city=True)
                
                # Сохраняем в кэш
                cache[cache_key] = result
                save_cache(cache_path, cache)
                
                # Соблюдаем rate limit: 1 запрос/сек
                time.sleep(1.0)
            
            # Выводим результат
            print(format_result(result))
            
    except KeyboardInterrupt:
        print("\n\n👋 До свидания!")
    except Exception as e:
        print(f"\n❌ Неожиданная ошибка: {e}")
    finally:
        # Сохраняем финальный кэш
        save_cache(cache_path, cache)
        print("\n💾 Кэш сохранен.")


if __name__ == "__main__":
    main()
