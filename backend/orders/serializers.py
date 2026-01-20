from rest_framework import serializers
from .models import Order, OrderEvent, OrderStatus
from .services import PriceCalculator
from .geocoding_service import geocode_order_addresses
from accounts.serializers import PassengerSerializer, DriverSerializer
import logging

logger = logging.getLogger(__name__)


class OrderSerializer(serializers.ModelSerializer):
    passenger = PassengerSerializer(read_only=True)
    passenger_id = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True
    )
    # Поля для создания пассажира, если его нет
    passenger_phone = serializers.CharField(
        write_only=True,
        required=False,
        allow_null=True,
        help_text="Телефон пассажира (для создания нового пассажира)"
    )
    passenger_name = serializers.CharField(
        write_only=True,
        required=False,
        allow_null=True,
        help_text="Имя пассажира (обязательно при создании нового)"
    )
    passenger_region_id = serializers.CharField(
        write_only=True,
        required=False,
        allow_null=True,
        help_text="ID региона пассажира (обязательно при создании нового)"
    )
    passenger_disability_category = serializers.ChoiceField(
        choices=[
            ('I группа', 'I группа'),
            ('II группа', 'II группа'),
            ('III группа', 'III группа'),
            ('Ребенок-инвалид', 'Ребенок-инвалид'),
        ],
        write_only=True,
        required=False,
        allow_null=True,
        help_text="Категория инвалидности (обязательно при создании нового)"
    )
    passenger_allowed_companion = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
        help_text="Разрешено сопровождение"
    )
    driver = DriverSerializer(read_only=True)
    driver_id = serializers.IntegerField(
        source='driver.id',
        write_only=True,
        required=False,
        allow_null=True
    )
    pickup_coordinate = serializers.SerializerMethodField()
    dropoff_coordinate = serializers.SerializerMethodField()
    seats_needed = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'passenger', 'passenger_id', 
            'passenger_phone', 'passenger_name', 'passenger_region_id',
            'passenger_disability_category', 'passenger_allowed_companion',
            'driver', 'driver_id',
            'pickup_title', 'dropoff_title',
            'pickup_lat', 'pickup_lon', 'dropoff_lat', 'dropoff_lon',
            'pickup_coordinate', 'dropoff_coordinate',
            'desired_pickup_time', 'has_companion', 'note',
            'status', 'created_at', 'assigned_at', 'completed_at',
            'assignment_reason', 'rejection_reason',
            'video_recording', 'upload_started', 'seats_needed',
            'distance_km', 'waiting_time_minutes',
            'estimated_price', 'final_price', 'price_breakdown'
        ]
        read_only_fields = [
            'id', 'created_at', 'assigned_at', 'completed_at',
            'assignment_reason', 'rejection_reason',
            'distance_km', 'waiting_time_minutes',
            'estimated_price', 'final_price', 'price_breakdown'
        ]


    def get_pickup_coordinate(self, obj):
        return {'lat': obj.pickup_lat, 'lon': obj.pickup_lon}

    def get_dropoff_coordinate(self, obj):
        return {'lat': obj.dropoff_lat, 'lon': obj.dropoff_lon}

    def create(self, validated_data):
        # Генерируем ID заказа
        import time
        from accounts.models import Passenger, Driver, User
        from regions.models import Region
        from regions.services import get_region_by_coordinates
        from django.contrib.auth.hashers import make_password
        from django.core.exceptions import ObjectDoesNotExist
        
        order_id = f'order_{int(time.time() * 1000)}'
        validated_data['id'] = order_id
        
        # Извлекаем данные для создания пассажира (если нужно)
        passenger_phone = validated_data.pop('passenger_phone', None)
        passenger_name = validated_data.pop('passenger_name', None)
        passenger_region_id = validated_data.pop('passenger_region_id', None)
        passenger_disability_category = validated_data.pop('passenger_disability_category', None)
        passenger_allowed_companion = validated_data.pop('passenger_allowed_companion', False)
        
        # Обрабатываем passenger_id и driver_id если они переданы
        # Сначала проверяем passenger_id напрямую
        passenger_id = validated_data.pop('passenger_id', None)
        if passenger_id:
            try:
                validated_data['passenger'] = Passenger.objects.get(id=passenger_id)
            except Passenger.DoesNotExist:
                raise serializers.ValidationError({'passenger_id': 'Пассажир с указанным ID не найден'})
        
        # Если passenger_id не был передан, проверяем вложенный объект passenger
        if not validated_data.get('passenger'):
            passenger_data = validated_data.pop('passenger', None)
            if passenger_data and isinstance(passenger_data, dict) and 'id' in passenger_data:
                try:
                    validated_data['passenger'] = Passenger.objects.get(id=passenger_data['id'])
                except Passenger.DoesNotExist:
                    raise serializers.ValidationError({'passenger_id': 'Пассажир с указанным ID не найден'})
        
        # Функция для получения или создания пассажира
        # Будет вызвана после геокодирования, чтобы определить регион по координатам
        def get_or_create_passenger(pickup_lat=None, pickup_lon=None):
            """Внутренняя функция для создания пассажира после геокодирования"""
            if validated_data.get('passenger'):
                return  # Пассажир уже установлен
            
            if not passenger_phone:
                return  # Телефон не указан
            
            try:
                # Ищем пользователя по телефону
                user = User.objects.get(phone=passenger_phone)
                # Проверяем, есть ли у него профиль пассажира
                if hasattr(user, 'passenger'):
                    validated_data['passenger'] = user.passenger
                    return
                
                # Пользователь есть, но нет профиля пассажира - создаем
                # Используем переданные данные или дефолтные
                full_name = passenger_name or f'Пассажир {passenger_phone}'
                disability_cat = passenger_disability_category or 'III группа'
                
                # Определяем регион: сначала по переданному ID, затем по координатам
                region = None
                if passenger_region_id:
                    try:
                        region = Region.objects.get(id=passenger_region_id)
                    except Region.DoesNotExist:
                        logger.warning(f'Регион {passenger_region_id} не найден, попытка определить по координатам')
                
                # Если регион не найден, пытаемся определить по координатам
                if not region and pickup_lat and pickup_lon:
                    region = get_region_by_coordinates(pickup_lat, pickup_lon)
                    if region:
                        logger.info(f'Регион автоматически определен по координатам: {region.id}')
                
                # Если регион все еще не найден, берем первый доступный
                if not region:
                    region = Region.objects.first()
                    if region:
                        logger.warning(f'Использован первый доступный регион: {region.id}')
                
                if not region:
                    raise serializers.ValidationError({
                        'passenger_region_id': 'Регион не указан и не может быть определен автоматически. Укажите passenger_region_id или убедитесь, что в БД есть регионы.'
                    })
                
                # Обновляем роль пользователя
                user.role = 'passenger'
                user.save(update_fields=['role'])
                
                # Создаем профиль пассажира
                passenger = Passenger.objects.create(
                    user=user,
                    full_name=full_name,
                    region=region,
                    disability_category=disability_cat,
                    allowed_companion=passenger_allowed_companion
                )
                validated_data['passenger'] = passenger
                logger.info(f'Создан профиль пассажира для пользователя {user.phone}: {passenger.full_name}')
                
            except User.DoesNotExist:
                # Пользователя нет - создаем и пользователя, и пассажира
                # Используем переданные данные или дефолтные
                full_name = passenger_name or f'Пассажир {passenger_phone}'
                disability_cat = passenger_disability_category or 'III группа'
                
                # Определяем регион: сначала по переданному ID, затем по координатам
                region = None
                if passenger_region_id:
                    try:
                        region = Region.objects.get(id=passenger_region_id)
                    except Region.DoesNotExist:
                        logger.warning(f'Регион {passenger_region_id} не найден, попытка определить по координатам')
                
                # Если регион не найден, пытаемся определить по координатам
                if not region and pickup_lat and pickup_lon:
                    region = get_region_by_coordinates(pickup_lat, pickup_lon)
                    if region:
                        logger.info(f'Регион автоматически определен по координатам: {region.id}')
                
                # Если регион все еще не найден, берем первый доступный
                if not region:
                    region = Region.objects.first()
                    if region:
                        logger.warning(f'Использован первый доступный регион: {region.id}')
                
                if not region:
                    raise serializers.ValidationError({
                        'passenger_region_id': 'Регион не указан и не может быть определен автоматически. Укажите passenger_region_id или убедитесь, что в БД есть регионы.'
                    })
                
                # Создаем пользователя
                username = f'passenger_{passenger_phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")}'
                user = User.objects.create(
                    username=username,
                    phone=passenger_phone,
                    role='passenger',
                    password=make_password(None)  # Без пароля, только телефон
                )
                
                # Создаем профиль пассажира
                passenger = Passenger.objects.create(
                    user=user,
                    full_name=full_name,
                    region=region,
                    disability_category=disability_cat,
                    allowed_companion=passenger_allowed_companion
                )
                validated_data['passenger'] = passenger
                logger.info(f'Создан новый пассажир: {passenger.full_name} (телефон: {passenger_phone})')
        
        # Пытаемся создать пассажира до геокодирования (если есть регион)
        # Но если региона нет, создадим после геокодирования
        if not validated_data.get('passenger') and passenger_phone and passenger_region_id:
            try:
                region = Region.objects.get(id=passenger_region_id)
                get_or_create_passenger()
            except Region.DoesNotExist:
                # Регион не найден, будет определен после геокодирования
                pass
        
        # Если passenger все еще не установлен, используем текущего пользователя
        if not validated_data.get('passenger'):
            request = self.context.get('request')
            if request and hasattr(request.user, 'passenger'):
                validated_data['passenger'] = request.user.passenger
            else:
                raise serializers.ValidationError({
                    'passenger': 'Необходимо указать пассажира (passenger_id или passenger_phone) или войти как пассажир'
                })
        
        driver_data = validated_data.pop('driver', None)
        if driver_data and isinstance(driver_data, dict) and 'id' in driver_data:
            try:
                validated_data['driver'] = Driver.objects.get(id=driver_data['id'])
            except Driver.DoesNotExist:
                # Водитель не обязателен при создании заказа, просто игнорируем
                pass
        
        # Геокодирование адресов, если координаты не указаны
        pickup_title = validated_data.get('pickup_title')
        dropoff_title = validated_data.get('dropoff_title')
        pickup_lat = validated_data.get('pickup_lat')
        pickup_lon = validated_data.get('pickup_lon')
        dropoff_lat = validated_data.get('dropoff_lat')
        dropoff_lon = validated_data.get('dropoff_lon')
        
        # Проверяем, нужно ли геокодировать
        needs_geocoding = (
            (pickup_lat is None or pickup_lon is None or pickup_lat == 0 or pickup_lon == 0) and pickup_title
        ) or (
            (dropoff_lat is None or dropoff_lon is None or dropoff_lat == 0 or dropoff_lon == 0) and dropoff_title
        )
        
        if needs_geocoding:
            logger.info(f'Геокодирование адресов для заказа {order_id}')
            geocoding_result = geocode_order_addresses(
                pickup_address=pickup_title if (pickup_lat is None or pickup_lon is None or pickup_lat == 0 or pickup_lon == 0) else None,
                dropoff_address=dropoff_title if (dropoff_lat is None or dropoff_lon is None or dropoff_lat == 0 or dropoff_lon == 0) else None,
                pickup_lat=pickup_lat if pickup_lat and pickup_lat != 0 else None,
                pickup_lon=pickup_lon if pickup_lon and pickup_lon != 0 else None,
                dropoff_lat=dropoff_lat if dropoff_lat and dropoff_lat != 0 else None,
                dropoff_lon=dropoff_lon if dropoff_lon and dropoff_lon != 0 else None,
            )
            
            # Обновляем координаты
            if geocoding_result['pickup_geocoded']:
                validated_data['pickup_lat'] = geocoding_result['pickup_lat']
                validated_data['pickup_lon'] = geocoding_result['pickup_lon']
                logger.info(f'Адрес отправления геокодирован: ({geocoding_result["pickup_lat"]}, {geocoding_result["pickup_lon"]})')
            elif geocoding_result['pickup_error']:
                logger.warning(f'Не удалось геокодировать адрес отправления: {geocoding_result["pickup_error"]}')
                # Можно либо выбросить ошибку, либо оставить None (если это допустимо в модели)
                if pickup_lat is None or pickup_lon is None:
                    raise serializers.ValidationError({
                        'pickup_title': f'Не удалось определить координаты для адреса отправления: {geocoding_result["pickup_error"]}'
                    })
            
            if geocoding_result['dropoff_geocoded']:
                validated_data['dropoff_lat'] = geocoding_result['dropoff_lat']
                validated_data['dropoff_lon'] = geocoding_result['dropoff_lon']
                logger.info(f'Адрес назначения геокодирован: ({geocoding_result["dropoff_lat"]}, {geocoding_result["dropoff_lon"]})')
            elif geocoding_result['dropoff_error']:
                logger.warning(f'Не удалось геокодировать адрес назначения: {geocoding_result["dropoff_error"]}')
                # Можно либо выбросить ошибку, либо оставить None (если это допустимо в модели)
                if dropoff_lat is None or dropoff_lon is None:
                    raise serializers.ValidationError({
                        'dropoff_title': f'Не удалось определить координаты для адреса назначения: {geocoding_result["dropoff_error"]}'
                    })
            
            # После геокодирования пытаемся создать пассажира с автоматическим определением региона
            if not validated_data.get('passenger') and passenger_phone:
                get_or_create_passenger(
                    pickup_lat=validated_data.get('pickup_lat'),
                    pickup_lon=validated_data.get('pickup_lon')
                )
        
        # Если пассажир все еще не создан, но есть телефон, пытаемся создать
        if not validated_data.get('passenger') and passenger_phone:
            get_or_create_passenger(
                pickup_lat=validated_data.get('pickup_lat'),
                pickup_lon=validated_data.get('pickup_lon')
            )
        
        # Проверяем, что координаты указаны (после геокодирования)
        if not validated_data.get('pickup_lat') or not validated_data.get('pickup_lon'):
            raise serializers.ValidationError({
                'pickup_title': 'Необходимо указать координаты отправления (pickup_lat, pickup_lon) или адрес для геокодирования'
            })
        if not validated_data.get('dropoff_lat') or not validated_data.get('dropoff_lon'):
            raise serializers.ValidationError({
                'dropoff_title': 'Необходимо указать координаты назначения (dropoff_lat, dropoff_lon) или адрес для геокодирования'
            })
        
        # Создаем заказ
        try:
            order = super().create(validated_data)
        except Exception as e:
            logger.error(f'Ошибка создания заказа: {str(e)}', exc_info=True)
            raise serializers.ValidationError({'error': f'Ошибка создания заказа: {str(e)}'})
        
        # Рассчитываем предварительную цену
        try:
            price_data = PriceCalculator.calculate_estimated_price(order)
            order.distance_km = price_data['distance_km']
            order.waiting_time_minutes = price_data['waiting_time_minutes']
            order.estimated_price = price_data['estimated_price']
            order.price_breakdown = price_data['price_breakdown']
            order.save()
        except Exception as e:
            # Если расчет цены не удался, все равно сохраняем заказ
            logger.error(f'Ошибка расчета цены для заказа {order.id}: {str(e)}', exc_info=True)
            # Можно оставить заказ без цены или установить дефолтные значения
            if not order.distance_km:
                order.distance_km = 0.0
            if not order.waiting_time_minutes:
                order.waiting_time_minutes = 0
            order.save()
        
        return order
    
    def update(self, instance, validated_data):
        """Обновление заказа с пересчетом цены при необходимости"""
        order = super().update(instance, validated_data)
        
        # Если изменились координаты или время, пересчитываем цену
        if any(field in validated_data for field in ['pickup_lat', 'pickup_lon', 'dropoff_lat', 'dropoff_lon', 'desired_pickup_time', 'has_companion']):
            # Пересчитываем только если заказ еще не завершен
            if order.status != OrderStatus.COMPLETED:
                price_data = PriceCalculator.calculate_estimated_price(order)
                order.distance_km = price_data['distance_km']
                order.waiting_time_minutes = price_data['waiting_time_minutes']
                order.estimated_price = price_data['estimated_price']
                order.price_breakdown = price_data['price_breakdown']
                order.save()
        
        return order


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=OrderStatus.choices)
    reason = serializers.CharField(required=False, allow_blank=True)


class OrderEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderEvent
        fields = ['id', 'order', 'status_from', 'status_to', 'created_at', 'description']
        read_only_fields = ['id', 'created_at']

