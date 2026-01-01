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

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTAuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})

