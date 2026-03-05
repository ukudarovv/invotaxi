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

export interface HeatmapDataPoint {
  lat: number;
  lon: number;
  intensity: number;
}

export interface HeatmapResponse {
  points: HeatmapDataPoint[];
}

export interface DailyRouteOrder {
  id: string;
  pickup_title: string;
  dropoff_title: string;
  pickup_lat: number;
  pickup_lon: number;
  dropoff_lat: number;
  dropoff_lon: number;
  desired_pickup_time: string | null;
  status: string;
  passenger_name: string | null;
  has_companion: boolean;
  seats_needed: number;
  estimated_price: string | null;
  distance_km: number | null;
  note: string | null;
}

export interface DailyRouteDriver {
  id: number;
  name: string;
  car_model: string;
  plate_number: string;
  phone: string | null;
  region: string | null;
  capacity: number;
}

export interface MLScoreDetails {
  cost: number;
  gap_min: number;
  gap_norm: number;
  deadhead_km: number;
  deadhead_norm: number;
  reject_norm: number;
  cancel_norm: number;
  fairness_norm: number;
  zone_norm: number;
  quality_norm: number;
  acceptance_rate: number;
  cancel_rate: number;
  rating: number;
  orders_so_far: number;
  weights: {
    w_eta: number;
    w_deadhead: number;
    w_reject: number;
    w_cancel: number;
    w_fairness: number;
    w_zone: number;
    w_quality: number;
  };
}

export interface DailyRoute {
  driver: DailyRouteDriver;
  orders: DailyRouteOrder[];
  scores: Array<{ order_id: string } & MLScoreDetails>;
  total_orders: number;
  total_distance_km: number;
}

export interface DailyRoutesResponse {
  date: string;
  algorithm: string;
  config: {
    name: string;
    w_eta: number;
    w_deadhead: number;
    w_reject: number;
    w_cancel: number;
    w_fairness: number;
    w_zone: number;
    w_quality: number;
  };
  total_orders: number;
  unassigned_count: number;
  already_assigned_count: number;
  distributed_count: number;
  failed_count: number;
  drivers_count: number;
  routes: DailyRoute[];
  assignments: Array<{
    order_id: string;
    driver_id: number;
    driver_name: string;
    ml_cost: number;
    ml_details: MLScoreDetails;
  }>;
  unassigned_orders: Array<{ id: string; reason: string }>;
  auto_assigned: boolean;
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
    try {
      const response = await api.post<AssignOrderResponse>(`/dispatch/assign/${orderId}/`, driverId ? { driver_id: driverId } : {});
      const data = response.data;
      
      // Проверяем success: false даже при успешном HTTP-ответе
      if (data.success === false) {
        const errorMessage = data.rejection_reason || data.reason || data.error || 'Не удалось назначить водителя';
        const error: any = new Error(errorMessage);
        error.response = { data };
        throw error;
      }
      
      return data;
    } catch (err: any) {
      // Если это уже обработанная ошибка от axios interceptor, просто пробрасываем её
      if (err.response) {
        throw err;
      }
      // Иначе создаем ошибку с деталями
      throw err;
    }
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

  /**
   * Получить данные для тепловой карты спроса
   */
  async getHeatmapData(): Promise<HeatmapResponse> {
    const response = await api.get<HeatmapResponse>('/dispatch/heatmap/');
    return response.data;
  },

  /**
   * Получить предварительное распределение заказов на день (GET)
   */
  async getDailyRoutes(date?: string): Promise<DailyRoutesResponse> {
    const params = date ? { date } : {};
    const response = await api.get<DailyRoutesResponse>('/dispatch/daily-routes/', { params });
    return response.data;
  },

  /**
   * Применить распределение заказов на день (POST)
   */
  async applyDailyRoutes(date?: string): Promise<DailyRoutesResponse> {
    const data = date ? { date } : {};
    const response = await api.post<DailyRoutesResponse>('/dispatch/daily-routes/', data, {
      params: date ? { date } : {},
    });
    return response.data;
  },

  /**
   * Экспорт маршрутов дня: ZIP с отдельным CSV для каждого водителя
   */
  async exportDailyRoutes(date?: string): Promise<Blob> {
    const params = date ? { date } : {};
    const response = await api.get('/dispatch/daily-routes-export/', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};

