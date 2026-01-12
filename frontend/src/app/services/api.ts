import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// Создаем axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Функция для получения токена из localStorage
const getAccessToken = (): string | null => {
  return localStorage.getItem('accessToken');
};

const getRefreshToken = (): string | null => {
  return localStorage.getItem('refreshToken');
};

// Request interceptor - добавляем токен в заголовки
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor - обрабатываем ошибки
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Если ошибка 401 и это не запрос на логин/refresh, пытаемся обновить токен
    const isAuthRequest = originalRequest.url?.includes('/auth/email-login') || 
                         originalRequest.url?.includes('/auth/phone-login') ||
                         originalRequest.url?.includes('/auth/verify-otp') ||
                         originalRequest.url?.includes('/auth/token/refresh');
    
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true;

      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          // Пытаемся обновить токен
          const response = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
            refresh: refreshToken,
          });

          const { access } = response.data;
          localStorage.setItem('accessToken', access);

          // Повторяем оригинальный запрос с новым токеном
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access}`;
          }
          return api(originalRequest);
        } catch (refreshError) {
          // Если обновление токена не удалось, очищаем токены
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('invotaxi_user');
          // Отправляем событие для уведомления AuthContext
          window.dispatchEvent(new Event('auth:logout'));
          return Promise.reject(refreshError);
        }
      } else {
        // Нет refresh token, очищаем все
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('invotaxi_user');
        // Отправляем событие для уведомления AuthContext
        window.dispatchEvent(new Event('auth:logout'));
      }
    }

    // Обработка других ошибок
    if (error.response) {
      // Сервер вернул ошибку
      const responseData = error.response.data as any;
      
      // Обработка ошибок валидации Django REST Framework (словарь с полями)
      if (typeof responseData === 'object' && responseData !== null && !Array.isArray(responseData)) {
        // Проверяем, есть ли поля с ошибками валидации
        const fieldErrors: string[] = [];
        for (const [key, value] of Object.entries(responseData)) {
          if (Array.isArray(value)) {
            fieldErrors.push(`${key}: ${value.join(', ')}`);
          } else if (typeof value === 'string') {
            fieldErrors.push(`${key}: ${value}`);
          } else if (typeof value === 'object' && value !== null) {
            // Вложенные ошибки
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
              if (Array.isArray(nestedValue)) {
                fieldErrors.push(`${key}.${nestedKey}: ${nestedValue.join(', ')}`);
              } else {
                fieldErrors.push(`${key}.${nestedKey}: ${nestedValue}`);
              }
            }
          }
        }
        
        if (fieldErrors.length > 0) {
          return Promise.reject(new Error(fieldErrors.join('; ')));
        }
      }
      
      // Обычные ошибки
      const errorMessage = responseData?.rejection_reason || 
                          responseData?.reason ||
                          responseData?.error || 
                          responseData?.detail ||
                          (typeof responseData === 'string' ? responseData : null) ||
                          error.message ||
                          'Произошла ошибка';
      
      return Promise.reject(new Error(errorMessage));
    } else if (error.request) {
      // Запрос был отправлен, но ответа не получено
      return Promise.reject(new Error('Нет соединения с сервером. Проверьте подключение к интернету.'));
    } else {
      // Ошибка при настройке запроса
      return Promise.reject(error);
    }
  }
);

export default api;

