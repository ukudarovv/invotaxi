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
        # Проверяем тип протокола
        protocol_type = scope.get('type', 'unknown')
        path = scope.get('path', 'unknown')
        
        # Выводим в консоль для немедленного отображения
        print(f"[JWTAuthMiddleware] Protocol type: {protocol_type}, Path: {path}")
        logger.info(f"JWTAuthMiddleware: Protocol type: {protocol_type}, Path: {path}")
        logger.info(f"JWTAuthMiddleware: Scope keys: {list(scope.keys())}")
        
        # Логируем полную информацию о scope для диагностики
        if protocol_type == 'websocket':
            logger.info(f"WebSocket upgrade attempt:")
            logger.info(f"  - Path: {path}")
            logger.info(f"  - Headers: {dict(scope.get('headers', []))}")
            logger.info(f"  - Query string: {scope.get('query_string', b'').decode()}")
            logger.info(f"  - Client: {scope.get('client', 'unknown')}")
            logger.info(f"  - Server: {scope.get('server', 'unknown')}")
        
        # Извлекаем токен из query string
        query_string = scope.get('query_string', b'').decode()
        query_params = parse_qs(query_string)
        token = query_params.get('token', [None])[0]
        
        # Логируем попытку подключения
        print(f"[JWTAuthMiddleware] WebSocket connection attempt to {path}, token present: {token is not None}")
        logger.info(f"WebSocket connection attempt to {path}, token present: {token is not None}")
        
        # Если токен есть, пытаемся аутентифицировать пользователя
        if token:
            try:
                scope['user'] = await get_user_from_token(token)
                user = scope['user']
                is_authenticated = user.is_authenticated if hasattr(user, 'is_authenticated') else False
                user_id = getattr(user, 'id', None)
                username = getattr(user, 'username', None)
                
                print(f"[JWTAuthMiddleware] User authenticated: {is_authenticated}, User ID: {user_id}, Username: {username}")
                logger.info(f"WebSocket authentication result: authenticated={is_authenticated}, user_id={user_id}, username={username}")
                
                if not is_authenticated:
                    logger.warning(f"WebSocket: Token provided but authentication failed for path {path}")
            except Exception as e:
                logger.error(f"WebSocket: Error during authentication: {str(e)}", exc_info=True)
                scope['user'] = AnonymousUser()
        else:
            logger.warning(f"WebSocket: No token provided for {path}")
            print(f"[JWTAuthMiddleware] No token provided for {path}")
            scope['user'] = AnonymousUser()
        
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    """Stack middleware для JWT аутентификации"""
    return JWTAuthMiddleware(AuthMiddlewareStack(inner))

