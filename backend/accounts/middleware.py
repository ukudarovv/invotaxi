"""
Middleware для логирования и обработки запросов
"""
import logging
import time
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(MiddlewareMixin):
    """Логирование всех запросов"""
    
    def process_request(self, request):
        request.start_time = time.time()
    
    def process_response(self, request, response):
        if hasattr(request, 'start_time'):
            duration = time.time() - request.start_time
            logger.info(
                f'{request.method} {request.path} - '
                f'Status: {response.status_code} - '
                f'Duration: {duration:.3f}s'
            )
        return response

