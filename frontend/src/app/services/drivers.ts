import api from './api';

export interface Driver {
  id: number;
  user: {
    id: number;
    username: string;
    phone: string;
    email?: string;
  };
  name: string;
  region?: {
    id: string;
    title: string;
  };
  car_model: string;
  plate_number: string;
  capacity: number;
  is_online: boolean;
  current_lat?: number;
  current_lon?: number;
  current_position?: { lat: number; lon: number } | null;
  last_location_update?: string;
}

export interface UpdateLocationRequest {
  lat: number;
  lon: number;
}

export interface UpdateOnlineStatusRequest {
  is_online: boolean;
}

export interface DriversListParams {
  is_online?: boolean;
  region_id?: string;
  search?: string;
  page?: number;
}

export interface CreateDriverRequest {
  name: string;
  phone: string;
  email?: string;
  password: string;
  region_id: string;
  car_model: string;
  plate_number: string;
  capacity: number;
  is_online?: boolean;
}

export interface UpdateDriverRequest {
  name?: string;
  phone?: string;
  email?: string;
  region_id?: string;
  car_model?: string;
  plate_number?: string;
  capacity?: number;
  is_online?: boolean;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const driversApi = {
  /**
   * Получить список водителей
   */
  async getDrivers(params?: DriversListParams): Promise<Driver[]> {
    const response = await api.get<Driver[] | PaginatedResponse<Driver>>('/drivers/', { params });
    
    if (Array.isArray(response.data)) {
      return response.data;
    } else {
      return response.data.results;
    }
  },

  /**
   * Получить водителя по ID
   */
  async getDriver(driverId: number): Promise<Driver> {
    const response = await api.get<Driver>(`/drivers/${driverId}/`);
    return response.data;
  },

  /**
   * Обновить онлайн статус водителя
   */
  async updateOnlineStatus(driverId: number, data: UpdateOnlineStatusRequest): Promise<Driver> {
    const response = await api.patch<Driver>(`/drivers/${driverId}/online-status/`, data);
    return response.data;
  },

  /**
   * Обновить позицию водителя
   */
  async updateLocation(driverId: number, data: UpdateLocationRequest): Promise<Driver> {
    const response = await api.patch<Driver>(`/drivers/${driverId}/location/`, data);
    return response.data;
  },

  /**
   * Создать водителя
   */
  async createDriver(data: CreateDriverRequest): Promise<Driver> {
    const response = await api.post<Driver>('/drivers/', data);
    return response.data;
  },

  /**
   * Обновить водителя
   */
  async updateDriver(driverId: number, data: UpdateDriverRequest): Promise<Driver> {
    const response = await api.patch<Driver>(`/drivers/${driverId}/`, data);
    return response.data;
  },

  /**
   * Удалить водителя
   */
  async deleteDriver(driverId: number): Promise<void> {
    await api.delete(`/drivers/${driverId}/`);
  },

  /**
   * Скачать шаблон Excel для импорта водителей
   */
  async downloadTemplate(): Promise<Blob> {
    const response = await api.get('/drivers/template/', {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Импорт водителей из Excel файла
   */
  async importDrivers(file: File, options?: { skipErrors?: boolean; dryRun?: boolean }): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.skipErrors) {
      formData.append('skip_errors', 'true');
    }
    if (options?.dryRun) {
      formData.append('dry_run', 'true');
    }

    // Не устанавливаем Content-Type вручную - axios автоматически установит его с правильным boundary для FormData
    const response = await api.post('/drivers/import/', formData);
    return response.data;
  },
};

