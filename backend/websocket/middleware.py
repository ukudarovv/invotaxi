"""
WebSocket middleware для JWT аутентификации
"""
import logging
from urllib.parse import parse_qs
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from channels.auth import AuthMiddlewareStack
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

logger = logging.getLogger(__name__)
User = get_user_model()


@database_sync_to_async
def get_user_from_token(token_string):
    """Получает пользователя из JWT токена"""
    try:
        access_token = AccessToken(token_string)
        user_id = access_token.get('user_id')
        if user_id:
            try:
                user = User.objects.get(id=user_id)
                logger.info(f"WebSocket: User {user_id} authenticated successfully")
                return user
            except User.DoesNotExist:
                logger.warning(f"WebSocket: User {user_id} not found")
                return AnonymousUser()
        logger.warning("WebSocket: No user_id in token")
        return AnonymousUser()
    except (InvalidToken, TokenError) as e:
        logger.warning(f"WebSocket: Invalid token - {str(e)}")
        return AnonymousUser()
    except Exception as e:
        logger.error(f"WebSocket: Error authenticating - {str(e)}")
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Middleware для аутентификации WebSocket соединений через JWT токен
    """
    
    async def __call__(self, scope, receive, send):
        # Извлекаем токен из query string
        query_string = scope.get('query_string', b'').decode()
        query_params = parse_qs(query_string)
        token = query_params.get('token', [None])[0]
        
        # Логируем попытку подключения
        path = scope.get('path', 'unknown')
        logger.info(f"WebSocket connection attempt to {path}, token present: {token is not None}")
        
        # Если токен есть, пытаемся аутентифицировать пользователя
        if token:
            scope['user'] = await get_user_from_token(token)
        else:
            logger.warning(f"WebSocket: No token provided for {path}")
            scope['user'] = AnonymousUser()
        
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    """Stack middleware для JWT аутентификации"""
    return JWTAuthMiddleware(AuthMiddlewareStack(inner))

