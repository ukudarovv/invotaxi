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
};

