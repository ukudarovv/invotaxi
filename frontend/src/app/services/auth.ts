import api from './api';

export interface LoginResponse {
  access: string;
  refresh: string;
  user: {
    id: number;
    username: string;
    email: string;
    phone: string;
    role: string;
  };
  role: string;
}

export interface EmailLoginRequest {
  email: string;
  password: string;
}

export interface PhoneLoginRequest {
  phone: string;
}

export interface VerifyOTPRequest {
  phone: string;
  code: string;
}

export interface RefreshTokenRequest {
  refresh: string;
}

export interface RefreshTokenResponse {
  access: string;
}

export const authApi = {
  /**
   * Вход по email и паролю (для админ-панели)
   */
  async emailLogin(data: EmailLoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/email-login/', data);
    return response.data;
  },

  /**
   * Запрос OTP кода по телефону
   */
  async phoneLogin(data: PhoneLoginRequest): Promise<{ message: string; expires_at: string }> {
    const response = await api.post('/auth/phone-login/', data);
    return response.data;
  },

  /**
   * Проверка OTP и получение токенов
   */
  async verifyOTP(data: VerifyOTPRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/verify-otp/', data);
    return response.data;
  },

  /**
   * Обновление access токена
   */
  async refreshToken(data: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    const response = await api.post<RefreshTokenResponse>('/auth/token/refresh/', data);
    return response.data;
  },

  /**
   * Выход из системы
   */
  async logout(refreshToken: string): Promise<{ message: string }> {
    const response = await api.post('/auth/logout/', { refresh: refreshToken });
    return response.data;
  },
};

