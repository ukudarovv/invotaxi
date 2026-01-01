# Руководство по интеграции Flutter с Backend

## Обзор

Это руководство поможет интегрировать Flutter приложение с Django backend.

## 1. Настройка HTTP клиента

### Установка зависимостей

Добавьте в `pubspec.yaml`:

```yaml
dependencies:
  http: ^1.1.0
  dio: ^5.4.0  # Альтернатива http
  web_socket_channel: ^2.4.0
```

### Создание API клиента

Создайте файл `lib/services/api_client.dart`:

```dart
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiClient {
  static const String baseUrl = 'http://localhost:8000/api';
  late Dio _dio;
  
  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
    ));
    
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString('access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) {
        if (error.response?.statusCode == 401) {
          // Токен истек, нужно обновить
          _refreshToken();
        }
        return handler.next(error);
      },
    ));
  }
  
  Future<void> _refreshToken() async {
    // Логика обновления токена
  }
  
  // Auth methods
  Future<Response> requestOTP(String phone) async {
    return await _dio.post('/auth/phone-login/', data: {'phone': phone});
  }
  
  Future<Response> verifyOTP(String phone, String code) async {
    return await _dio.post('/auth/verify-otp/', data: {
      'phone': phone,
      'code': code,
    });
  }
  
  // Orders methods
  Future<Response> createOrder(Map<String, dynamic> orderData) async {
    return await _dio.post('/orders/', data: orderData);
  }
  
  Future<Response> getOrders({String? status, String? passengerId}) async {
    return await _dio.get('/orders/', queryParameters: {
      if (status != null) 'status': status,
      if (passengerId != null) 'passenger_id': passengerId,
    });
  }
  
  Future<Response> updateOrderStatus(String orderId, String status, {String? reason}) async {
    return await _dio.patch(
      '/orders/$orderId/status/',
      data: {'status': status, if (reason != null) 'reason': reason},
    );
  }
  
  // Driver methods
  Future<Response> updateDriverLocation(String driverId, double lat, double lon) async {
    return await _dio.patch(
      '/drivers/$driverId/location/',
      data: {'lat': lat, 'lon': lon},
    );
  }
  
  Future<Response> updateDriverOnlineStatus(String driverId, bool isOnline) async {
    return await _dio.patch(
      '/drivers/$driverId/online-status/',
      data: {'is_online': isOnline},
    );
  }
}
```

## 2. Замена MockDB на API клиент

### Обновление Providers

В `lib/providers/orders_provider.dart`:

```dart
import 'package:flutter/foundation.dart';
import '../services/api_client.dart';
import '../models/order.dart';

class OrdersProvider extends ChangeNotifier {
  final ApiClient _api = ApiClient();
  List<Order> _orders = [];
  
  List<Order> get allOrders => List.unmodifiable(_orders);
  
  Future<void> loadOrders({String? passengerId}) async {
    try {
      final response = await _api.getOrders(passengerId: passengerId);
      _orders = (response.data as List)
          .map((json) => Order.fromJson(json))
          .toList();
      notifyListeners();
    } catch (e) {
      print('Error loading orders: $e');
    }
  }
  
  Future<void> addOrder(Order order) async {
    try {
      final response = await _api.createOrder(order.toJson());
      _orders.add(Order.fromJson(response.data));
      notifyListeners();
    } catch (e) {
      print('Error creating order: $e');
    }
  }
  
  Future<void> updateOrderStatus(String orderId, String status) async {
    try {
      await _api.updateOrderStatus(orderId, status);
      await loadOrders();
    } catch (e) {
      print('Error updating order: $e');
    }
  }
}
```

## 3. WebSocket интеграция

Создайте `lib/services/websocket_service.dart`:

```dart
import 'package:web_socket_channel/web_socket_channel.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class WebSocketService {
  static const String baseUrl = 'ws://localhost:8000/ws';
  WebSocketChannel? _channel;
  
  Stream<Map<String, dynamic>>? connectToOrder(String orderId) async* {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');
    
    final uri = Uri.parse('$baseUrl/orders/$orderId/');
    _channel = WebSocketChannel.connect(uri.replace(
      queryParameters: {'token': token},
    ));
    
    yield* _channel!.stream.map((data) {
      return json.decode(data) as Map<String, dynamic>;
    });
  }
  
  Stream<Map<String, dynamic>>? connectToDriver(String driverId) async* {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');
    
    final uri = Uri.parse('$baseUrl/drivers/$driverId/');
    _channel = WebSocketChannel.connect(uri.replace(
      queryParameters: {'token': token},
    ));
    
    yield* _channel!.stream.map((data) {
      return json.decode(data) as Map<String, dynamic>;
    });
  }
  
  void disconnect() {
    _channel?.sink.close();
  }
}
```

## 4. Обновление моделей

Добавьте методы `fromJson` и `toJson` в модели:

```dart
// lib/models/order.dart
class Order {
  // ... existing code ...
  
  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id'],
      passengerId: json['passenger']['id'].toString(),
      driverId: json['driver']?['id']?.toString(),
      pickupTitle: json['pickup_title'],
      dropoffTitle: json['dropoff_title'],
      pickupCoordinate: Coordinate(
        lat: json['pickup_lat'],
        lon: json['pickup_lon'],
      ),
      dropoffCoordinate: Coordinate(
        lat: json['dropoff_lat'],
        lon: json['dropoff_lon'],
      ),
      desiredPickupTime: DateTime.parse(json['desired_pickup_time']),
      hasCompanion: json['has_companion'] ?? false,
      note: json['note'],
      status: OrderStatus.values.firstWhere(
        (e) => e.name == json['status'],
        orElse: () => OrderStatus.draft,
      ),
      createdAt: DateTime.parse(json['created_at']),
      assignedAt: json['assigned_at'] != null 
          ? DateTime.parse(json['assigned_at']) 
          : null,
      completedAt: json['completed_at'] != null 
          ? DateTime.parse(json['completed_at']) 
          : null,
      assignmentReason: json['assignment_reason'],
      rejectionReason: json['rejection_reason'],
      videoRecording: json['video_recording'],
      uploadStarted: json['upload_started'],
    );
  }
  
  Map<String, dynamic> toJson() {
    return {
      'pickup_title': pickupTitle,
      'dropoff_title': dropoffTitle,
      'pickup_lat': pickupCoordinate.lat,
      'pickup_lon': pickupCoordinate.lon,
      'dropoff_lat': dropoffCoordinate.lat,
      'dropoff_lon': dropoffCoordinate.lon,
      'desired_pickup_time': desiredPickupTime.toIso8601String(),
      'has_companion': hasCompanion,
      'note': note,
    };
  }
}
```

## 5. Обновление аутентификации

В `lib/screens/passenger/passenger_otp_screen.dart`:

```dart
final api = ApiClient();

// Запрос OTP
await api.requestOTP(phone);

// Проверка OTP
final response = await api.verifyOTP(phone, code);
final prefs = await SharedPreferences.getInstance();
await prefs.setString('access_token', response.data['access']);
await prefs.setString('refresh_token', response.data['refresh']);
await prefs.setString('passenger_id', response.data['passenger_id'].toString());
```

## 6. Обновление Location Service

В `lib/services/mock_location_engine.dart` (или реальный location service):

```dart
class LocationService {
  final ApiClient _api = ApiClient();
  Timer? _locationTimer;
  
  void startLocationUpdates(String driverId) {
    _locationTimer = Timer.periodic(Duration(seconds: 10), (timer) async {
      final position = await Geolocator.getCurrentPosition();
      await _api.updateDriverLocation(
        driverId,
        position.latitude,
        position.longitude,
      );
    });
  }
  
  void stopLocationUpdates() {
    _locationTimer?.cancel();
  }
}
```

## 7. Обработка ошибок

Создайте `lib/utils/error_handler.dart`:

```dart
class ErrorHandler {
  static String getErrorMessage(dynamic error) {
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
          return 'Таймаут подключения';
        case DioExceptionType.receiveTimeout:
          return 'Таймаут получения данных';
        case DioExceptionType.badResponse:
          return error.response?.data['error'] ?? 'Ошибка сервера';
        default:
          return 'Ошибка сети';
      }
    }
    return 'Неизвестная ошибка';
  }
}
```

## 8. Тестирование

1. Запустите backend: `python manage.py runserver`
2. Обновите baseUrl в ApiClient на реальный адрес
3. Протестируйте все endpoints
4. Проверьте WebSocket подключения

## Полезные ссылки

- Django REST Framework: https://www.django-rest-framework.org/
- Dio package: https://pub.dev/packages/dio
- WebSocket Channel: https://pub.dev/packages/web_socket_channel

