from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from .models import Passenger, Driver, UserActivityLog
from regions.serializers import RegionSerializer

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'phone', 'role', 'email']
        read_only_fields = ['id', 'username', 'role']

    def get_role(self, obj):
        if hasattr(obj, 'passenger'):
            return 'passenger'
        elif hasattr(obj, 'driver'):
            return 'driver'
        elif obj.is_staff:
            return 'admin'
        return obj.role


class PassengerSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    region = RegionSerializer(read_only=True)
    region_id = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Passenger
        fields = [
            'id', 'user', 'full_name', 'region', 'region_id',
            'disability_category', 'allowed_companion'
        ]
        read_only_fields = ['id']


class DriverSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    region = RegionSerializer(read_only=True)
    region_id = serializers.CharField(write_only=True, required=False)
    current_position = serializers.SerializerMethodField()
    # Поля для обновления User
    phone = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(write_only=True, required=False)

    class Meta:
        model = Driver
        fields = [
            'id', 'user', 'name', 'region', 'region_id',
            'car_model', 'plate_number', 'capacity',
            'is_online', 'current_lat', 'current_lon',
            'current_position', 'last_location_update',
            'phone', 'email'
        ]
        read_only_fields = ['id', 'last_location_update']

    def get_current_position(self, obj):
        if obj.current_lat is not None and obj.current_lon is not None:
            return {'lat': obj.current_lat, 'lon': obj.current_lon}
        return None


class DriverCreateSerializer(serializers.Serializer):
    """Сериализатор для создания водителя"""
    name = serializers.CharField(max_length=200, required=True)
    phone = serializers.CharField(max_length=20, required=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    region_id = serializers.CharField(required=True)
    car_model = serializers.CharField(max_length=100, required=True)
    plate_number = serializers.CharField(max_length=20, required=True)
    capacity = serializers.IntegerField(required=False, default=4)
    is_online = serializers.BooleanField(required=False, default=False)

    def validate_phone(self, value):
        """Валидация телефона"""
        cleaned = value.replace('+', '').replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
        if not cleaned.isdigit() or len(cleaned) < 10:
            raise serializers.ValidationError('Неверный формат телефона')
        return value

    def validate(self, attrs):
        """Проверка уникальности телефона"""
        phone = attrs.get('phone')
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError({'phone': 'Пользователь с таким телефоном уже существует'})
        return attrs


class PhoneLoginSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20, required=True)

    def validate_phone(self, value):
        # Базовая валидация телефона
        cleaned = value.replace('+', '').replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
        if not cleaned.isdigit() or len(cleaned) < 10:
            raise serializers.ValidationError('Неверный формат телефона')
        return value


class VerifyOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20, required=True)
    code = serializers.CharField(max_length=6, required=True)

    def validate_phone(self, value):
        cleaned = value.replace('+', '').replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
        if not cleaned.isdigit() or len(cleaned) < 10:
            raise serializers.ValidationError('Неверный формат телефона')
        return value

    def validate_code(self, value):
        if not value.isdigit() or len(value) != 6:
            raise serializers.ValidationError('Код должен состоять из 6 цифр')
        return value


class EmailPasswordLoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs):
        email = attrs.get('email')
        password = attrs.get('password')
        
        if not email or not password:
            raise serializers.ValidationError('Email и пароль обязательны')
        
        return attrs


# Сериализаторы для админ-панели управления пользователями

class AdminUserSerializer(serializers.ModelSerializer):
    """Сериализатор для отображения админ-пользователей"""
    role_display = serializers.SerializerMethodField()
    groups = serializers.SerializerMethodField()
    initials = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'phone', 'role', 'role_display',
            'is_active', 'is_staff', 'last_login', 'date_joined',
            'groups', 'initials', 'first_name', 'last_name'
        ]
        read_only_fields = ['id', 'username', 'date_joined', 'last_login']
    
    def get_role_display(self, obj):
        """Определяет роль пользователя для отображения"""
        if obj.is_staff:
            # Проверяем группы Django
            if obj.groups.filter(name='dispatcher').exists():
                return 'Dispatcher'
            elif obj.groups.filter(name='operator').exists():
                return 'Operator'
            else:
                return 'Admin'
        return obj.get_role_display()
    
    def get_groups(self, obj):
        """Возвращает список групп пользователя"""
        return [group.name for group in obj.groups.all()]
    
    def get_initials(self, obj):
        """Генерирует инициалы из имени пользователя"""
        if obj.first_name and obj.last_name:
            return f"{obj.first_name[0]}{obj.last_name[0]}".upper()
        elif obj.first_name:
            return obj.first_name[:2].upper()
        elif obj.username:
            return obj.username[:2].upper()
        return "U"


class AdminUserCreateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания админ-пользователя"""
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    role = serializers.ChoiceField(
        choices=['Admin', 'Dispatcher', 'Operator'],
        write_only=True,
        required=True
    )
    username = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    
    class Meta:
        model = User
        fields = ['username', 'email', 'phone', 'password', 'role', 'first_name', 'last_name']
    
    def validate_phone(self, value):
        """Валидация телефона"""
        if not value:
            raise serializers.ValidationError('Телефон обязателен')
        cleaned = value.replace('+', '').replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
        if not cleaned.isdigit() or len(cleaned) < 10:
            raise serializers.ValidationError('Неверный формат телефона')
        return value
    
    def validate(self, attrs):
        """Проверка уникальности телефона и email"""
        phone = attrs.get('phone')
        email = attrs.get('email')
        username = attrs.get('username')
        
        if not phone:
            raise serializers.ValidationError({'phone': 'Телефон обязателен'})
        
        # Проверяем уникальность телефона (точное совпадение)
        # Примечание: для более точной проверки можно нормализовать телефоны в БД
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError({'phone': 'Пользователь с таким телефоном уже существует'})
        
        if email and User.objects.filter(email=email).exists():
            raise serializers.ValidationError({'email': 'Пользователь с таким email уже существует'})
        
        if username and User.objects.filter(username=username).exists():
            raise serializers.ValidationError({'username': 'Пользователь с таким именем пользователя уже существует'})
        
        return attrs
    
    def create(self, validated_data):
        """Создание пользователя с установкой роли"""
        role = validated_data.pop('role')
        password = validated_data.pop('password')
        
        # Генерируем username если не указан
        username = validated_data.get('username')
        if not username:
            base_username = validated_data.get('email', '').split('@')[0] if validated_data.get('email') else None
            if not base_username:
                phone_cleaned = validated_data.get('phone', '').replace('+', '').replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
                base_username = f"user_{phone_cleaned}"
            
            # Проверяем уникальность и добавляем суффикс если нужно
            username = base_username
            counter = 1
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{counter}"
                counter += 1
            
            validated_data['username'] = username
        
        # Создаем пользователя
        user = User.objects.create_user(
            password=password,
            is_staff=True,
            role='admin',
            **validated_data
        )
        
        # Устанавливаем группы в зависимости от роли
        if role == 'Dispatcher':
            group, _ = Group.objects.get_or_create(name='dispatcher')
            user.groups.add(group)
        elif role == 'Operator':
            group, _ = Group.objects.get_or_create(name='operator')
            user.groups.add(group)
        else:  # Admin
            group, _ = Group.objects.get_or_create(name='admin')
            user.groups.add(group)
        
        return user


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """Сериализатор для обновления админ-пользователя"""
    role = serializers.ChoiceField(
        choices=['Admin', 'Dispatcher', 'Operator'],
        write_only=True,
        required=False
    )
    
    class Meta:
        model = User
        fields = ['email', 'phone', 'first_name', 'last_name', 'is_active', 'role']
    
    def validate_phone(self, value):
        """Валидация телефона"""
        cleaned = value.replace('+', '').replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
        if not cleaned.isdigit() or len(cleaned) < 10:
            raise serializers.ValidationError('Неверный формат телефона')
        return value
    
    def validate(self, attrs):
        """Проверка уникальности телефона и email"""
        phone = attrs.get('phone')
        email = attrs.get('email')
        instance = self.instance
        
        if phone and User.objects.filter(phone=phone).exclude(id=instance.id).exists():
            raise serializers.ValidationError({'phone': 'Пользователь с таким телефоном уже существует'})
        
        if email and User.objects.filter(email=email).exclude(id=instance.id).exists():
            raise serializers.ValidationError({'email': 'Пользователь с таким email уже существует'})
        
        return attrs
    
    def update(self, instance, validated_data):
        """Обновление пользователя с изменением роли"""
        role = validated_data.pop('role', None)
        
        # Обновляем поля пользователя
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Обновляем группы если изменилась роль
        if role:
            instance.groups.clear()
            if role == 'Dispatcher':
                group, _ = Group.objects.get_or_create(name='dispatcher')
                instance.groups.add(group)
            elif role == 'Operator':
                group, _ = Group.objects.get_or_create(name='operator')
                instance.groups.add(group)
            else:  # Admin
                group, _ = Group.objects.get_or_create(name='admin')
                instance.groups.add(group)
        
        return instance


class PasswordResetSerializer(serializers.Serializer):
    """Сериализатор для сброса пароля"""
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    
    def validate_password(self, value):
        """Валидация пароля"""
        if len(value) < 8:
            raise serializers.ValidationError('Пароль должен содержать минимум 8 символов')
        return value


class BulkActionSerializer(serializers.Serializer):
    """Сериализатор для массовых операций"""
    user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=True,
        min_length=1
    )
    action = serializers.ChoiceField(
        choices=['block', 'unblock', 'delete'],
        required=True
    )
    
    def validate_user_ids(self, value):
        """Проверка существования пользователей"""
        if not value:
            raise serializers.ValidationError('Список пользователей не может быть пустым')
        return value


class UserActivityLogSerializer(serializers.ModelSerializer):
    """Сериализатор для логов активности пользователей"""
    performed_by_username = serializers.CharField(source='performed_by.username', read_only=True)
    action_type_display = serializers.CharField(source='get_action_type_display', read_only=True)
    
    class Meta:
        model = UserActivityLog
        fields = [
            'id', 'action_type', 'action_type_display', 'description',
            'ip_address', 'performed_by_username', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
