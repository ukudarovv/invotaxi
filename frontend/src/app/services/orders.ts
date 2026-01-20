import api from './api';

export interface Order {
  id: string;
  passenger: {
    id: number;
    full_name: string;
    user: {
      id: number;
      phone: string;
      email?: string;
    };
    region?: {
      id: string;
      title: string;
    };
    disability_category?: string;
    allowed_companion?: boolean;
  };
  driver?: {
    id: number;
    name: string;
    car_model: string;
    plate_number: string;
    user: {
      id: number;
      phone: string;
    };
  } | null;
  pickup_title: string;
  dropoff_title: string;
  pickup_lat: number;
  pickup_lon: number;
  dropoff_lat: number;
  dropoff_lon: number;
  pickup_coordinate: { lat: number; lon: number };
  dropoff_coordinate: { lat: number; lon: number };
  desired_pickup_time: string;
  has_companion: boolean;
  note?: string;
  status: string;
  created_at: string;
  assigned_at?: string;
  completed_at?: string;
  assignment_reason?: string;
  rejection_reason?: string;
  video_recording?: boolean;
  upload_started?: boolean;
  seats_needed: number;
  distance_km?: number;
  waiting_time_minutes?: number;
  estimated_price?: number;
  final_price?: number;
  price_breakdown?: {
    base_distance_price: number;
    waiting_time_price: number;
    companion_fee: number;
    disability_multiplier: number;
    night_multiplier: number;
    weekend_multiplier: number;
    subtotal: number;
    minimum_fare_adjustment: number;
    total: number;
  };
}

export interface CreateOrderRequest {
  pickup_title: string;
  dropoff_title: string;
  pickup_lat: number;
  pickup_lon: number;
  dropoff_lat: number;
  dropoff_lon: number;
  desired_pickup_time: string;
  has_companion?: boolean;
  note?: string;
  passenger_id?: number;
}

export interface UpdateOrderStatusRequest {
  status: string;
  reason?: string;
}

export interface OrdersListParams {
  status?: string;
  passenger_id?: number;
  driver_id?: number;
  page?: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: ImportError[];
  imported_ids: string[];
  dry_run?: boolean;
}

export interface ImportError {
  row: number;
  message: string;
}

export interface ExportParams {
  status?: string;
  driver_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface GeocodeResult {
  status: 'ok' | 'not_found' | 'error';
  lat?: number;
  lon?: number;
  display_name?: string;
  error?: string;
}

export const ordersApi = {
  /**
   * Получить список заказов
   */
  async getOrders(params?: OrdersListParams): Promise<Order[]> {
    const response = await api.get<Order[] | PaginatedResponse<Order>>('/orders/', { params });
    
    // Обрабатываем как обычный массив или пагинированный ответ
    if (Array.isArray(response.data)) {
      return response.data;
    } else {
      return response.data.results;
    }
  },

  /**
   * Получить заказ по ID
   */
  async getOrder(orderId: string): Promise<Order> {
    const response = await api.get<Order>(`/orders/${orderId}/`);
    return response.data;
  },

  /**
   * Создать новый заказ
   */
  async createOrder(data: CreateOrderRequest): Promise<Order> {
    const response = await api.post<Order>('/orders/', data);
    return response.data;
  },

  /**
   * Обновить статус заказа
   */
  async updateOrderStatus(orderId: string, data: UpdateOrderStatusRequest): Promise<Order> {
    const response = await api.patch<Order>(`/orders/${orderId}/status/`, data);
    return response.data;
  },

  /**
   * Обновить заказ
   */
  async updateOrder(orderId: string, data: Partial<CreateOrderRequest>): Promise<Order> {
    const response = await api.patch<Order>(`/orders/${orderId}/`, data);
    return response.data;
  },

  /**
   * Пересчитать цену заказа
   */
  async calculatePrice(orderId: string, actualDistance?: number, actualWaitingTime?: number): Promise<Order> {
    const response = await api.post<Order>(`/orders/${orderId}/calculate-price/`, {
      actual_distance_km: actualDistance,
      actual_waiting_time_minutes: actualWaitingTime,
    });
    return response.data;
  },

  /**
   * Импорт заказов из CSV
   */
  async importOrders(
    file: File,
    options?: { dryRun?: boolean; skipErrors?: boolean }
  ): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (options?.dryRun) {
      formData.append('dry_run', 'true');
    }
    if (options?.skipErrors) {
      formData.append('skip_errors', 'true');
    }
    
    // Не устанавливаем Content-Type вручную - axios автоматически установит его с правильным boundary для FormData
    const response = await api.post<ImportResult>('/orders/import/', formData);
    return response.data;
  },

  /**
   * Экспорт заказов по водителям
   */
  async exportOrdersByDrivers(params?: ExportParams): Promise<Blob> {
    const response = await api.get('/orders/export-by-drivers/', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Геокодировать адрес через Nominatim API
   */
  async geocodeAddress(address: string): Promise<GeocodeResult> {
    const response = await api.post<GeocodeResult>('/orders/geocode/', {
      address,
    });
    return response.data;
  },
};

