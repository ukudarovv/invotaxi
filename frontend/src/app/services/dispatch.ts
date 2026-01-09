import api from './api';

export interface DispatchCandidate {
  driver_id: number;
  name: string;
  region_id: string;
  car_model: string;
  capacity: number;
  is_online: boolean;
  priority: {
    region_match: boolean;
    order_count: number;
    distance: number | null;
  };
}

export interface CandidatesResponse {
  order_id: string;
  candidates: DispatchCandidate[];
  count: number;
}

export interface AssignOrderResponse {
  success: boolean;
  driver_id?: number;
  reason?: string;
  order?: {
    id: string;
    status: string;
    driver: {
      id: number;
      name: string;
      car_model: string;
    };
  };
  rejection_reason?: string;
}

export interface AutoAssignAllResponse {
  success: boolean;
  assigned: number;
  failed: number;
  total: number;
  failed_orders?: Array<{
    order_id: string;
    reason: string;
  }>;
  message?: string;
}

export interface DriverMarker {
  id: string;
  name: string;
  lat: number;
  lon: number;
  is_online: boolean;
  car_model: string;
  plate_number: string;
  region?: string;
  last_location_update?: string;
}

export interface OrderMarker {
  id: string;
  pickup_lat: number | null;
  pickup_lon: number | null;
  dropoff_lat: number | null;
  dropoff_lon: number | null;
  pickup_title: string;
  dropoff_title: string;
  status: string;
  driver_id?: string | null;
  passenger?: {
    id: string;
    full_name: string;
  } | null;
  created_at?: string;
}

export interface MapDataResponse {
  drivers: DriverMarker[];
  orders: OrderMarker[];
  drivers_count: number;
  orders_count: number;
}

export interface RouteResponse {
  route: Array<[number, number]>;
  distance_m: number;
  distance_km: number;
  duration_seconds: number;
  duration_minutes: number;
  eta: string;
}

export interface ETAResponse {
  eta: string;
  eta_timestamp: number;
  distance_m: number;
  distance_km: number;
  duration_minutes: number;
  duration_seconds: number;
}

export const dispatchApi = {
  /**
   * Получить кандидатов для заказа
   */
  async getCandidates(orderId: string): Promise<CandidatesResponse> {
    const response = await api.get<CandidatesResponse>(`/dispatch/candidates/${orderId}/`);
    return response.data;
  },

  /**
   * Назначить заказ водителю
   */
  async assignOrder(orderId: string, driverId?: string): Promise<AssignOrderResponse> {
    const response = await api.post<AssignOrderResponse>(`/dispatch/assign/${orderId}/`, driverId ? { driver_id: driverId } : {});
    return response.data;
  },

  /**
   * Автоматическое назначение всех заказов в очереди
   */
  async autoAssignAll(): Promise<AutoAssignAllResponse> {
    const response = await api.post<AutoAssignAllResponse>('/dispatch/auto-assign-all/');
    return response.data;
  },

  /**
   * Получить данные для карты диспетчеризации
   */
  async getMapData(): Promise<MapDataResponse> {
    const response = await api.get<MapDataResponse>('/dispatch/map-data/');
    return response.data;
  },

  /**
   * Получить маршрут между двумя точками
   */
  async getRoute(lat1: number, lon1: number, lat2: number, lon2: number): Promise<RouteResponse> {
    const response = await api.get<RouteResponse>('/dispatch/route/', {
      params: { lat1, lon1, lat2, lon2 }
    });
    return response.data;
  },

  /**
   * Получить маршрут водителя до активного заказа
   */
  async getDriverRoute(driverId: string): Promise<RouteResponse & { order_id: string }> {
    const response = await api.get<RouteResponse & { order_id: string }>(`/dispatch/driver-route/${driverId}/`);
    return response.data;
  },

  /**
   * Получить маршрут заказа (от точки забора до точки высадки)
   */
  async getOrderRoute(orderId: string): Promise<RouteResponse> {
    const response = await api.get<RouteResponse>(`/dispatch/order-route/${orderId}/`);
    return response.data;
  },

  /**
   * Получить расчетное время прибытия (ETA) водителя к заказу
   */
  async getETA(driverId: string, orderId: string): Promise<ETAResponse> {
    const response = await api.get<ETAResponse>(`/dispatch/eta/${driverId}/${orderId}/`);
    return response.data;
  },
};

