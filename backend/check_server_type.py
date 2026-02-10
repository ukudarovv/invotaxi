#!/usr/bin/env python
"""
Скрипт для проверки типа сервера (daphne или runserver)
Помогает диагностировать проблемы с WebSocket подключением
"""
import sys
import requests
import json

def test_websocket_connection(ws_url, timeout=3):
    """Пытается подключиться к WebSocket endpoint для определения типа сервера"""
    try:
        import websockets
        import asyncio
        
        async def test_ws():
            try:
                async with websockets.connect(ws_url, timeout=timeout) as ws:
                    # Если подключение успешно, сервер запущен через daphne
                    return True
            except Exception as e:
                # Если подключение не удалось, вероятно runserver
                return False
        
        return asyncio.run(test_ws())
    except ImportError:
        # websockets не установлен, пропускаем тест
        return None
    except Exception as e:
        return False

def test_websocket_via_http(base_url='http://localhost:8000'):
    """Альтернативный метод: проверяет, обрабатывается ли /ws/test/ как HTTP (признак runserver)"""
    try:
        # Пытаемся сделать HTTP GET запрос к WebSocket endpoint
        # Если runserver, он вернет 404 или обработает как HTTP
        # Если daphne, он может вернуть другой ответ или ошибку
        test_url = f'{base_url}/ws/test/'
        response = requests.get(test_url, timeout=2, allow_redirects=False)
        
        # Если получили 404 через HTTP, это признак runserver
        # Daphne обычно не обрабатывает WebSocket endpoints через HTTP
        if response.status_code == 404:
            # Проверяем заголовки ответа
            server_header = response.headers.get('Server', '')
            if 'WSGIServer' in server_header or 'runserver' in str(response.headers).lower():
                return False  # runserver
            # Может быть и daphne, но с неправильным endpoint
            return None
        return None
    except requests.exceptions.RequestException:
        # Если запрос не удался, не можем определить
        return None

def check_server_type(base_url='http://localhost:8000'):
    """Проверяет тип сервера через health endpoint"""
    try:
        health_url = f'{base_url}/api/websocket/health/'
        print(f"Проверка сервера: {health_url}")
        print("-" * 60)
        
        response = requests.get(health_url, timeout=5)
        
        if response.status_code != 200:
            print(f"❌ Ошибка: HTTP {response.status_code}")
            return False
        
        data = response.json()
        
        print(f"Статус: {data.get('status', 'unknown')}")
        print(f"Тип сервера: {data.get('server_type', 'unknown')}")
        print(f"ASGI приложение: {'✅' if data.get('asgi_application') else '❌'}")
        print(f"Channels настроен: {'✅' if data.get('channels_configured') else '❌'}")
        print(f"WebSocket routing: {'✅' if data.get('websocket_routing') else '❌'}")
        
        if data.get('websocket_endpoints'):
            print("\nДоступные WebSocket endpoints:")
            base_ws_url = base_url.replace('http://', 'ws://').replace('https://', 'wss://')
            for endpoint in data['websocket_endpoints']:
                # Ensure endpoint starts with /
                if not endpoint.startswith('/'):
                    endpoint = '/' + endpoint
                print(f"  - {base_ws_url}{endpoint}")
        
        if data.get('recommendations'):
            print("\nРекомендации:")
            for rec in data['recommendations']:
                print(f"  {rec}")
        
        # Определяем проблему
        server_type = data.get('server_type', 'unknown')
        
        # Если тип неизвестен, попробуем проверить через WebSocket подключение
        if server_type == 'unknown':
            print("\nПопытка определить тип сервера через WebSocket тест...")
            ws_test_url = data.get('websocket_test_endpoint', 'ws://localhost:8000/ws/test/')
            
            # Сначала пробуем через HTTP проверку (не требует дополнительных библиотек)
            http_test_result = test_websocket_via_http(base_url)
            if http_test_result is False:
                print("❌ HTTP проверка: /ws/test/ обрабатывается как HTTP GET (404) - это runserver!")
                server_type = 'runserver'
            else:
                # Если HTTP проверка не дала результата, пробуем реальное WebSocket подключение
                ws_result = test_websocket_connection(ws_test_url)
                
                if ws_result is True:
                    print("✅ WebSocket подключение успешно - сервер запущен через daphne!")
                    server_type = 'daphne'
                elif ws_result is False:
                    print("❌ WebSocket подключение не удалось - сервер запущен через runserver!")
                    server_type = 'runserver'
                else:
                    print("⚠️ Не удалось протестировать WebSocket подключение")
                    print("   Установите websockets для более точной проверки: pip install websockets")
                    print("   Или проверьте логи сервера вручную")
        
        if server_type == 'runserver':
            print("\n" + "=" * 60)
            print("❌ ПРОБЛЕМА: Сервер запущен через runserver!")
            print("WebSocket НЕ будет работать!")
            print("\n⚠️ ВНИМАНИЕ: Возможно запущены ДВА сервера одновременно!")
            print("   Проверьте все терминалы и остановите runserver.")
            print("\nРешение:")
            print("1. Найдите и остановите ВСЕ процессы runserver:")
            print("   - Проверьте все открытые терминалы")
            print("   - Найдите процесс с 'python manage.py runserver'")
            print("   - Нажмите Ctrl+C в терминале с runserver")
            print("2. Убедитесь, что запущен ТОЛЬКО daphne:")
            print("   Windows: START_SERVER.bat")
            print("   Linux/Mac: ./START_SERVER.sh")
            print("   Или вручную: daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application")
            print("3. Проверьте порт 8000: python check_port.py")
            print("\nПризнаки runserver в логах:")
            print('  - "Not Found: /ws/test/"')
            print('  - "GET /ws/test/ HTTP/1.1" 404')
            print('  - "Starting development server"')
            print("\nПризнаки daphne в логах:")
            print('  - "[ASGI] Application initialized"')
            print('  - "[ASGI] Protocol type: websocket"')
            print('  - "Listening on TCP address 0.0.0.0:8000"')
            print("=" * 60)
            return False
        elif server_type == 'daphne':
            print("\n" + "=" * 60)
            print("✅ Сервер запущен через daphne - WebSocket должен работать!")
            print("\nПризнаки daphne в логах:")
            print('  - "[ASGI] Application initialized"')
            print('  - "[ASGI] Protocol type: websocket"')
            print("=" * 60)
            return True
        else:
            print("\n" + "=" * 60)
            print("⚠️ Не удалось определить тип сервера")
            print("\nПроверьте логи сервера:")
            print("- Если видите '[ASGI] Application initialized' - сервер запущен через daphne")
            print("- Если видите 'Starting development server' - сервер запущен через runserver")
            print("- Если видите 'Not Found: /ws/test/' или 'GET /ws/test/ HTTP/1.1' 404 - это runserver")
            print("\nПопробуйте подключиться к WebSocket вручную:")
            print(f"  {data.get('websocket_test_endpoint', 'ws://localhost:8000/ws/test/')}")
            print("=" * 60)
            return None
        
    except requests.exceptions.ConnectionError:
        print("❌ Ошибка: Не удалось подключиться к серверу")
        print(f"Убедитесь, что сервер запущен на {base_url}")
        return False
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return False

if __name__ == '__main__':
    base_url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000'
    result = check_server_type(base_url)
    sys.exit(0 if result else 1)
