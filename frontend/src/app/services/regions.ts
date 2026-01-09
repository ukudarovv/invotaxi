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

export interface CityStats {
  city_id: string;
  city_title: string;
  regions: number;
  drivers: number;
  passengers: number;
  active_orders: number;
  total_orders: number;
}

export interface CreateCityData {
  id?: string;
  title: string;
  center_lat: number;
  center_lon: number;
}

export interface UpdateCityData {
  title?: string;
  center_lat?: number;
  center_lon?: number;
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
  polygon_coordinates?: number[][]; // [[lat, lon], ...]
  service_radius_meters?: number;
}

export interface RegionStats {
  region_id: string;
  region_title: string;
  drivers: number;
  passengers: number;
  active_orders: number;
  total_orders: number;
}

export interface CreateRegionData {
  id?: string;
  title: string;
  city_id: string;
  center_lat: number;
  center_lon: number;
  polygon_coordinates?: number[][];
  service_radius_meters?: number;
}

export interface UpdateRegionData {
  title?: string;
  city_id?: string;
  center_lat?: number;
  center_lon?: number;
  polygon_coordinates?: number[][];
  service_radius_meters?: number;
}

export const regionsApi = {
  /**
   * Получить список всех регионов
   */
  async getRegions(): Promise<Region[]> {
    try {
      const response = await api.get<Region[] | { count: number; next: string | null; previous: string | null; results: Region[] }>('/regions/');
      // Обрабатываем как обычный массив или пагинированный ответ
      if (Array.isArray(response.data)) {
        return response.data;
      } else if (response.data && typeof response.data === 'object' && 'results' in response.data) {
        return (response.data as any).results || [];
      }
      return [];
    } catch (error: any) {
      console.error('getRegions error:', error);
      throw error;
    }
  },

  /**
   * Получить регион по ID
   */
  async getRegion(id: string): Promise<Region> {
    const response = await api.get<Region>(`/regions/${id}/`);
    return response.data;
  },

  /**
   * Создать новый регион
   */
  async createRegion(data: CreateRegionData): Promise<Region> {
    const response = await api.post<Region>('/regions/', data);
    return response.data;
  },

  /**
   * Обновить регион
   */
  async updateRegion(id: string, data: UpdateRegionData): Promise<Region> {
    const response = await api.patch<Region>(`/regions/${id}/`, data);
    return response.data;
  },

  /**
   * Удалить регион
   */
  async deleteRegion(id: string): Promise<void> {
    return api.delete<void>(`/regions/${id}/`);
  },

  /**
   * Получить статистику по региону
   */
  async getRegionStats(id: string): Promise<RegionStats> {
    const response = await api.get<RegionStats>(`/regions/${id}/stats/`);
    return response.data;
  },

  /**
   * Получить список всех городов
   */
  async getCities(): Promise<City[]> {
    try {
      const response = await api.get<City[] | { count: number; next: string | null; previous: string | null; results: City[] }>('/regions/cities/');
      // Обрабатываем как обычный массив или пагинированный ответ
      if (Array.isArray(response.data)) {
        return response.data;
      } else if (response.data && typeof response.data === 'object' && 'results' in response.data) {
        return (response.data as any).results || [];
      }
      return [];
    } catch (error: any) {
      console.error('getCities error:', error);
      throw error;
    }
  },

  /**
   * Получить город по ID
   */
  async getCity(id: string): Promise<City> {
    const response = await api.get<City>(`/regions/cities/${id}/`);
    return response.data;
  },

  /**
   * Создать новый город
   */
  async createCity(data: CreateCityData): Promise<City> {
    const response = await api.post<City>('/regions/cities/', data);
    return response.data;
  },

  /**
   * Обновить город
   */
  async updateCity(id: string, data: UpdateCityData): Promise<City> {
    const response = await api.patch<City>(`/regions/cities/${id}/`, data);
    return response.data;
  },

  /**
   * Удалить город
   */
  async deleteCity(id: string): Promise<void> {
    return api.delete<void>(`/regions/cities/${id}/`);
  },

  /**
   * Получить статистику по городу
   */
  async getCityStats(id: string): Promise<CityStats> {
    const response = await api.get<CityStats>(`/regions/cities/${id}/stats/`);
    return response.data;
  },
};
