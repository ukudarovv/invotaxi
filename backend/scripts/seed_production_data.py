#!/usr/bin/env python3
"""
Скрипт для заполнения платформы Invotaxi тестовыми данными через API.
Создаёт: регионы города Атырау, до 60 водителей (город + районы), 500 заказов.

Использование:
    python scripts/seed_production_data.py
    ADMIN_EMAIL=... ADMIN_PASSWORD=... python scripts/seed_production_data.py
"""
import os
import sys
import time
import random
import string
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("INVOTAXI_API_URL", "http://localhost:8000")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "ukudarovv@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "root")

# Координаты Атырау
ATYRAU_CENTER = (47.1067, 51.9167)

# Все регионы города Атырау (название, id, lat, lon)
ALL_ATYRAU_REGIONS = [
    ("Память Ильича", "atyrau_pamyat_ilicha", 47.11, 51.90),
    ("Алмалы", "atyrau_almaly", 47.10, 51.91),
    ("Еркинкала", "atyrau_erkinqala", 47.10, 51.93),
    ("Балыкшы-Еркинкала", "atyrau_balykshy-erkinqala", 47.11, 51.92),
    ("Жумыскер", "atyrau_zhymysker", 47.09, 51.89),
    ("Мкр Атырау", "atyrau_mkr_atyrau", 47.1067, 51.9167),
    ("Черная речка", "atyrau_chernaya_rechka", 47.08, 51.88),
    ("Нурсая", "atyrau_nursaya", 47.12, 51.92),
    ("Первый Участок", "atyrau_pervyj_uchastok", 47.09, 51.90),
    ("Химпоселок", "atyrau_himposelok", 47.07, 51.87),
    ("Сатпаева", "atyrau_satpaeva", 47.10, 51.92),
    ("Алмагуль", "atyrau_almagul", 47.11, 51.91),
    ("Чехов", "atyrau_chehov", 47.11, 51.90),
    ("Авангард", "atyrau_avangard", 47.07, 51.87),
    ("Привокзальный", "atyrau_privokzalnyj", 47.09, 51.89),
    ("Светлана", "atyrau_svetlana", 47.13, 51.94),
    ("Самал", "atyrau_samal", 47.13, 51.94),
    ("Старый Аэропорт", "atyrau_staryj_aeroport", 47.08, 51.85),
    ("Абай", "atyrau_abaj", 47.10, 51.91),
    ("Киткрай", "atyrau_kitkraj", 47.14, 51.95),
    ("Строй Контора", "atyrau_stroj_kontora", 47.06, 51.86),
    ("Таскала Курилкино", "atyrau_taskala_kurilkino", 47.15, 51.90),
    ("Балыкши", "atyrau_balykshi", 47.15, 51.90),
    ("Дамба", "atyrau_damba", 47.08, 51.88),
    ("Ракуш", "atyrau_rakush", 47.12, 51.95),
    ("Мкр Бирлик", "atyrau_mkr_birlik", 47.12, 51.93),
    ("Талгайран-2", "atyrau_talgajran-2", 47.14, 51.92),
    ("Жулдыз", "atyrau_zhuldyz", 47.13, 51.91),
    ("Аксай", "atyrau_aksaj", 47.16, 51.88),
    ("Таскала Водник", "atyrau_taskala_vodnik", 47.14, 51.89),
]

# Города и регионы районов области (центры районов)
OBLAST_CITIES_AND_REGIONS = [
    ("Кульсары", "kulsary", "kulsary_center", 46.969, 54.007),
    ("Макат", "makat", "makat_center", 47.65, 53.317),
    ("Курмангазы", "kurmangazy", "kurmangazy_center", 46.6, 49.267),
    ("Индербор", "inderbor", "inderbor_center", 48.0, 51.5),
    ("Махамбет", "makhambet", "makhambet_center", 47.67, 51.58),
    ("Аккистау", "akkistau", "akkistau_center", 47.42, 52.92),
]

# Адреса для заказов (пригороды)
PICKUP_ADDRESSES = [
    ("Дамба, ул. Центральная 1", 47.08, 51.88),
    ("Ракуш, пр. Нефтяников 15", 47.12, 51.95),
    ("Еркинкала, ул. Бейбитшилик 23", 47.10, 51.93),
    ("Балыкши, мкр. Приморский 8", 47.15, 51.90),
    ("Алмагуль, ул. Сатпаева 45", 47.11, 51.91),
    ("Привокзальный, пр. Азаттык 12", 47.09, 51.89),
    ("Сатпаева, ул. Курмангазы 67", 47.10, 51.92),
    ("Чехов, ул. Абая 34", 47.11, 51.90),
    ("Авангард, ул. Махамбета 56", 47.07, 51.87),
    ("Самал, пр. Абулхаир Хана 78", 47.13, 51.94),
]

DROPOFF_ADDRESSES = [
    ("Еркинкала, пр. Азаттык 45", 47.10, 51.93),
    ("Дамба, ул. Центральная 1", 47.08, 51.88),
    ("Ракуш, пр. Нефтяников 15", 47.12, 51.95),
    ("Привокзальный, пр. Азаттык 12", 47.09, 51.89),
    ("Балыкши, мкр. Приморский 8", 47.15, 51.90),
    ("Алмагуль, ул. Сатпаева 45", 47.11, 51.91),
    ("Чехов, ул. Абая 34", 47.11, 51.90),
    ("Сатпаева, ул. Курмангазы 67", 47.10, 51.92),
    ("Самал, пр. Абулхаир Хана 78", 47.13, 51.94),
    ("Авангард, ул. Махамбета 56", 47.07, 51.87),
]

FIRST_NAMES = ["Иван", "Петр", "Алексей", "Дмитрий", "Сергей", "Андрей", "Михаил", "Николай", "Владимир", "Александр"]
LAST_NAMES = ["Иванов", "Петров", "Сидоров", "Кузнецов", "Смирнов", "Попов", "Соколов", "Лебедев", "Козлов", "Новиков"]
CAR_MODELS = ["Toyota Camry", "Hyundai Solaris", "Kia Rio", "Lada Granta", "Renault Logan", "Chevrolet Lacetti"]


def login(session):
    """Получить JWT токен"""
    r = session.post(f"{BASE_URL}/api/auth/email-login/", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    if r.status_code != 200:
        raise SystemExit(f"Ошибка авторизации: {r.status_code} {r.text}")
    data = r.json()
    token = data.get("access")
    if not token:
        raise SystemExit(f"Токен не получен: {data}")
    session.headers["Authorization"] = f"Bearer {token}"
    return token


def ensure_city(session, city_id="atyrau", title="Атырау", lat=None, lon=None):
    """Проверить/создать город"""
    lat = lat or ATYRAU_CENTER[0]
    lon = lon or ATYRAU_CENTER[1]
    r = session.get(f"{BASE_URL}/api/regions/cities/")
    if r.status_code != 200:
        raise SystemExit(f"Ошибка получения городов: {r.status_code}")
    cities = r.json()
    for c in cities:
        if c.get("id") == city_id:
            return city_id
    r = session.post(f"{BASE_URL}/api/regions/cities/", json={
        "id": city_id,
        "title": title,
        "center_lat": lat,
        "center_lon": lon,
    })
    if r.status_code not in (200, 201):
        raise SystemExit(f"Ошибка создания города: {r.status_code} {r.text}")
    return city_id


def ensure_regions(session):
    """Создать все регионы города Атырау и районов, если их нет"""
    r = session.get(f"{BASE_URL}/api/regions/")
    if r.status_code != 200:
        raise SystemExit(f"Ошибка получения регионов: {r.status_code}")
    regions = r.json()
    existing_ids = {rg.get("id") for rg in regions if rg.get("id")}
    
    # Город Атырау
    city_id = ensure_city(session)
    created = 0
    
    for title, region_id, lat, lon in ALL_ATYRAU_REGIONS:
        if region_id in existing_ids:
            continue
        r = session.post(f"{BASE_URL}/api/regions/", json={
            "id": region_id,
            "title": title,
            "city_id": city_id,
            "center_lat": lat,
            "center_lon": lon,
        })
        if r.status_code in (200, 201):
            created += 1
            existing_ids.add(region_id)
            print(f"  Создан регион: {title}")
        else:
            print(f"  Предупреждение {title}: {r.status_code} {r.text[:150]}")
        time.sleep(0.1)
    
    # Города и регионы районов области
    for city_title, city_id, region_id, lat, lon in OBLAST_CITIES_AND_REGIONS:
        if region_id in existing_ids:
            continue
        ensure_city(session, city_id, city_title, lat, lon)
        r = session.post(f"{BASE_URL}/api/regions/", json={
            "id": region_id,
            "title": f"{city_title} (центр)",
            "city_id": city_id,
            "center_lat": lat,
            "center_lon": lon,
        })
        if r.status_code in (200, 201):
            created += 1
            existing_ids.add(region_id)
            print(f"  Создан регион: {city_title}")
        time.sleep(0.1)
    
    r = session.get(f"{BASE_URL}/api/regions/")
    regions = r.json()
    all_region_ids = [rg["id"] for rg in regions if rg.get("id")]

    # Только город Атырау + районы (центры районов): исключаем мелкие населённые пункты
    city_and_district_prefixes = (
        "atyrau_",      # город Атырау
        "kulsary_",     # Жылыойский район
        "makat_",       # Макатский район
        "kurmangazy_",  # Курмангазинский район
        "inderbor_",    # Индерский район
        "makhambet_",   # Махамбетский район
        "akkistau_",    # Исатайский район
    )
    filtered = [rid for rid in all_region_ids if any(rid.startswith(p) for p in city_and_district_prefixes)]
    return filtered if filtered else all_region_ids


def create_drivers(session, region_ids, max_total=60):
    """Создать водителей: только город + районы, всего не более max_total"""
    created = 0
    driver_idx = 0
    remaining = max_total
    num_regions = len(region_ids)
    # Равномерно распределяем: по 1-2 водителя на регион
    drivers_per_region = max(1, remaining // num_regions) if num_regions else 0
    extra = remaining % num_regions if num_regions else 0

    for region_idx, region_id in enumerate(region_ids):
        if remaining <= 0:
            break
        per_region = drivers_per_region + (1 if region_idx < extra else 0)
        per_region = min(per_region, remaining)
        region_created = 0
        for j in range(per_region):
            i = driver_idx
            name = f"{LAST_NAMES[i % len(LAST_NAMES)]} {FIRST_NAMES[i % len(FIRST_NAMES)]}"
            # Уникальные телефоны для seed: 7701 9XX-XX-XX
            a = 900 + (driver_idx * 37) % 100
            b = 10 + (driver_idx * 7) % 90
            c = 10 + (driver_idx * 11) % 90
            phone = f"+7 701 {a:03d}-{b:02d}-{c:02d}"
            email = f"driver_{region_id}_{j}@invotaxi-test.kz"
            password = "DriverPass123!"
            plate = f"А{region_idx % 10:01d}{j % 10:01d}{i % 10:01d}БВ {777 + i % 1000}"
            
            r = session.post(f"{BASE_URL}/api/drivers/", json={
                "name": name,
                "phone": phone,
                "email": email,
                "password": password,
                "region_id": region_id,
                "car_model": CAR_MODELS[i % len(CAR_MODELS)],
                "plate_number": plate,
                "capacity": 4,
                "is_online": True,
            })
            if r.status_code in (200, 201):
                created += 1
                region_created += 1
            else:
                print(f"  Ошибка водитель {region_id} #{j+1}: {r.status_code} {r.text[:150]}")
            driver_idx += 1
            time.sleep(0.1)
        remaining -= region_created
        if region_created > 0:
            print(f"  {region_id}: +{region_created} водителей (всего {created})")
    return created


def create_orders(session, count=500, batch_size=50):
    """Создать заказы через create-batch"""
    total_created = 0
    num_passengers = 20
    base_phone = 77001230000
    
    for batch_start in range(0, count, batch_size):
        batch_end = min(batch_start + batch_size, count)
        batch_count = batch_end - batch_start
        
        passenger_idx = (batch_start // batch_size) % num_passengers
        phone = f"+7 {str(base_phone + passenger_idx)[1:3]} {str(base_phone + passenger_idx)[3:6]}-{str(base_phone + passenger_idx)[6:8]}-{str(base_phone + passenger_idx)[8:10]}"
        name = f"Пассажир {LAST_NAMES[passenger_idx % len(LAST_NAMES)]} {FIRST_NAMES[passenger_idx % len(FIRST_NAMES)]}"
        
        orders = []
        for j in range(batch_count):
            idx = (batch_start + j) % len(PICKUP_ADDRESSES)
            drop_idx = (batch_start + j + 1) % len(DROPOFF_ADDRESSES)
            pickup_addr, plat, plon = PICKUP_ADDRESSES[idx]
            dropoff_addr, dlat, dlon = DROPOFF_ADDRESSES[drop_idx]
            hour = 7 + (j % 14)
            minute = (j * 7) % 60
            time_str = f"{hour:02d}:{minute:02d}"
            orders.append({
                "pickup_address": pickup_addr,
                "dropoff_address": dropoff_addr,
                "pickup_lat": plat + (random.random() - 0.5) * 0.01,
                "pickup_lon": plon + (random.random() - 0.5) * 0.01,
                "dropoff_lat": dlat + (random.random() - 0.5) * 0.01,
                "dropoff_lon": dlon + (random.random() - 0.5) * 0.01,
                "time": time_str,
            })
        
        r = session.post(f"{BASE_URL}/api/orders/create-batch/", json={
            "passenger_phone": phone,
            "passenger_name": name,
            "orders": orders,
        })
        if r.status_code in (200, 201, 207):
            data = r.json()
            created = data.get("created_orders_count", 0)
            total_created += created
            print(f"  Создано заказов: {total_created}/{count}")
        else:
            print(f"  Ошибка batch заказов: {r.status_code} {r.text[:300]}")
        time.sleep(0.3)
    
    return total_created


def main():
    print(f"Invotaxi Seed Script")
    print(f"API: {BASE_URL}")
    print()
    
    session = requests.Session()
    session.headers["Content-Type"] = "application/json"
    
    print("1. Авторизация...")
    login(session)
    print("   OK")
    
    print("2. Регионы (город Атырау + районы)...")
    region_ids = ensure_regions(session)
    print(f"   Регионов для водителей: {len(region_ids)}")
    
    print("3. Создание водителей (город + районы, макс. 60)...")
    drivers_created = create_drivers(session, region_ids, max_total=60)
    print(f"   Создано водителей: {drivers_created}")
    
    print("4. Создание 500 заказов...")
    orders_created = create_orders(session, 500, 50)
    print(f"   Создано заказов: {orders_created}")
    
    print()
    print("Готово!")


if __name__ == "__main__":
    main()
