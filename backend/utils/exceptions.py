"""
Кастомные исключения
"""
from rest_framework.exceptions import APIException
from rest_framework import status


class OrderNotFoundError(APIException):
    """Заказ не найден"""
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'Заказ не найден'
    default_code = 'order_not_found'


class InvalidOrderStatusError(APIException):
    """Недопустимый статус заказа"""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Недопустимый статус заказа'
    default_code = 'invalid_order_status'


class DriverNotFoundError(APIException):
    """Водитель не найден"""
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'Водитель не найден'
    default_code = 'driver_not_found'


class PassengerNotFoundError(APIException):
    """Пассажир не найден"""
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'Пассажир не найден'
    default_code = 'passenger_not_found'


class NoAvailableDriversError(APIException):
    """Нет доступных водителей"""
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Нет доступных водителей'
    default_code = 'no_available_drivers'


class InvalidOTPError(APIException):
    """Неверный OTP код"""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Неверный или истекший OTP код'
    default_code = 'invalid_otp'

