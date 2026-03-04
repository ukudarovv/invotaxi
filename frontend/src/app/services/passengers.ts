import api from './api';

export interface Passenger {
  id: number;
  user: {
    id: number;
    username: string;
    phone: string;
    email?: string;
  };
  full_name: string;
  region?: {
    id: string;
    title: string;
  };
  disability_category?: string;
  allowed_companion?: boolean;
}

export interface PassengersListParams {
  region_id?: string;
  page?: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const passengersApi = {
  /**
   * Получить список пассажиров
   */
  async getPassengers(params?: PassengersListParams): Promise<Passenger[]> {
    const response = await api.get<Passenger[] | PaginatedResponse<Passenger>>('/passengers/', { params });
    
    if (Array.isArray(response.data)) {
      return response.data;
    } else {
      return response.data.results;
    }
  },

  /**
   * Получить пассажира по ID
   */
  async getPassenger(passengerId: number): Promise<Passenger> {
    const response = await api.get<Passenger>(`/passengers/${passengerId}/`);
    return response.data;
  },

  /**
   * Скачать шаблон CSV для импорта пассажиров
   */
  async downloadTemplate(): Promise<Blob> {
    const response = await api.get('/passengers/template/', {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Импорт пассажиров из CSV файла
   */
  async importPassengers(file: File, options?: { skipErrors?: boolean; dryRun?: boolean }): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.skipErrors) {
      formData.append('skip_errors', 'true');
    }
    if (options?.dryRun) {
      formData.append('dry_run', 'true');
    }

    const response = await api.post('/passengers/import/', formData);
    return response.data;
  },

  /**
   * Создать пассажира
   */
  async createPassenger(data: {
    full_name: string;
    region_id: string;
    disability_category: string;
    allowed_companion?: boolean;
    phone: string;
    email?: string;
  }): Promise<Passenger> {
    const response = await api.post<Passenger>('/passengers/', data);
    return response.data;
  },

  /**
   * Обновить пассажира
   */
  async updatePassenger(
    passengerId: number,
    data: {
      full_name?: string;
      region_id?: string;
      disability_category?: string;
      allowed_companion?: boolean;
      phone?: string;
      email?: string;
    }
  ): Promise<Passenger> {
    const response = await api.patch<Passenger>(`/passengers/${passengerId}/`, data);
    return response.data;
  },

  /**
   * Поиск пассажиров по телефону
   */
  async searchPassengersByPhone(phone: string): Promise<Passenger[]> {
    if (!phone || phone.trim().length === 0) {
      return [];
    }
    const response = await api.get<Passenger[] | PaginatedResponse<Passenger>>('/passengers/', { 
      params: { phone: phone.trim() } 
    });
    
    if (Array.isArray(response.data)) {
      return response.data;
    } else {
      return response.data.results;
    }
  },
};

