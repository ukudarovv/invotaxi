"""
WebSocket diagnostic script for testing connectivity

Usage:
    python test_websocket.py [base_url] [jwt_token]

Requirements:
    pip install websockets requests

Example:
    python test_websocket.py
    python test_websocket.py http://localhost:8000
    python test_websocket.py http://localhost:8000 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
"""
import asyncio
import json
import sys
from urllib.parse import urlparse

# Check for required dependencies
try:
    import websockets
except ImportError:
    print("❌ Missing dependency: websockets")
    print("Install with: pip install websockets")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("❌ Missing dependency: requests")
    print("Install with: pip install requests")
    sys.exit(1)


def test_http_server(base_url='http://localhost:8000'):
    """Test if HTTP server is running"""
    print("=" * 60)
    print("1. Testing HTTP Server")
    print("=" * 60)
    
    try:
        response = requests.get(f"{base_url}/admin/", timeout=5)
        print(f"✅ HTTP server is running (status: {response.status_code})")
        return True
    except requests.exceptions.ConnectionError:
        print("❌ HTTP server is not running")
        print(f"   Make sure server is running on {base_url}")
        return False
    except Exception as e:
        print(f"❌ Error checking HTTP server: {e}")
        return False


def test_websocket_health(base_url='http://localhost:8000'):
    """Test WebSocket health endpoint"""
    print("\n" + "=" * 60)
    print("2. Testing WebSocket Health Endpoint")
    print("=" * 60)
    
    try:
        response = requests.get(f"{base_url}/api/websocket/health/", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health endpoint responded (status: {data.get('status', 'unknown')})")
            print(f"   ASGI Application: {data.get('asgi_application', False)}")
            print(f"   Channels Configured: {data.get('channels_configured', False)}")
            print(f"   WebSocket Routing: {data.get('websocket_routing', False)}")
            print(f"   Channel Layer: {data.get('channel_layer', 'unknown')}")
            
            if data.get('recommendations'):
                print("\n   Recommendations:")
                for rec in data['recommendations']:
                    print(f"     - {rec}")
            
            return data.get('status') == 'ok'
        else:
            print(f"❌ Health endpoint returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to health endpoint")
        return False
    except Exception as e:
        print(f"❌ Error checking health endpoint: {e}")
        return False


async def test_basic_websocket(base_url='ws://localhost:8000'):
    """Test basic WebSocket connection without authentication"""
    print("\n" + "=" * 60)
    print("3. Testing Basic WebSocket Connection")
    print("=" * 60)
    
    test_url = f"{base_url}/ws/test/"
    print(f"Connecting to: {test_url}")
    
    try:
        async with websockets.connect(test_url) as websocket:
            print("✅ Basic WebSocket connection successful")
            
            # Wait for test message
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=5)
                data = json.loads(message)
                print(f"   Received test message: {data.get('type', 'unknown')}")
                return True
            except asyncio.TimeoutError:
                print("   ⚠️  No message received (connection still works)")
                return True
    except websockets.exceptions.InvalidStatusCode as e:
        print(f"❌ WebSocket connection failed: {e}")
        print("   This usually means the server is not running with daphne")
        print("   Use: daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application")
        return False
    except ConnectionRefusedError:
        print("❌ Connection refused - server may not be running")
        return False
    except Exception as e:
        print(f"❌ WebSocket connection error: {e}")
        return False


async def test_authenticated_websocket(token, base_url='ws://localhost:8000'):
    """Test authenticated WebSocket connection"""
    print("\n" + "=" * 60)
    print("4. Testing Authenticated WebSocket Connection")
    print("=" * 60)
    
    if not token:
        print("⚠️  Skipping authenticated test - no token provided")
        print("   To test authenticated connection, provide a JWT token")
        return None
    
    test_url = f"{base_url}/ws/dispatch-map/?token={token}"
    print(f"Connecting to: {test_url.replace(token, '***')}")
    
    try:
        async with websockets.connect(test_url) as websocket:
            print("✅ Authenticated WebSocket connection successful")
            print("   User is authenticated and authorized")
            return True
    except websockets.exceptions.InvalidStatusCode as e:
        status_code = e.status_code
        if status_code == 4001:
            print("❌ Authentication failed (401 Unauthorized)")
            print("   - Token may be invalid or expired")
            print("   - Check token validity")
        elif status_code == 4003:
            print("❌ Authorization failed (403 Forbidden)")
            print("   - User is not staff/admin")
            print("   - Only staff/admin users can access dispatch-map")
        else:
            print(f"❌ WebSocket connection failed: {e}")
        return False
    except ConnectionRefusedError:
        print("❌ Connection refused - server may not be running")
        return False
    except Exception as e:
        print(f"❌ WebSocket connection error: {e}")
        return False


def main():
    """Run all diagnostic tests"""
    print("\n" + "=" * 60)
    print("WebSocket Diagnostic Tool")
    print("=" * 60)
    print()
    
    # Parse command line arguments
    base_url = 'http://localhost:8000'
    ws_base_url = 'ws://localhost:8000'
    token = None
    
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
        # Convert http to ws
        parsed = urlparse(base_url)
        ws_base_url = f"{'wss' if parsed.scheme == 'https' else 'ws'}://{parsed.netloc}"
    
    if len(sys.argv) > 2:
        token = sys.argv[2]
    
    # Run tests
    http_ok = test_http_server(base_url)
    
    if not http_ok:
        print("\n❌ Cannot proceed - HTTP server is not running")
        print("\nTo start the server:")
        print("  cd backend")
        print("  venv\\Scripts\\activate.bat  # Windows")
        print("  daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application")
        return
    
    health_ok = test_websocket_health(base_url)
    
    # Test WebSocket connections
    basic_ok = asyncio.run(test_basic_websocket(ws_base_url))
    
    if token:
        auth_result = asyncio.run(test_authenticated_websocket(token, ws_base_url))
    else:
        auth_result = None
    
    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"HTTP Server: {'✅ OK' if http_ok else '❌ FAILED'}")
    print(f"WebSocket Health: {'✅ OK' if health_ok else '❌ FAILED'}")
    print(f"Basic WebSocket: {'✅ OK' if basic_ok else '❌ FAILED'}")
    if auth_result is not None:
        print(f"Authenticated WebSocket: {'✅ OK' if auth_result else '❌ FAILED'}")
    else:
        print("Authenticated WebSocket: ⚠️  SKIPPED (no token)")
    
    print("\n" + "=" * 60)
    
    if not basic_ok:
        print("\n⚠️  Basic WebSocket test failed!")
        print("This usually means:")
        print("  1. Server is not running with daphne")
        print("  2. Server is not running at all")
        print("  3. WebSocket routing is not configured")
        print("\nSolution:")
        print("  cd backend")
        print("  venv\\Scripts\\activate.bat  # Windows")
        print("  daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()

