import api from './api';

export interface AnalyticsParams {
  date_from?: string;
  date_to?: string;
  region_id?: string | number;  // Может быть строкой (CharField primary key) или числом для обратной совместимости
  driver_id?: number;
  granularity?: 'hour' | 'day' | 'week' | 'month';
  limit?: number;
}

export interface Metrics {
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  success_rate: number;
  avg_duration_minutes: number | null;
  avg_distance_km: number | null;
  avg_assignment_time_minutes: number | null;
  status_distribution: Array<{ status: string; count: number }>;
  disability_distribution: Array<{ passenger__disability_category: string; count: number }>;
  orders_with_surge: number;
  avg_surge_multiplier: number;
  online_drivers: number;
  active_drivers: number;
  avg_rating: number;
  total_revenue: number;
  avg_order_value: number;
  avg_quote: number;
  avg_final_price: number;
  completed_orders_count: number;
}

export interface FinancialMetrics {
  total_revenue: number;
  avg_order_value: number;
  avg_quote: number;
  avg_final_price: number;
  completed_orders_count: number;
}

export interface DriverMetrics {
  online_drivers: number;
  active_drivers: number;
  avg_rating: number;
}

export interface TimeSeriesData {
  period: string;
  total: number;
  completed: number;
  cancelled: number;
  revenue: number;
}

export interface RegionDistribution {
  region_id: string;
  region_title: string;
  orders_count: number;
  completed_count: number;
  revenue: number;
}

export interface PeakHours {
  hour: string;
  orders: number;
}

export interface DriverPerformance {
  driver_id: number;
  driver_name: string;
  rating: number;
  orders: number;
  revenue: number;
  total_offers: number;
  accepted_offers: number;
  declined_offers: number;
  acceptance_rate: number;
}

export interface ComparisonMetrics {
  current: {
    orders: number;
    completed: number;
    revenue: number;
    avg_order_value: number;
  };
  previous: {
    orders: number;
    completed: number;
    revenue: number;
    avg_order_value: number;
  };
  changes: {
    orders: number;
    completed: number;
    revenue: number;
    avg_order_value: number;
  };
}

export const analyticsApi = {
  /**
   * Получить основные метрики (KPI)
   */
  async getMetrics(params?: AnalyticsParams): Promise<Metrics> {
    const response = await api.get<Metrics>('/analytics/metrics/', { params });
    return response.data;
  },

  /**
   * Получить аналитику заказов
   */
  async getOrdersAnalytics(params?: AnalyticsParams): Promise<Metrics> {
    const response = await api.get<Metrics>('/analytics/orders/', { params });
    return response.data;
  },

  /**
   * Получить финансовую аналитику
   */
  async getFinancialAnalytics(params?: AnalyticsParams): Promise<FinancialMetrics> {
    const response = await api.get<FinancialMetrics>('/analytics/financial/', { params });
    return response.data;
  },

  /**
   * Получить аналитику водителей
   */
  async getDriversAnalytics(params?: AnalyticsParams): Promise<DriverMetrics> {
    const response = await api.get<DriverMetrics>('/analytics/drivers/', { params });
    return response.data;
  },

  /**
   * Получить временные ряды
   */
  async getTimeSeries(params?: AnalyticsParams): Promise<TimeSeriesData[]> {
    const response = await api.get<TimeSeriesData[]>('/analytics/time-series/', { params });
    return response.data;
  },

  /**
   * Получить распределение по регионам
   */
  async getRegionDistribution(params?: AnalyticsParams): Promise<RegionDistribution[]> {
    const response = await api.get<RegionDistribution[]>('/analytics/regions/', { params });
    return response.data;
  },

  /**
   * Получить пиковые часы
   */
  async getPeakHours(params?: AnalyticsParams): Promise<PeakHours[]> {
    const response = await api.get<PeakHours[]>('/analytics/peak-hours/', { params });
    return response.data;
  },

  /**
   * Получить топ водителей
   */
  async getDriverPerformance(params?: AnalyticsParams): Promise<DriverPerformance[]> {
    const response = await api.get<DriverPerformance[]>('/analytics/driver-performance/', { params });
    return response.data;
  },

  /**
   * Экспорт отчета в CSV
   */
  async exportReport(type: 'orders' | 'financial' | 'drivers', params?: AnalyticsParams): Promise<Blob> {
    const response = await api.get(`/analytics/export/?type=${type}`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Получить сравнение метрик текущего периода с предыдущим
   */
  async getComparison(params?: AnalyticsParams): Promise<ComparisonMetrics> {
    const response = await api.get<ComparisonMetrics>('/analytics/comparison/', { params });
    return response.data;
  },
};
