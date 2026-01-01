from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from .models import Passenger, Driver
from .serializers import (
    UserSerializer, PassengerSerializer, DriverSerializer,
    PhoneLoginSerializer, VerifyOTPSerializer
)
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

    def get_queryset(self):
        user = self.request.user
        # Водители могут видеть только свой профиль
        if hasattr(user, 'driver'):
            return Driver.objects.filter(id=user.driver.id)
        # Админы могут видеть всех
        return super().get_queryset()

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

        driver.is_online = bool(is_online)
        driver.save()

        return Response(DriverSerializer(driver).data)

