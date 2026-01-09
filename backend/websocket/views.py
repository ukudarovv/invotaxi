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
        import re
        if websocket_urlpatterns:
            health_data['websocket_routing'] = True
            # Extract endpoint paths and convert regex patterns to readable URLs
            for pattern in websocket_urlpatterns:
                pattern_str = str(pattern.pattern)
                # Convert regex pattern to readable URL
                # Remove ^ and $ anchors
                url_path = pattern_str.replace('^', '').replace('$', '')
                # Convert named groups to readable format
                url_path = re.sub(r'\(\?P<[^>]+>[^)]+\)', '{param}', url_path)
                # Remove regex special characters that aren't needed
                url_path = url_path.replace('\\', '')
                health_data['websocket_endpoints'].append(url_path)
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
    
    # Try to determine server type
    try:
        import sys
        # Check if running under daphne (ASGI server)
        # Daphne sets certain environment variables or we can check process name
        server_software = request.META.get('SERVER_SOFTWARE', '')
        if 'daphne' in server_software.lower() or 'asgi' in server_software.lower():
            health_data['server_type'] = 'daphne'
        elif 'runserver' in server_software.lower() or 'wsgiref' in server_software.lower():
            health_data['server_type'] = 'runserver'
            health_data['recommendations'].append(
                '⚠️ WARNING: Server appears to be running with runserver. WebSocket will NOT work!'
            )
            health_data['recommendations'].append(
                'Use daphne instead: daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application'
            )
        else:
            # Server type unknown - provide general recommendations
            health_data['server_type'] = 'unknown'
            health_data['recommendations'].append(
                'Could not determine server type from headers. Check server logs for "[ASGI]" messages.'
            )
            health_data['recommendations'].append(
                'If you see "Protocol type: http" for /ws/ paths, server is running with runserver.'
            )
            health_data['recommendations'].append(
                'If you see "[ASGI] Protocol type: websocket", server is running with daphne.'
            )
            # Add note that WebSocket test is the definitive check
            health_data['recommendations'].append(
                '💡 Tip: Try connecting to ws://localhost:8000/ws/test/ - if it fails, server is likely runserver.'
            )
            # Add diagnostic info
            health_data['diagnostic_info'] = {
                'server_software': server_software,
                'note': 'If ASGI and Channels are configured correctly, try WebSocket test endpoint to verify server type.'
            }
    except Exception as e:
        logger.warning(f"Could not determine server type: {e}")
        health_data['server_type'] = 'unknown'
    
    # Determine server type recommendation
    if not health_data['asgi_application']:
        health_data['recommendations'].append(
            '❌ ASGI_APPLICATION not configured. Server must be run with daphne, not runserver.'
        )
        health_data['recommendations'].append(
            'Use: daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application'
        )
    elif health_data['channels_configured'] and health_data['websocket_routing']:
        if health_data['server_type'] == 'daphne':
            health_data['recommendations'].append(
                '✅ Configuration looks good. Server is running with daphne.'
            )
        elif health_data['server_type'] == 'runserver':
            health_data['recommendations'].append(
                '⚠️ Configuration is correct, but server is running with runserver. WebSocket will NOT work!'
            )
            health_data['recommendations'].append(
                'Stop runserver and use: daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application'
            )
        else:
            health_data['recommendations'].append(
                '✅ Configuration looks good. Make sure server is running with daphne for WebSocket support.'
            )
    
    # Add WebSocket test endpoint info
    health_data['websocket_test_endpoint'] = 'ws://localhost:8000/ws/test/'
    health_data['websocket_test_info'] = (
        'Test WebSocket endpoint without authentication. '
        'If connection fails, server is likely running with runserver instead of daphne.'
    )
    
    # Set overall status
    if not health_data['asgi_application'] or not health_data['channels_configured']:
        health_data['status'] = 'error'
    elif health_data['server_type'] == 'runserver':
        health_data['status'] = 'error'
    elif health_data['recommendations']:
        health_data['status'] = 'warning'
    
    return JsonResponse(health_data)

