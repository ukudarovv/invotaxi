"""
ASGI config for invo_backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.0/howto/deployment/asgi/
"""

import os

# Устанавливаем DJANGO_SETTINGS_MODULE ПЕРЕД всеми импортами Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'invo_backend.settings')

# Импортируем Django приложение ПЕРЕД импортом channels
from django.core.asgi import get_asgi_application
django_asgi_app = get_asgi_application()

# Теперь импортируем channels и websocket routing
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from websocket.routing import websocket_urlpatterns
from websocket.middleware import JWTAuthMiddlewareStack

import logging
logger = logging.getLogger(__name__)

# Настраиваем логирование для ASGI
logging.basicConfig(level=logging.INFO)

# Создаем ProtocolTypeRouter с логированием
class LoggingProtocolTypeRouter(ProtocolTypeRouter):
    """ProtocolTypeRouter с логированием для диагностики"""
    
    async def __call__(self, scope, receive, send):
        protocol_type = scope.get('type', 'unknown')
        path = scope.get('path', 'unknown')
        
        # Выводим в консоль для немедленного отображения
        print(f"[ASGI] Protocol type: {protocol_type}, Path: {path}")
        logger.info(f"ASGI ProtocolTypeRouter: Protocol type: {protocol_type}, Path: {path}")
        
        if protocol_type == 'websocket':
            print(f"[ASGI] WebSocket connection attempt to: {path}")
            logger.info(f"WebSocket connection attempt to: {path}")
            logger.info(f"WebSocket scope keys: {list(scope.keys())}")
        elif protocol_type == 'http':
            print(f"[ASGI] HTTP request to: {path}")
            if path.startswith('/ws/'):
                print(f"[ASGI] WARNING: WebSocket path {path} is being handled as HTTP!")
                print(f"[ASGI] This means the server is not recognizing WebSocket upgrade request")
        
        return await super().__call__(scope, receive, send)

application = LoggingProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTAuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})

print("[ASGI] Application initialized")
print(f"[ASGI] WebSocket patterns: {len(websocket_urlpatterns)}")
for pattern in websocket_urlpatterns:
    print(f"[ASGI]   - {pattern.pattern}")

