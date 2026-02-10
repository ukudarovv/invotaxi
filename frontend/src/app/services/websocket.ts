type WebSocketMessageHandler = (data: any) => void;

interface WebSocketHandlers {
  driver_location_update?: WebSocketMessageHandler;
  driver_status_update?: WebSocketMessageHandler;
  order_update?: WebSocketMessageHandler;
  order_created?: WebSocketMessageHandler;
  [key: string]: WebSocketMessageHandler | undefined;
}

class DispatchMapWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: WebSocketHandlers = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private pingInterval: number | null = null;
  private isConnecting = false;
  private isConnected = false;

  constructor() {
    // Определяем WebSocket URL на основе API_BASE_URL
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
    const wsProtocol = apiBaseUrl.startsWith('https') ? 'wss' : 'ws';
    // Убираем протокол и путь /api если есть
    let wsHost = apiBaseUrl.replace(/^https?:\/\//, '');
    // Убираем /api в конце если есть
    wsHost = wsHost.replace(/\/api\/?$/, '');
    // Убираем trailing slash
    wsHost = wsHost.replace(/\/$/, '');
    this.url = `${wsProtocol}://${wsHost}/ws/dispatch-map/`;
    console.log('WebSocket URL:', this.url);
  }

  /**
   * Проверка доступности сервера
   */
  private async checkServerAvailable(): Promise<boolean> {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
      const baseUrl = apiBaseUrl.replace(/\/api$/, '');
      
      // Пробуем несколько endpoints для проверки доступности
      const endpoints = [
        `${baseUrl}/admin/`,
        `${baseUrl}/api/`,
      ];
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { 
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache'
          });
          console.log('[WebSocket] Server availability check: OK');
          return true;
        } catch (e) {
          // Продолжаем проверку других endpoints
        }
      }
      
      console.warn('[WebSocket] Server availability check: Failed');
      return false;
    } catch (error) {
      console.warn('[WebSocket] Server availability check failed:', error);
      return false;
    }
  }
  
  /**
   * Получить статус подключения для отображения в UI
   */
  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      return 'connected';
    }
    if (this.isConnecting) {
      return 'connecting';
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return 'error';
    }
    return 'disconnected';
  }
  
  /**
   * Получить количество попыток переподключения
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Проверка базового WebSocket подключения (без авторизации)
   */
  private async testBasicConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
      const wsProtocol = apiBaseUrl.startsWith('https') ? 'wss' : 'ws';
      let wsHost = apiBaseUrl.replace(/^https?:\/\//, '');
      wsHost = wsHost.replace(/\/api\/?$/, '');
      wsHost = wsHost.replace(/\/$/, '');
      const testUrl = `${wsProtocol}://${wsHost}/ws/test/`;
      
      console.log('[WebSocket] Testing basic connection to:', testUrl);
      
      const testWs = new WebSocket(testUrl);
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          testWs.close();
          console.warn('[WebSocket] Basic connection test timeout');
          resolve(false);
        }
      }, 5000);
      
      testWs.onopen = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.log('[WebSocket] ✅ Basic connection test successful');
          testWs.close();
          resolve(true);
        }
      };
      
      testWs.onerror = (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error('[WebSocket] ❌ Basic connection test failed:', error);
          resolve(false);
        }
      };
      
      testWs.onclose = (event) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          if (event.code === 1000) {
            resolve(true); // Clean close after successful test
          } else {
            console.error('[WebSocket] Basic connection test closed with code:', event.code);
            resolve(false);
          }
        }
      };
    });
  }

  /**
   * Проверка здоровья WebSocket сервера через HTTP endpoint
   */
  private async checkWebSocketHealth(): Promise<{ status: string; recommendations: string[] } | null> {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
      const baseUrl = apiBaseUrl.replace(/\/api$/, '');
      const response = await fetch(`${baseUrl}/api/websocket/health/`);
      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      console.warn('[WebSocket] Health check failed:', error);
    }
    return null;
  }

  /**
   * Подключение к WebSocket
   */
  connect(): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      return Promise.resolve();
    }

    return new Promise(async (resolve, reject) => {
      this.isConnecting = true;

      try {
        // Получаем токен для авторизации
        const token = localStorage.getItem('accessToken');
        if (!token) {
          reject(new Error('No access token'));
          this.isConnecting = false;
          return;
        }

        // Проверяем доступность сервера
        const serverAvailable = await this.checkServerAvailable();
        if (!serverAvailable) {
          console.warn('Server might not be available. Continuing anyway...');
        }

        // Проверяем здоровье WebSocket конфигурации
        const health = await this.checkWebSocketHealth();
        if (health) {
          console.log('[WebSocket] Health check:', health.status);
          if (health.status === 'error' || health.recommendations?.length > 0) {
            console.warn('[WebSocket] Health check recommendations:');
            health.recommendations.forEach((rec: string) => {
              console.warn(`  - ${rec}`);
            });
          }
        }

        // Тестируем базовое подключение перед попыткой авторизованного подключения
        console.log('[WebSocket] Testing basic WebSocket connectivity...');
        const basicConnectionWorks = await this.testBasicConnection();
        
        if (!basicConnectionWorks) {
          const errorMsg = 'Basic WebSocket connection test failed. Server may not be running with daphne.';
          console.error(`[WebSocket] ${errorMsg}`);
          console.error('[WebSocket] Make sure server is running with: daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application');
          console.error('[WebSocket] Do NOT use: python manage.py runserver (it does not support WebSocket)');
          this.isConnecting = false;
          reject(new Error(errorMsg));
          return;
        }

        console.log('[WebSocket] Basic connection test passed, attempting authenticated connection...');

        // Создаем WebSocket соединение с токеном в query параметрах или заголовках
        // Django Channels использует cookies или query параметры для авторизации
        // В данном случае используем query параметр
        const wsUrl = `${this.url}?token=${encodeURIComponent(token)}`;
        console.log('Connecting to WebSocket:', wsUrl.replace(/token=[^&]+/, 'token=***'));
        console.log('Make sure server is running with: daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application');
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected to dispatch map');
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startPing();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            // Обрабатываем pong
            if (message.type === 'pong') {
              return;
            }

            // Вызываем соответствующий обработчик
            const handler = this.handlers[message.type];
            if (handler) {
              handler(message.data);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          console.error('WebSocket URL:', this.url);
          console.error('WebSocket readyState:', this.ws?.readyState);
          // WebSocket readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
          if (this.ws?.readyState === 3) {
            console.error('');
            console.error('❌ WebSocket connection failed');
            console.error('');
            console.error('🔍 TROUBLESHOOTING STEPS:');
            console.error('');
            console.error('1. Verify server is running with daphne (NOT runserver):');
            console.error('   cd backend');
            console.error('   venv\\Scripts\\activate.bat  # Windows');
            console.error('   daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application');
            console.error('');
            console.error('2. Check server logs for WebSocket connection attempts:');
            console.error('   You should see: [ASGI] Protocol type: websocket, Path: /ws/dispatch-map/');
            console.error('   If you see "Protocol type: http", the server is not recognizing WebSocket upgrade');
            console.error('');
            console.error('3. Check WebSocket health endpoint:');
            console.error('   Open: http://localhost:8000/api/websocket/health/');
            console.error('   This will show server configuration status');
            console.error('');
            console.error('4. Verify authentication:');
            console.error('   - Is the JWT token valid? (check expiration)');
            console.error('   - Is the user staff/admin? (required for dispatch-map)');
            console.error('   - Check server logs for authentication errors');
            console.error('');
            console.error('5. Test basic WebSocket connection:');
            console.error('   The connection test should have passed before this error.');
            console.error('   If basic test failed, WebSocket is not working at all.');
          }
          this.isConnecting = false;
          reject(error);
        };

        this.ws.onclose = (event) => {
          const closeCode = event.code;
          const closeReason = event.reason || 'No reason provided';
          const wasClean = event.wasClean;
          
          console.log('WebSocket disconnected', { 
            code: closeCode, 
            reason: closeReason, 
            wasClean,
            codeMeaning: this.getCloseCodeMeaning(closeCode)
          });
          
          this.isConnected = false;
          this.isConnecting = false;
          this.stopPing();

          // Обработка различных кодов закрытия
          if (closeCode === 4001) {
            console.error('WebSocket: Unauthorized - User is not authenticated');
            console.error('Please log in again');
            return; // Не переподключаемся при ошибке авторизации
          }
          
          if (closeCode === 4003) {
            console.error('WebSocket: Forbidden - User is not staff/admin');
            console.error('Only staff/admin users can access dispatch map');
            return; // Не переподключаемся при ошибке прав доступа
          }

          // Не пытаемся переподключаться если это была ошибка подключения (код 1006)
          if (closeCode === 1006 && this.reconnectAttempts === 0) {
            console.error('');
            console.error('❌ WebSocket connection failed (Abnormal Closure - Code 1006)');
            console.error('');
            console.error('Possible causes:');
            console.error('1. Server is not running with daphne');
            console.error('   → Use: daphne -b 0.0.0.0 -p 8000 invo_backend.asgi:application');
            console.error('   → Do NOT use: python manage.py runserver');
            console.error('');
            console.error('2. Server is not running at all');
            console.error('   → Check if backend server is running on port 8000');
            console.error('');
            console.error('3. Network/CORS blocking WebSocket connection');
            console.error('   → Check browser console for CORS errors');
            console.error('   → Verify CORS settings in Django settings.py');
            console.error('');
            console.error('4. Wrong WebSocket URL');
            console.error(`   → Current URL: ${this.url}`);
            console.error('   → Expected: ws://localhost:8000/ws/dispatch-map/');
            console.error('');
            console.error('5. User permissions');
            console.error('   → User must be staff/admin to access dispatch-map');
            console.error('   → Check user.is_staff in Django admin');
            console.error('');
            console.error('💡 TIP: Check http://localhost:8000/api/websocket/health/ for server status');
          }

          // Пытаемся переподключиться только для определенных кодов ошибок
          const shouldReconnect = closeCode === 1006 || closeCode === 1000 || closeCode === 1001;
          
          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            // Проверяем наличие токена перед попыткой переподключения
            const token = localStorage.getItem('accessToken');
            if (!token) {
              console.log('No access token available. Skipping reconnection.');
              return;
            }
            
            this.reconnectAttempts++;
            setTimeout(() => {
              console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
              this.connect().catch((error) => {
                // Не пытаемся переподключаться если нет токена
                if (error.message === 'No access token') {
                  console.log('No access token. Stopping reconnection attempts.');
                  return;
                }
                console.error('WebSocket reconnection error:', error);
              });
            }, this.reconnectDelay);
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            console.error('Please check:');
            console.error('- Is the server running with daphne?');
            console.error('- Is the WebSocket URL correct?');
            console.error('- Are there any firewall/CORS issues?');
            console.error('- Is the user staff/admin?');
          }
        };
      } catch (error: any) {
        this.isConnecting = false;
        // Не логируем ошибку "No access token" как критическую
        if (error?.message === 'No access token') {
          console.log('[WebSocket] No access token available. WebSocket connection skipped.');
        } else {
          console.error('[WebSocket] Connection error:', error);
        }
        reject(error);
      }
    });
  }

  /**
   * Отключение от WebSocket
   */
  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Регистрация обработчика сообщений
   */
  on(messageType: string, handler: WebSocketMessageHandler): void {
    this.handlers[messageType] = handler;
  }

  /**
   * Удаление обработчика сообщений
   */
  off(messageType: string): void {
    delete this.handlers[messageType];
  }

  /**
   * Отправка сообщения на сервер
   */
  send(type: string, data?: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  /**
   * Запуск ping для поддержания соединения
   */
  private startPing(): void {
    this.pingInterval = window.setInterval(() => {
      this.send('ping');
    }, 30000); // Ping каждые 30 секунд
  }

  /**
   * Остановка ping
   */
  private stopPing(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Проверка состояния подключения
   */
  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Получить описание кода закрытия WebSocket
   */
  private getCloseCodeMeaning(code: number): string {
    const meanings: { [key: number]: string } = {
      1000: 'Normal Closure',
      1001: 'Going Away',
      1002: 'Protocol Error',
      1003: 'Unsupported Data',
      1004: 'Reserved',
      1005: 'No Status Received',
      1006: 'Abnormal Closure',
      1007: 'Invalid Frame Payload Data',
      1008: 'Policy Violation',
      1009: 'Message Too Big',
      1010: 'Mandatory Extension',
      1011: 'Internal Server Error',
      4000: 'Custom: Internal Error',
      4001: 'Custom: Unauthorized',
      4003: 'Custom: Forbidden',
    };
    return meanings[code] || `Unknown code: ${code}`;
  }
}

// Создаем singleton экземпляр
let wsInstance: DispatchMapWebSocket | null = null;

export const getDispatchMapWebSocket = (): DispatchMapWebSocket => {
  if (!wsInstance) {
    wsInstance = new DispatchMapWebSocket();
  }
  return wsInstance;
};

/**
 * Тестирование базового WebSocket подключения без авторизации
 */
export const testWebSocketConnection = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
    const wsProtocol = apiBaseUrl.startsWith('https') ? 'wss' : 'ws';
    let wsHost = apiBaseUrl.replace(/^https?:\/\//, '');
    wsHost = wsHost.replace(/\/api\/?$/, '');
    wsHost = wsHost.replace(/\/$/, '');
    const testUrl = `${wsProtocol}://${wsHost}/ws/test/`;
    
    console.log('[WebSocket Test] Testing connection to:', testUrl);
    
    const testWs = new WebSocket(testUrl);
    let resolved = false;
    
    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        testWs.close();
      }
    };
    
    testWs.onopen = () => {
      console.log('[WebSocket Test] Connection successful!');
      cleanup();
      resolve(true);
    };
    
    testWs.onerror = (error) => {
      console.error('[WebSocket Test] Connection failed:', error);
      console.error('[WebSocket Test] This means WebSocket is not working at all');
      console.error('[WebSocket Test] Check:');
      console.error('[WebSocket Test] 1. Is server running with daphne?');
      console.error('[WebSocket Test] 2. Is the URL correct?');
      cleanup();
      resolve(false);
    };
    
    testWs.onclose = (event) => {
      if (!resolved) {
        console.error('[WebSocket Test] Connection closed:', event.code, event.reason);
        cleanup();
        resolve(false);
      }
    };
    
    // Таймаут на случай если соединение зависнет
    setTimeout(() => {
      if (!resolved) {
        console.error('[WebSocket Test] Connection timeout');
        cleanup();
        resolve(false);
      }
    }, 5000);
  });
};

export default DispatchMapWebSocket;

