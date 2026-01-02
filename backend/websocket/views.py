"""
WebSocket health check and diagnostic views
"""
from django.http import JsonResponse
from django.conf import settings
from channels.layers import get_channel_layer
import logging

logger = logging.getLogger(__name__)


def websocket_health(request):
    """
    Health check endpoint for WebSocket configuration
    
    Returns:
        - Server status
        - ASGI application status
        - WebSocket routing status
        - Channels configuration status
    """
    health_data = {
        'status': 'ok',
        'server_type': 'unknown',
        'asgi_application': False,
        'websocket_routing': False,
        'channels_configured': False,
        'channel_layer': None,
        'websocket_endpoints': [],
        'recommendations': []
    }
    
    # Check if ASGI application is configured
    try:
        asgi_app = getattr(settings, 'ASGI_APPLICATION', None)
        if asgi_app:
            health_data['asgi_application'] = True
            health_data['asgi_application_path'] = asgi_app
        else:
            health_data['recommendations'].append(
                'ASGI_APPLICATION is not set in settings.py'
            )
    except Exception as e:
        logger.error(f"Error checking ASGI application: {e}")
        health_data['recommendations'].append(f'Error checking ASGI: {str(e)}')
    
    # Check Channels configuration
    try:
        channel_layers = getattr(settings, 'CHANNEL_LAYERS', None)
        if channel_layers:
            health_data['channels_configured'] = True
            health_data['channel_layer'] = channel_layers.get('default', {}).get('BACKEND', 'unknown')
        else:
            health_data['recommendations'].append(
                'CHANNEL_LAYERS is not configured in settings.py'
            )
    except Exception as e:
        logger.error(f"Error checking Channels configuration: {e}")
        health_data['recommendations'].append(f'Error checking Channels: {str(e)}')
    
    # Check WebSocket routing
    try:
        from websocket.routing import websocket_urlpatterns
        if websocket_urlpatterns:
            health_data['websocket_routing'] = True
            # Extract endpoint paths
            for pattern in websocket_urlpatterns:
                pattern_str = str(pattern.pattern)
                health_data['websocket_endpoints'].append(pattern_str)
        else:
            health_data['recommendations'].append(
                'No WebSocket URL patterns found'
            )
    except Exception as e:
        logger.error(f"Error checking WebSocket routing: {e}")
        health_data['recommendations'].append(f'Error checking routing: {str(e)}')
    
    # Check if channel layer is working
    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            health_data['channel_layer_available'] = True
        else:
            health_data['recommendations'].append(
                'Channel layer is not available. Make sure Channels is properly configured.'
            )
    except Exception as e:
        logger.warning(f"Channel layer not available: {e}")
        health_data['recommendations'].append(
            f'Channel layer error: {str(e)}'
        )
    
    # Determine server type recommendation
    if not health_data['asgi_application']:
        health_data['recommendations'].append(
            'Server must be run with daphne, not runserver. Use: daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application'
        )
    elif health_data['channels_configured'] and health_data['websocket_routing']:
        health_data['recommendations'].append(
            'Configuration looks good. Make sure server is running with daphne.'
        )
    
    # Set overall status
    if not health_data['asgi_application'] or not health_data['channels_configured']:
        health_data['status'] = 'error'
    elif health_data['recommendations']:
        health_data['status'] = 'warning'
    
    return JsonResponse(health_data)

