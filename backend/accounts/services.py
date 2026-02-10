import random
import string
from datetime import timedelta
from typing import Tuple, Optional
from django.utils import timezone
from django.conf import settings
from .models import OTPCode, User, Passenger, Driver
from regions.models import Region


class OTPService:
    """Сервис для работы с OTP кодами"""

    @staticmethod
    def generate_code(length: int = None) -> str:
        """Генерирует OTP код"""
        if length is None:
            length = getattr(settings, 'OTP_LENGTH', 6)
        return ''.join(random.choices(string.digits, k=length))

    @staticmethod
    def create_otp(phone: str) -> OTPCode:
        """Создает новый OTP код для телефона"""
        # Удаляем старые неиспользованные коды для этого телефона
        OTPCode.objects.filter(phone=phone, is_used=False).delete()

        code = OTPService.generate_code()
        expiry_minutes = getattr(settings, 'OTP_EXPIRY_MINUTES', 5)
        expires_at = timezone.now() + timedelta(minutes=expiry_minutes)

        otp = OTPCode.objects.create(
            phone=phone,
            code=code,
            expires_at=expires_at
        )

        # В реальном приложении здесь должна быть отправка SMS
        # Для разработки просто выводим в консоль
        print(f'OTP для {phone}: {code}')

        return otp

    @staticmethod
    def verify_otp(phone: str, code: str) -> Tuple[bool, Optional[OTPCode]]:
        """
        Проверяет OTP код
        Возвращает (is_valid, otp_object)
        """
        try:
            otp = OTPCode.objects.get(
                phone=phone,
                code=code,
                is_used=False
            )

            if timezone.now() > otp.expires_at:
                return False, None

            otp.is_used = True
            otp.save()

            return True, otp
        except OTPCode.DoesNotExist:
            return False, None

    @staticmethod
    def get_or_create_user(phone: str) -> Tuple[User, bool]:
        """
        Получает или создает пользователя по телефону
        Возвращает (user, created)
        """
        try:
            user = User.objects.get(phone=phone)
            return user, False
        except User.DoesNotExist:
            # Создаем нового пользователя
            username = f'user_{phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")}'
            user = User.objects.create_user(
                username=username,
                phone=phone,
                role='passenger'  # По умолчанию пассажир
            )
            return user, True


class UserService:
    """Сервис для работы с пользователями"""

    @staticmethod
    def get_user_role(user: User) -> str:
        """Определяет роль пользователя"""
        if hasattr(user, 'passenger'):
            return 'passenger'
        elif hasattr(user, 'driver'):
            return 'driver'
        elif user.is_staff or user.role == 'admin':
            return 'admin'
        return user.role

    @staticmethod
    def get_passenger_by_phone(phone: str) -> Optional[Passenger]:
        """Получает пассажира по телефону"""
        try:
            user = User.objects.get(phone=phone)
            if hasattr(user, 'passenger'):
                return user.passenger
            return None
        except User.DoesNotExist:
            return None

    @staticmethod
    def get_driver_by_phone(phone: str) -> Optional[Driver]:
        """Получает водителя по телефону"""
        try:
            user = User.objects.get(phone=phone)
            if hasattr(user, 'driver'):
                return user.driver
            return None
        except User.DoesNotExist:
            return None

