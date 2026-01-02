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
    const response = await api.get<Region[] | { results: Region[] }>('/regions/');
    // Обрабатываем как обычный массив или пагинированный ответ
    if (Array.isArray(response)) {
      return response;
    } else {
      return (response as any).results || [];
    }
  },

  /**
   * Получить регион по ID
   */
  async getRegion(id: string): Promise<Region> {
    return api.get<Region>(`/regions/${id}/`);
  },

  /**
   * Создать новый регион
   */
  async createRegion(data: CreateRegionData): Promise<Region> {
    return api.post<Region>('/regions/', data);
  },

  /**
   * Обновить регион
   */
  async updateRegion(id: string, data: UpdateRegionData): Promise<Region> {
    return api.patch<Region>(`/regions/${id}/`, data);
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
    return api.get<RegionStats>(`/regions/${id}/stats/`);
  },

  /**
   * Получить список всех городов
   */
  async getCities(): Promise<City[]> {
    const response = await api.get<City[]>('/regions/cities/');
    return Array.isArray(response) ? response : [];
  },

  /**
   * Получить город по ID
   */
  async getCity(id: string): Promise<City> {
    return api.get<City>(`/regions/cities/${id}/`);
  },

  /**
   * Создать новый город
   */
  async createCity(data: CreateCityData): Promise<City> {
    return api.post<City>('/regions/cities/', data);
  },

  /**
   * Обновить город
   */
  async updateCity(id: string, data: UpdateCityData): Promise<City> {
    return api.patch<City>(`/regions/cities/${id}/`, data);
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
    return api.get<CityStats>(`/regions/cities/${id}/stats/`);
  },
};

