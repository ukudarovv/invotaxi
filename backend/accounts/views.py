from rest_framework import status, viewsets, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.db import models
from .models import Passenger, Driver, UserActivityLog
from regions.models import Region
from .serializers import (
    UserSerializer, PassengerSerializer, DriverSerializer, DriverCreateSerializer,
    PhoneLoginSerializer, VerifyOTPSerializer, EmailPasswordLoginSerializer,
    AdminUserSerializer, AdminUserCreateSerializer, AdminUserUpdateSerializer,
    PasswordResetSerializer, BulkActionSerializer, UserActivityLogSerializer
)
from django.contrib.auth import authenticate
from .services import OTPService, UserService

User = get_user_model()


class AuthViewSet(viewsets.ViewSet):
    """ViewSet для аутентификации"""
    permission_classes = [AllowAny]

    @action(detail=False, methods=['post'], url_path='phone-login')
    def phone_login(self, request):
        """Запрос OTP кода"""
        serializer = PhoneLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone = serializer.validated_data['phone']
        otp = OTPService.create_otp(phone)

        return Response({
            'message': 'OTP код отправлен',
            'expires_at': otp.expires_at
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='verify-otp')
    def verify_otp(self, request):
        """Проверка OTP и выдача токена"""
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone = serializer.validated_data['phone']
        code = serializer.validated_data['code']

        is_valid, otp = OTPService.verify_otp(phone, code)

        if not is_valid:
            return Response(
                {'error': 'Неверный или истекший код'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Получаем или создаем пользователя
        user, created = OTPService.get_or_create_user(phone)

        # Генерируем JWT токены
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)

        # Определяем роль и дополнительные данные
        role = UserService.get_user_role(user)
        response_data = {
            'access': access_token,
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
            'role': role,
        }

        # Добавляем данные пассажира или водителя
        if role == 'passenger' and hasattr(user, 'passenger'):
            response_data['passenger'] = PassengerSerializer(user.passenger).data
            response_data['passenger_id'] = user.passenger.id
        elif role == 'driver' and hasattr(user, 'driver'):
            response_data['driver'] = DriverSerializer(user.driver).data
            response_data['driver_id'] = user.driver.id

        return Response(response_data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='email-login')
    def email_login(self, request):
        """Вход по email и паролю для админ-панели"""
        serializer = EmailPasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        password = serializer.validated_data['password']

        # Пытаемся найти пользователя по email
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {'error': 'Неверный email или пароль'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Проверяем пароль
        if not user.check_password(password):
            return Response(
                {'error': 'Неверный email или пароль'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Проверяем, что пользователь является staff (админ, диспетчер, оператор)
        if not user.is_staff:
            return Response(
                {'error': 'Доступ разрешен только для администраторов'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Генерируем JWT токены
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)

        # Определяем роль пользователя
        # Можно использовать группы Django или флаги
        role = 'admin'  # По умолчанию
        if user.groups.filter(name='dispatcher').exists():
            role = 'dispatcher'
        elif user.groups.filter(name='operator').exists():
            role = 'operator'

        response_data = {
            'access': access_token,
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'phone': user.phone,
                'role': role,
            },
            'role': role,
        }

        return Response(response_data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='refresh')
    def refresh_token(self, request):
        """Обновление access токена"""
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'error': 'Требуется refresh токен'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            refresh = RefreshToken(refresh_token)
            access_token = str(refresh.access_token)
            return Response({
                'access': access_token,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': 'Неверный или истекший refresh токен'},
                status=status.HTTP_401_UNAUTHORIZED
            )

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def logout(self, request):
        """Выход из системы"""
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass

        return Response({'message': 'Выход выполнен'}, status=status.HTTP_200_OK)


class PassengerViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet для пассажиров"""
    queryset = Passenger.objects.select_related('user', 'region').all()
    serializer_class = PassengerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Пассажиры могут видеть только свой профиль
        if hasattr(user, 'passenger'):
            return Passenger.objects.filter(id=user.passenger.id)
        # Админы и водители могут видеть всех
        return super().get_queryset()


class DriverViewSet(viewsets.ModelViewSet):
    """ViewSet для водителей"""
    queryset = Driver.objects.select_related('user', 'region').all()
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        """Выбор сериализатора в зависимости от действия"""
        if self.action == 'create':
            return DriverCreateSerializer
        return DriverSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = super().get_queryset()
        
        # Водители могут видеть только свой профиль
        if hasattr(user, 'driver'):
            return queryset.filter(id=user.driver.id)
        
        # Админы могут видеть всех с фильтрацией
        # Фильтрация по is_online
        is_online = self.request.query_params.get('is_online')
        if is_online is not None:
            queryset = queryset.filter(is_online=is_online.lower() == 'true')
        
        # Фильтрация по region_id
        region_id = self.request.query_params.get('region_id')
        if region_id:
            queryset = queryset.filter(region_id=region_id)
        
        # Поиск по name, car_model, plate_number, user__phone
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(car_model__icontains=search) |
                models.Q(plate_number__icontains=search) |
                models.Q(user__phone__icontains=search)
            )
        
        return queryset

    @action(detail=True, methods=['patch'], url_path='location')
    def update_location(self, request, pk=None):
        """Обновление позиции водителя"""
        driver = self.get_object()
        
        # Проверяем права доступа
        if hasattr(request.user, 'driver') and driver.id != request.user.driver.id:
            return Response(
                {'error': 'Нет доступа'},
                status=status.HTTP_403_FORBIDDEN
            )

        lat = request.data.get('lat')
        lon = request.data.get('lon')

        if lat is None or lon is None:
            return Response(
                {'error': 'Требуются lat и lon'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.utils import timezone
        driver.current_lat = float(lat)
        driver.current_lon = float(lon)
        driver.last_location_update = timezone.now()
        driver.save()

        return Response(DriverSerializer(driver).data)

    @action(detail=True, methods=['patch'], url_path='online-status')
    def update_online_status(self, request, pk=None):
        """Обновление онлайн статуса водителя"""
        driver = self.get_object()
        
        # Проверяем права доступа
        if hasattr(request.user, 'driver') and driver.id != request.user.driver.id:
            return Response(
                {'error': 'Нет доступа'},
                status=status.HTTP_403_FORBIDDEN
            )

        is_online = request.data.get('is_online')
        if is_online is None:
            return Response(
                {'error': 'Требуется is_online'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.utils import timezone
        from accounts.models import DriverStatus
        
        driver.is_online = bool(is_online)
        
        # Устанавливаем статус водителя в зависимости от is_online
        if driver.is_online:
            # Если водитель становится онлайн и не занят, устанавливаем ONLINE_IDLE
            if not hasattr(driver, 'status') or driver.status in [
                DriverStatus.OFFLINE, 
                None
            ] or (driver.status == DriverStatus.ON_TRIP and not driver.orders.filter(
                status__in=['assigned', 'driver_en_route', 'arrived_waiting', 'ride_ongoing']
            ).exists()):
                driver.status = DriverStatus.ONLINE_IDLE
                driver.idle_since = timezone.now()
        else:
            # Если водитель становится офлайн
            driver.status = DriverStatus.OFFLINE
            driver.idle_since = None
        
        driver.save(update_fields=['is_online', 'status', 'idle_since'])

        return Response(DriverSerializer(driver).data)

    def create(self, request, *args, **kwargs):
        """Создание водителя с возвратом полных данных включая регион"""
        # Используем DriverCreateSerializer для валидации
        create_serializer = DriverCreateSerializer(data=request.data)
        create_serializer.is_valid(raise_exception=True)
        
        validated_data = create_serializer.validated_data
        
        # Проверяем права доступа (только админы могут создавать)
        if not request.user.is_staff:
            raise PermissionDenied('Только администраторы могут создавать водителей')
        
        # Получаем регион
        region_id = validated_data['region_id']
        try:
            region = Region.objects.get(id=region_id)
        except Region.DoesNotExist:
            raise ValidationError({'region_id': 'Регион не найден'})
        
        # Создаем User
        phone = validated_data['phone']
        email = validated_data.get('email', '')
        password = validated_data['password']
        
        username = f'driver_{phone.replace("+", "").replace(" ", "").replace("-", "")}'
        user = User.objects.create_user(
            username=username,
            phone=phone,
            email=email,
            password=password,
            role='driver'
        )
        
        # Создаем Driver
        driver = Driver.objects.create(
            user=user,
            name=validated_data['name'],
            region=region,
            car_model=validated_data['car_model'],
            plate_number=validated_data['plate_number'],
            capacity=validated_data.get('capacity', 4),
            is_online=validated_data.get('is_online', False)
        )
        
        # Перезагружаем водителя с регионом для правильной сериализации
        driver = Driver.objects.select_related('user', 'region').get(id=driver.id)
        
        # Возвращаем ответ с использованием DriverSerializer для включения региона
        response_serializer = DriverSerializer(driver)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_update(self, serializer):
        """Обновление водителя с обновлением User"""
        driver = serializer.instance
        
        # Проверяем права доступа
        user = self.request.user
        if hasattr(user, 'driver') and driver.id != user.driver.id:
            if not user.is_staff:
                raise PermissionDenied('Нет прав для обновления этого водителя')
        
        validated_data = serializer.validated_data
        
        # Обновляем поля Driver
        if 'name' in validated_data:
            driver.name = validated_data['name']
        if 'region_id' in validated_data:
            try:
                region = Region.objects.get(id=validated_data['region_id'])
                driver.region = region
            except Region.DoesNotExist:
                raise ValidationError({'region_id': 'Регион не найден'})
        if 'car_model' in validated_data:
            driver.car_model = validated_data['car_model']
        if 'plate_number' in validated_data:
            driver.plate_number = validated_data['plate_number']
        if 'capacity' in validated_data:
            driver.capacity = validated_data['capacity']
        if 'is_online' in validated_data:
            driver.is_online = validated_data['is_online']
        
        driver.save()
        
        # Обновляем поля User
        if 'phone' in validated_data:
            phone = validated_data['phone']
            # Проверяем уникальность телефона
            if User.objects.filter(phone=phone).exclude(id=driver.user.id).exists():
                raise ValidationError({'phone': 'Пользователь с таким телефоном уже существует'})
            driver.user.phone = phone
        if 'email' in validated_data:
            driver.user.email = validated_data['email']
        
        driver.user.save()
        
        serializer.instance = driver

    def perform_destroy(self, instance):
        """Удаление водителя (только админы)"""
        # Проверяем права доступа
        if not self.request.user.is_staff:
            raise PermissionDenied('Только администраторы могут удалять водителей')
        
        # Удаление Driver автоматически удалит User (CASCADE)
        instance.delete()


def get_client_ip(request):
    """Получение IP адреса клиента"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def log_user_activity(user, action_type, description, request=None, performed_by=None):
    """Вспомогательная функция для логирования активности пользователя"""
    ip_address = None
    if request:
        ip_address = get_client_ip(request)
    
    UserActivityLog.objects.create(
        user=user,
        action_type=action_type,
        description=description,
        ip_address=ip_address,
        performed_by=performed_by or (request.user if request and request.user.is_authenticated else None)
    )


class AdminUserViewSet(viewsets.ModelViewSet):
    """ViewSet для управления админ-пользователями"""
    queryset = User.objects.filter(is_staff=True).prefetch_related('groups').all()
    serializer_class = AdminUserSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Фильтрация и поиск пользователей"""
        queryset = super().get_queryset()
        
        # Фильтрация по роли (через группы)
        role_filter = self.request.query_params.get('role')
        if role_filter:
            if role_filter == 'Admin':
                queryset = queryset.filter(groups__name='admin') | queryset.filter(groups__isnull=True, is_staff=True)
            elif role_filter == 'Dispatcher':
                queryset = queryset.filter(groups__name='dispatcher')
            elif role_filter == 'Operator':
                queryset = queryset.filter(groups__name='operator')
        
        # Фильтрация по статусу
        status_filter = self.request.query_params.get('status')
        if status_filter == 'active':
            queryset = queryset.filter(is_active=True)
        elif status_filter == 'blocked':
            queryset = queryset.filter(is_active=False)
        
        # Поиск по имени, email, телефону
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                models.Q(username__icontains=search) |
                models.Q(email__icontains=search) |
                models.Q(phone__icontains=search) |
                models.Q(first_name__icontains=search) |
                models.Q(last_name__icontains=search)
            )
        
        return queryset.distinct()
    
    def get_serializer_class(self):
        """Выбор сериализатора в зависимости от действия"""
        if self.action == 'create':
            return AdminUserCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return AdminUserUpdateSerializer
        return AdminUserSerializer
    
    def list(self, request, *args, **kwargs):
        """Список пользователей с пагинацией"""
        response = super().list(request, *args, **kwargs)
        
        # Логируем просмотр списка
        log_user_activity(
            user=request.user,
            action_type='login',
            description=f'Просмотр списка пользователей',
            request=request
        )
        
        return response
    
    def create(self, request, *args, **kwargs):
        """Создание нового пользователя"""
        if not request.user.is_staff:
            raise PermissionDenied('Только администраторы могут создавать пользователей')
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Логируем создание
        log_user_activity(
            user=user,
            action_type='create',
            description=f'Создан новый пользователь: {user.username} ({user.email})',
            request=request
        )
        
        response_serializer = AdminUserSerializer(user)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    def update(self, request, *args, **kwargs):
        """Обновление пользователя"""
        if not request.user.is_staff:
            raise PermissionDenied('Только администраторы могут обновлять пользователей')
        
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        # Сохраняем старые значения для лога
        old_role = instance.groups.first().name if instance.groups.exists() else 'Admin'
        old_status = instance.is_active
        
        user = serializer.save()
        
        # Определяем новую роль
        new_role = user.groups.first().name if user.groups.exists() else 'Admin'
        
        # Логируем изменения
        changes = []
        if old_role != new_role:
            changes.append(f'роль: {old_role} → {new_role}')
        if old_status != user.is_active:
            changes.append(f'статус: {"активен" if user.is_active else "заблокирован"}')
        
        if changes:
            log_user_activity(
                user=user,
                action_type='update',
                description=f'Обновлен пользователь: {", ".join(changes)}',
                request=request
            )
        
        return Response(AdminUserSerializer(user).data)
    
    def destroy(self, request, *args, **kwargs):
        """Удаление пользователя"""
        if not request.user.is_staff:
            raise PermissionDenied('Только администраторы могут удалять пользователей')
        
        instance = self.get_object()
        
        # Нельзя удалить самого себя
        if instance.id == request.user.id:
            return Response(
                {'error': 'Нельзя удалить самого себя'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Логируем удаление
        log_user_activity(
            user=instance,
            action_type='delete',
            description=f'Удален пользователь: {instance.username} ({instance.email})',
            request=request
        )
        
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        """Блокировка/разблокировка пользователя"""
        if not request.user.is_staff:
            raise PermissionDenied('Только администраторы могут изменять статус пользователей')
        
        user = self.get_object()
        
        # Нельзя заблокировать самого себя
        if user.id == request.user.id:
            return Response(
                {'error': 'Нельзя заблокировать самого себя'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        old_status = user.is_active
        user.is_active = not user.is_active
        user.save()
        
        action_type = 'unblock' if user.is_active else 'block'
        log_user_activity(
            user=user,
            action_type=action_type,
            description=f'Пользователь {"разблокирован" if user.is_active else "заблокирован"}',
            request=request
        )
        
        return Response(AdminUserSerializer(user).data)
    
    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        """Сброс пароля пользователя"""
        if not request.user.is_staff:
            raise PermissionDenied('Только администраторы могут сбрасывать пароли')
        
        user = self.get_object()
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        password = serializer.validated_data['password']
        user.set_password(password)
        user.save()
        
        log_user_activity(
            user=user,
            action_type='password_reset',
            description='Пароль пользователя сброшен',
            request=request
        )
        
        return Response({'message': 'Пароль успешно изменен'}, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['post'], url_path='bulk-action')
    def bulk_action(self, request):
        """Массовые операции над пользователями"""
        if not request.user.is_staff:
            raise PermissionDenied('Только администраторы могут выполнять массовые операции')
        
        serializer = BulkActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user_ids = serializer.validated_data['user_ids']
        action = serializer.validated_data['action']
        
        # Нельзя выполнять действия над самим собой
        if request.user.id in user_ids:
            return Response(
                {'error': 'Нельзя выполнять действие над самим собой'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        users = User.objects.filter(id__in=user_ids, is_staff=True)
        
        if action == 'block':
            users.update(is_active=False)
            for user in users:
                log_user_activity(
                    user=user,
                    action_type='block',
                    description='Пользователь заблокирован (массовая операция)',
                    request=request
                )
            return Response({'message': f'{users.count()} пользователей заблокировано'})
        
        elif action == 'unblock':
            users.update(is_active=True)
            for user in users:
                log_user_activity(
                    user=user,
                    action_type='unblock',
                    description='Пользователь разблокирован (массовая операция)',
                    request=request
                )
            return Response({'message': f'{users.count()} пользователей разблокировано'})
        
        elif action == 'delete':
            count = users.count()
            for user in users:
                log_user_activity(
                    user=user,
                    action_type='delete',
                    description='Пользователь удален (массовая операция)',
                    request=request
                )
            users.delete()
            return Response({'message': f'{count} пользователей удалено'})
    
    @action(detail=True, methods=['get'], url_path='activity-log')
    def activity_log(self, request, pk=None):
        """История активности пользователя"""
        if not request.user.is_staff:
            raise PermissionDenied('Только администраторы могут просматривать историю активности')
        
        user = self.get_object()
        logs = UserActivityLog.objects.filter(user=user).order_by('-created_at')[:50]
        
        serializer = UserActivityLogSerializer(logs, many=True)
        return Response(serializer.data)

