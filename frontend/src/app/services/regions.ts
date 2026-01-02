import api from './api';

export interface City {
  id: string;
  title: string;
  center_lat: number;
  center_lon: number;
  center: {
    lat: number;
    lon: number;
  };
}

export interface Region {
  id: string;
  title: string;
  city: City;
  city_id?: string;
  center_lat: number;
  center_lon: number;
  center: {
    lat: number;
    lon: number;
  };
}

export const regionsApi = {
  /**
   * Получить список регионов
   */
  async getRegions(): Promise<Region[]> {
    const response = await api.get<Region[] | { results: Region[] }>('/regions/');
    // Обрабатываем как обычный массив или пагинированный ответ
    if (Array.isArray(response.data)) {
      return response.data;
    } else {
      return response.data.results || [];
    }
  },
};

