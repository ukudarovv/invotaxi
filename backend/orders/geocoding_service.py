"""
Сервис геокодирования адресов через Nominatim API.
Используется для автоматического определения координат при создании заказов.
"""
import re
import time
import requests
from typing import Dict, Optional, Any
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

BASE_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_COUNTRY_CODES = "kz"  # Казахстан

# Границы Атырауской области для приоритизации поиска (не строгое ограничение)
# Расширенные границы для учета всех возможных адресов в области
ATYRAU_REGION_BOUNDS = {
    "min_lat": 45.5,  # Южная граница (расширено для учета граничных районов)
    "max_lat": 49.5,  # Северная граница
    "min_lon": 48.5,  # Западная граница (расширено для учета граничных районов)
    "max_lon": 55.0,  # Восточная граница
}

# Viewbox для Nominatim (формат: min_lon,min_lat,max_lon,max_lat)
ATYRAU_VIEWBOX = f"{ATYRAU_REGION_BOUNDS['min_lon']},{ATYRAU_REGION_BOUNDS['min_lat']},{ATYRAU_REGION_BOUNDS['max_lon']},{ATYRAU_REGION_BOUNDS['max_lat']}"


def normalize_address_for_city(address: str, city_only: bool = True, default_city: Optional[str] = None) -> str:
    """
    Нормализация адреса для поиска в городе Атырау или области.
    
    Args:
        address: Адрес для нормализации
        city_only: Если True - добавляет только город Атырау, если False - добавляет область
        default_city: Город по умолчанию (если не указан, берется из настроек или "Атырау")
    
    Returns:
        Нормализованный адрес
    """
    if not address:
        return ""
    
    address = address.strip()
    
    # Получаем город по умолчанию
    if default_city is None:
        default_city = getattr(settings, 'GEOCODING_DEFAULT_CITY', 'Атырау')
    
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
        pattern = r'\b' + re.escape(abbrev) + r'\b'
        address = re.sub(pattern, full, address, flags=re.IGNORECASE)
    
    # Убираем лишние пробелы и запятые
    address = " ".join(address.split())
    address = address.replace(" ,", ",").replace(", ,", ",").strip()
    
    address_lower = address.lower()
    has_city = default_city.lower() in address_lower if default_city else False
    has_region = (
        "атырау" in address_lower or
        "атырауская" in address_lower or
        "atyrau" in address_lower
    )
    has_country = (
        "казахстан" in address_lower or 
        "kz" in address_lower or
        "kazakhstan" in address_lower
    )
    
    if city_only:
        # Для поиска в городе: добавляем только "Атырау, Казахстан"
        if not has_city and default_city:
            address = f"{default_city}, {address}"
        if not has_country:
            address = f"Казахстан, {address}"
    else:
        # Для поиска в области: добавляем "Атырауская область, Казахстан" или просто "Атырау, Казахстан"
        if not has_region and not has_city:
            if default_city:
                address = f"{default_city}, {address}"
        if not has_country:
            address = f"Казахстан, {address}"
    
    return address


def normalize_address(address: str, default_city: Optional[str] = None) -> str:
    """
    Нормализация адреса для лучшей точности геокодирования.
    Заменяет сокращения на полные формы и автоматически добавляет город/страну если их нет.
    
    Args:
        address: Адрес для нормализации
        default_city: Город по умолчанию (если не указан, берется из настроек или "Атырау")
    
    Returns:
        Нормализованный адрес с городом и страной
    """
    if not address:
        return ""
    
    address = address.strip()
    
    # Получаем город по умолчанию
    if default_city is None:
        default_city = getattr(settings, 'GEOCODING_DEFAULT_CITY', 'Атырау')
    
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
        pattern = r'\b' + re.escape(abbrev) + r'\b'
        address = re.sub(pattern, full, address, flags=re.IGNORECASE)
    
    # Убираем лишние пробелы и запятые
    address = " ".join(address.split())
    address = address.replace(" ,", ",").replace(", ,", ",").strip()
    
    # Проверяем наличие страны в адресе
    address_lower = address.lower()
    has_country = (
        "казахстан" in address_lower or 
        "kz" in address_lower or
        "kazakhstan" in address_lower
    )
    
    # Проверяем наличие города/области в адресе
    has_city = default_city.lower() in address_lower if default_city else False
    has_region = (
        "атырау" in address_lower or
        "атырауская" in address_lower or
        "atyrau" in address_lower
    )
    
    # Автоматически добавляем город/область и страну если их нет
    if not has_country:
        if not has_city and not has_region and default_city:
            # Добавляем город перед адресом
            address = f"{default_city}, {address}"
        # Всегда добавляем страну для ограничения поиска
        address = f"Казахстан, {address}"
    elif not has_region and default_city:
        # Если есть страна, но нет города/области, добавляем для точности
        if default_city.lower() not in address_lower:
            address = f"{default_city}, {address}"
    
    return address


def geocode_address(
    address: str,
    countrycodes: str = DEFAULT_COUNTRY_CODES,
    retry_count: int = 3,
    city_only: bool = False
) -> Dict[str, Any]:
    """
    Геокодирование одного адреса через Nominatim API.
    
    Args:
        address: Адрес для геокодирования
        countrycodes: Коды стран (по умолчанию "kz" - Казахстан)
        retry_count: Количество попыток при ошибках
    
    Returns:
        Словарь с результатами: {
            'status': 'ok' | 'not_found' | 'error',
            'lat': float | None,
            'lon': float | None,
            'display_name': str | None,
            'original_address': str,
            'normalized_address': str,
            'error': str | None
        }
    """
    # Нормализуем адрес в зависимости от режима поиска
    if city_only:
        normalized_address = normalize_address_for_city(address, city_only=True)
    else:
        normalized_address = normalize_address_for_city(address, city_only=False)
    
    if not normalized_address:
        return {
            "status": "error",
            "lat": None,
            "lon": None,
            "display_name": None,
            "original_address": address,
            "normalized_address": normalized_address,
            "error": "Пустой адрес"
        }
    
    params = {
        "q": normalized_address,
        "format": "jsonv2",
        "limit": 1,
        "addressdetails": 1,
        "countrycodes": countrycodes,
    }
    
    # Для поиска в городе используем более узкий viewbox (центр города Атырау)
    if city_only:
        # Viewbox для города Атырау (примерно 10-15 км вокруг центра: 47.1167° N, 51.8833° E)
        # Границы города: примерно от 51.7 до 52.1 по долготе, от 47.0 до 47.3 по широте
        city_viewbox = "51.7,47.0,52.1,47.3"  # Границы города Атырау
        params["viewbox"] = city_viewbox
        params["bounded"] = 1  # Строгое ограничение - ищем только в пределах города
    else:
        # Для области используем более широкий viewbox без строгого ограничения
        params["viewbox"] = ATYRAU_VIEWBOX
        # Не используем bounded=1 для области, чтобы не отфильтровать валидные результаты
    
    # Настройка session с User-Agent (обязательно для Nominatim)
    session = requests.Session()
    session.headers.update({
        "User-Agent": getattr(
            settings,
            'NOMINATIM_USER_AGENT',
            'InvoTaxi-GeoCoder/1.0 (contact: admin@invotaxi.kz)'
        ),
        "Accept-Language": "ru"  # Приоритет на русском языке для Казахстана
    })
    
    for attempt in range(1, retry_count + 1):
        try:
            response = session.get(BASE_URL, params=params, timeout=10)
            
            # Nominatim может отвечать 429 (слишком много запросов)
            if response.status_code == 429:
                wait_time = 2 * attempt
                logger.warning(f"Rate limit (429) при геокодировании адреса '{address}'. "
                             f"Ожидание {wait_time}s перед повторной попыткой {attempt}/{retry_count}...")
                time.sleep(wait_time)
                continue
            
            response.raise_for_status()
            data = response.json()
            
            if not data or len(data) == 0:
                logger.warning(f"Адрес не найден: '{address}' (нормализован: '{normalized_address}')")
                return {
                    "status": "not_found",
                    "lat": None,
                    "lon": None,
                    "display_name": None,
                    "original_address": address,
                    "normalized_address": normalized_address
                }
            
            result = data[0]
            lat = float(result.get("lat")) if result.get("lat") else None
            lon = float(result.get("lon")) if result.get("lon") else None
            
            if lat is None or lon is None:
                logger.warning(f"Не удалось получить координаты для адреса: '{address}'")
                return {
                    "status": "not_found",
                    "lat": None,
                    "lon": None,
                    "display_name": result.get("display_name"),
                    "original_address": address,
                    "normalized_address": normalized_address
                }
            
            # Мягкая проверка координат - только логируем, но не отклоняем результаты
            # так как точные границы области могут варьироваться, и адреса могут быть на границе
            if not (ATYRAU_REGION_BOUNDS['min_lat'] <= lat <= ATYRAU_REGION_BOUNDS['max_lat'] and
                    ATYRAU_REGION_BOUNDS['min_lon'] <= lon <= ATYRAU_REGION_BOUNDS['max_lon']):
                logger.info(f"Координаты ({lat}, {lon}) находятся вне типичных границ Атырауской области для адреса: '{address}', но принимаем результат (страна ограничена Казахстаном)")
            
            logger.info(f"Адрес успешно геокодирован: '{address}' -> ({lat}, {lon})")
            return {
                "status": "ok",
                "lat": lat,
                "lon": lon,
                "display_name": result.get("display_name"),
                "original_address": address,
                "normalized_address": normalized_address
            }
            
        except requests.RequestException as e:
            if attempt < retry_count:
                wait_time = 1 * attempt
                logger.warning(f"Ошибка запроса при геокодировании адреса '{address}': {e}. "
                             f"Ожидание {wait_time}s перед повторной попыткой {attempt}/{retry_count}...")
                time.sleep(wait_time)
            else:
                logger.error(f"Ошибка геокодирования адреса '{address}' после {retry_count} попыток: {e}")
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
        "normalized_address": normalized_address,
        "error": "Превышено количество попыток"
    }


def geocode_photon(address: str, retry_count: int = 2) -> Dict[str, Any]:
    """
    Геокодирование адреса через Photon (Komoot) API.
    Используется как fallback когда Nominatim не находит адрес.
    
    Args:
        address: Адрес для геокодирования
        retry_count: Количество попыток при ошибках
    
    Returns:
        Словарь с результатами в том же формате что и geocode_address()
    """
    # Нормализуем адрес (уже содержит "Казахстан" если нужно)
    normalized_address = normalize_address(address)
    
    if not normalized_address:
        return {
            "status": "error",
            "lat": None,
            "lon": None,
            "display_name": None,
            "original_address": address,
            "normalized_address": normalized_address,
            "error": "Пустой адрес"
        }
    
    url = "https://photon.komoot.io/api/"
    # Центр Казахстана для bias
    params = {
        "q": normalized_address,
        "limit": 1,
        "lat": 48.0,  # Центр Казахстана
        "lon": 67.0
    }
    
    session = requests.Session()
    session.headers.update({
        "User-Agent": getattr(
            settings,
            'NOMINATIM_USER_AGENT',
            'InvoTaxi-GeoCoder/1.0 (contact: admin@invotaxi.kz)'
        )
    })
    
    for attempt in range(1, retry_count + 1):
        try:
            response = session.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if not data or 'features' not in data or len(data['features']) == 0:
                logger.debug(f"Photon: адрес не найден: '{address}'")
                return {
                    "status": "not_found",
                    "lat": None,
                    "lon": None,
                    "display_name": None,
                    "original_address": address,
                    "normalized_address": normalized_address
                }
            
            # Парсим GeoJSON формат: features[0].geometry.coordinates = [lon, lat]
            feature = data['features'][0]
            coordinates = feature.get('geometry', {}).get('coordinates', [])
            
            if not coordinates or len(coordinates) < 2:
                logger.warning(f"Photon: не удалось получить координаты для адреса: '{address}'")
                return {
                    "status": "not_found",
                    "lat": None,
                    "lon": None,
                    "display_name": feature.get('properties', {}).get('name'),
                    "original_address": address,
                    "normalized_address": normalized_address
                }
            
            # Photon возвращает [lon, lat], нужно поменять местами
            lon = float(coordinates[0])
            lat = float(coordinates[1])
            
            # Получаем display_name из properties
            properties = feature.get('properties', {})
            display_name_parts = []
            if properties.get('name'):
                display_name_parts.append(properties['name'])
            if properties.get('city'):
                display_name_parts.append(properties['city'])
            if properties.get('country'):
                display_name_parts.append(properties['country'])
            display_name = ", ".join(display_name_parts) if display_name_parts else None
            
            logger.info(f"Photon: адрес успешно геокодирован: '{address}' -> ({lat}, {lon})")
            return {
                "status": "ok",
                "lat": lat,
                "lon": lon,
                "display_name": display_name,
                "original_address": address,
                "normalized_address": normalized_address
            }
            
        except requests.RequestException as e:
            if attempt < retry_count:
                wait_time = 1 * attempt
                logger.warning(f"Photon: ошибка запроса при геокодировании адреса '{address}': {e}. "
                             f"Ожидание {wait_time}s перед повторной попыткой {attempt}/{retry_count}...")
                time.sleep(wait_time)
            else:
                logger.error(f"Photon: ошибка геокодирования адреса '{address}' после {retry_count} попыток: {e}")
                return {
                    "status": "error",
                    "lat": None,
                    "lon": None,
                    "display_name": None,
                    "error": str(e),
                    "original_address": address,
                    "normalized_address": normalized_address
                }
        except (KeyError, ValueError, IndexError) as e:
            logger.error(f"Photon: ошибка парсинга ответа для адреса '{address}': {e}")
            return {
                "status": "error",
                "lat": None,
                "lon": None,
                "display_name": None,
                "error": f"Ошибка парсинга ответа: {str(e)}",
                "original_address": address,
                "normalized_address": normalized_address
            }
    
    return {
        "status": "error",
        "lat": None,
        "lon": None,
        "display_name": None,
        "original_address": address,
        "normalized_address": normalized_address,
        "error": "Превышено количество попыток"
    }


def geocode_geocode_xyz(address: str, retry_count: int = 2) -> Dict[str, Any]:
    """
    Геокодирование адреса через Geocode.xyz API.
    Используется как последний fallback когда Nominatim и Photon не находят адрес.
    
    Args:
        address: Адрес для геокодирования
        retry_count: Количество попыток при ошибках
    
    Returns:
        Словарь с результатами в том же формате что и geocode_address()
    """
    import urllib.parse
    
    # Нормализуем адрес (уже содержит "Казахстан" если нужно)
    normalized_address = normalize_address(address)
    
    if not normalized_address:
        return {
            "status": "error",
            "lat": None,
            "lon": None,
            "display_name": None,
            "original_address": address,
            "normalized_address": normalized_address,
            "error": "Пустой адрес"
        }
    
    # URL-encode адрес
    encoded_address = urllib.parse.quote(normalized_address)
    # Добавляем параметры для ограничения Казахстаном и Атырауской областью
    center_lat = (ATYRAU_REGION_BOUNDS['min_lat'] + ATYRAU_REGION_BOUNDS['max_lat']) / 2
    center_lon = (ATYRAU_REGION_BOUNDS['min_lon'] + ATYRAU_REGION_BOUNDS['max_lon']) / 2
    url = f"https://geocode.xyz/{encoded_address}?json=1&region=KZ&locate={center_lat},{center_lon}"
    
    session = requests.Session()
    session.headers.update({
        "User-Agent": getattr(
            settings,
            'NOMINATIM_USER_AGENT',
            'InvoTaxi-GeoCoder/1.0 (contact: admin@invotaxi.kz)'
        )
    })
    
    for attempt in range(1, retry_count + 1):
        try:
            response = session.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Geocode.xyz может вернуть ошибку в JSON
            if data.get('error'):
                error_msg = data.get('error', {}).get('description', 'Адрес не найден')
                logger.debug(f"Geocode.xyz: адрес не найден: '{address}': {error_msg}")
                return {
                    "status": "not_found",
                    "lat": None,
                    "lon": None,
                    "display_name": None,
                    "original_address": address,
                    "normalized_address": normalized_address
                }
            
            lat_str = data.get('latt')
            lon_str = data.get('longt')
            
            if not lat_str or not lon_str or lat_str == '0.00000' or lon_str == '0.00000':
                logger.debug(f"Geocode.xyz: адрес не найден: '{address}'")
                return {
                    "status": "not_found",
                    "lat": None,
                    "lon": None,
                    "display_name": data.get('standard', {}).get('addresst', {}).get('staddress') or data.get('standard', {}).get('city'),
                    "original_address": address,
                    "normalized_address": normalized_address
                }
            
            lat = float(lat_str)
            lon = float(lon_str)
            
            # Мягкая проверка координат - только логируем, но не отклоняем результаты
            if not (ATYRAU_REGION_BOUNDS['min_lat'] <= lat <= ATYRAU_REGION_BOUNDS['max_lat'] and
                    ATYRAU_REGION_BOUNDS['min_lon'] <= lon <= ATYRAU_REGION_BOUNDS['max_lon']):
                logger.info(f"Geocode.xyz: координаты ({lat}, {lon}) находятся вне типичных границ Атырауской области для адреса: '{address}', но принимаем результат")
            
            # Получаем display_name
            standard = data.get('standard', {})
            display_name_parts = []
            if standard.get('addresst', {}).get('staddress'):
                display_name_parts.append(standard['addresst']['staddress'])
            if standard.get('city'):
                display_name_parts.append(standard['city'])
            if standard.get('prov'):
                display_name_parts.append(standard['prov'])
            if standard.get('countryname'):
                display_name_parts.append(standard['countryname'])
            display_name = ", ".join(display_name_parts) if display_name_parts else data.get('standard', {}).get('city')
            
            logger.info(f"Geocode.xyz: адрес успешно геокодирован: '{address}' -> ({lat}, {lon})")
            return {
                "status": "ok",
                "lat": lat,
                "lon": lon,
                "display_name": display_name,
                "original_address": address,
                "normalized_address": normalized_address
            }
            
        except requests.RequestException as e:
            if attempt < retry_count:
                wait_time = 1 * attempt
                logger.warning(f"Geocode.xyz: ошибка запроса при геокодировании адреса '{address}': {e}. "
                             f"Ожидание {wait_time}s перед повторной попыткой {attempt}/{retry_count}...")
                time.sleep(wait_time)
            else:
                logger.error(f"Geocode.xyz: ошибка геокодирования адреса '{address}' после {retry_count} попыток: {e}")
                return {
                    "status": "error",
                    "lat": None,
                    "lon": None,
                    "display_name": None,
                    "error": str(e),
                    "original_address": address,
                    "normalized_address": normalized_address
                }
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"Geocode.xyz: ошибка парсинга ответа для адреса '{address}': {e}")
            return {
                "status": "error",
                "lat": None,
                "lon": None,
                "display_name": None,
                "error": f"Ошибка парсинга ответа: {str(e)}",
                "original_address": address,
                "normalized_address": normalized_address
            }
    
    return {
        "status": "error",
        "lat": None,
        "lon": None,
        "display_name": None,
        "original_address": address,
        "normalized_address": normalized_address,
        "error": "Превышено количество попыток"
    }


def geocode_address_with_fallback(
    address: str,
    use_fallback: bool = False  # По умолчанию не используем fallback сервисы
) -> Dict[str, Any]:
    """
    Геокодирование адреса с приоритетом города Атырау.
    Сначала ищет строго в городе Атырау, если не найдено - расширяет поиск на область.
    
    Args:
        address: Адрес для геокодирования
        use_fallback: Использовать ли fallback сервисы (по умолчанию False - только Nominatim)
    
    Returns:
        Словарь с результатами, включая поле 'geocoder' и 'search_scope' (city/region)
    """
    # Шаг 1: Сначала ищем строго в городе Атырау
    logger.info(f"Геокодирование адреса в городе Атырау: '{address}'")
    city_address = normalize_address_for_city(address, city_only=True)
    result = geocode_address(city_address, city_only=True)
    
    if result['status'] == 'ok':
        result['geocoder'] = 'nominatim'
        result['search_scope'] = 'city'
        logger.info(f"Адрес успешно найден в городе Атырау: '{address}' -> ({result['lat']}, {result['lon']})")
        return result
    
    # Шаг 2: Если не найдено в городе, расширяем поиск на область
    logger.info(f"Адрес не найден в городе Атырау, расширяем поиск на область: '{address}'")
    time.sleep(1.0)  # Соблюдаем rate limit
    
    region_address = normalize_address_for_city(address, city_only=False)
    result = geocode_address(region_address, city_only=False)
    
    if result['status'] == 'ok':
        result['geocoder'] = 'nominatim'
        result['search_scope'] = 'region'
        logger.info(f"Адрес найден в области: '{address}' -> ({result['lat']}, {result['lon']})")
        return result
    
    # Если не найдено ни в городе, ни в области
    result['geocoder'] = 'nominatim'
    result['search_scope'] = 'none'
    logger.warning(f"Адрес не найден ни в городе Атырау, ни в области: '{address}'")
    return result


def geocode_order_addresses(
    pickup_address: Optional[str] = None,
    dropoff_address: Optional[str] = None,
    pickup_lat: Optional[float] = None,
    pickup_lon: Optional[float] = None,
    dropoff_lat: Optional[float] = None,
    dropoff_lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Геокодирование адресов для заказа.
    Если координаты уже есть, они не изменяются.
    
    Args:
        pickup_address: Адрес отправления (если координаты не указаны)
        dropoff_address: Адрес назначения (если координаты не указаны)
        pickup_lat: Широта отправления (если уже известна)
        pickup_lon: Долгота отправления (если уже известна)
        dropoff_lat: Широта назначения (если уже известна)
        dropoff_lon: Долгота назначения (если уже известна)
    
    Returns:
        Словарь с результатами: {
            'pickup_lat': float | None,
            'pickup_lon': float | None,
            'dropoff_lat': float | None,
            'dropoff_lon': float | None,
            'pickup_geocoded': bool,
            'dropoff_geocoded': bool,
            'pickup_error': str | None,
            'dropoff_error': str | None
        }
    """
    result = {
        'pickup_lat': pickup_lat,
        'pickup_lon': pickup_lon,
        'dropoff_lat': dropoff_lat,
        'dropoff_lon': dropoff_lon,
        'pickup_geocoded': False,
        'dropoff_geocoded': False,
        'pickup_error': None,
        'dropoff_error': None
    }
    
    # Геокодируем адрес отправления, если координаты не указаны
    if (pickup_lat is None or pickup_lon is None) and pickup_address:
        logger.info(f"Геокодирование адреса отправления: '{pickup_address}'")
        pickup_result = geocode_address_with_fallback(pickup_address)
        if pickup_result['status'] == 'ok':
            result['pickup_lat'] = pickup_result['lat']
            result['pickup_lon'] = pickup_result['lon']
            result['pickup_geocoded'] = True
            geocoder_used = pickup_result.get('geocoder', 'unknown')
            logger.info(f"Адрес отправления геокодирован через {geocoder_used}: '{pickup_address}'")
        else:
            result['pickup_error'] = pickup_result.get('error') or 'Адрес не найден'
            logger.error(f"Ошибка геокодирования адреса отправления: {result['pickup_error']}")
        
        # Соблюдаем rate limit: 1 запрос/сек (для Nominatim)
        # Fallback сервисы имеют свои задержки внутри функций
        time.sleep(1.0)
    
    # Геокодируем адрес назначения, если координаты не указаны
    if (dropoff_lat is None or dropoff_lon is None) and dropoff_address:
        logger.info(f"Геокодирование адреса назначения: '{dropoff_address}'")
        dropoff_result = geocode_address_with_fallback(dropoff_address)
        if dropoff_result['status'] == 'ok':
            result['dropoff_lat'] = dropoff_result['lat']
            result['dropoff_lon'] = dropoff_result['lon']
            result['dropoff_geocoded'] = True
            geocoder_used = dropoff_result.get('geocoder', 'unknown')
            logger.info(f"Адрес назначения геокодирован через {geocoder_used}: '{dropoff_address}'")
        else:
            result['dropoff_error'] = dropoff_result.get('error') or 'Адрес не найден'
            logger.error(f"Ошибка геокодирования адреса назначения: {result['dropoff_error']}")
    
    return result
