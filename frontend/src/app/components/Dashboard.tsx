import { useState, useEffect, useMemo } from "react";
import { TrendingUp, Car, Users, DollarSign, Clock, Loader2 } from "lucide-react";
import { ordersApi } from "../services/orders";
import { driversApi } from "../services/drivers";
import { passengersApi } from "../services/passengers";
import { analyticsApi } from "../services/analytics";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

const statusColors: Record<string, string> = {
  pending: "#f59e0b",
  assigned: "#3b82f6",
  driver_en_route: "#3b82f6",
  ride_ongoing: "#3b82f6",
  completed: "#10b981",
  cancelled: "#ef4444",
};

export function Dashboard() {
  const [statsData, setStatsData] = useState({
    activeOrders: 0,
    onlineDrivers: 0,
    totalPassengers: 0,
    completedToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentOrdersData, setRecentOrdersData] = useState<any[]>([]);
  const [ordersData, setOrdersData] = useState<Array<{ name: string; заказы: number }>>([]);
  const [statusData, setStatusData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [regionData, setRegionData] = useState<Array<{ region: string; заказы: number }>>([]);
  const [comparison, setComparison] = useState<any>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        
        // Загружаем данные за последние 7 дней
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 7);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);

        const params = {
          date_from: from.toISOString(),
          date_to: to.toISOString(),
          granularity: 'day' as const,
        };

        const [orders, drivers, passengers, metrics, timeSeries, regionDistribution, comparisonData] = await Promise.all([
          ordersApi.getOrders(),
          driversApi.getDrivers(),
          passengersApi.getPassengers(),
          analyticsApi.getMetrics(params),
          analyticsApi.getTimeSeries(params),
          analyticsApi.getRegionDistribution(params),
          analyticsApi.getComparison(params),
        ]);

        const activeOrders = orders.filter(
          (o) => o.status === "assigned" || o.status === "driver_en_route" || o.status === "ride_ongoing"
        ).length;
        const onlineDrivers = drivers.filter((d) => d.is_online).length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const completedToday = orders.filter(
          (o) => o.status === "completed" && new Date(o.completed_at || o.created_at) >= today
        ).length;

        setStatsData({
          activeOrders,
          onlineDrivers,
          totalPassengers: passengers.length,
          completedToday,
        });

        setRecentOrdersData(orders.slice(0, 4));

        // Формируем данные для графика заказов за неделю
        const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const ordersByDay = timeSeries.map((item) => {
          const date = new Date(item.period);
          return {
            name: weekDays[date.getDay()],
            заказы: item.total,
          };
        });
        setOrdersData(ordersByDay);

        // Формируем данные для графика статусов
        const statusChartData = metrics.status_distribution.map((item, index) => {
          const statusNames: Record<string, string> = {
            pending: "Ожидание",
            assigned: "Назначен",
            driver_en_route: "В пути",
            ride_ongoing: "В поездке",
            completed: "Выполнено",
            cancelled: "Отменено",
          };
          return {
            name: statusNames[item.status] || item.status,
            value: item.count,
            color: statusColors[item.status] || COLORS[index % COLORS.length],
          };
        });
        setStatusData(statusChartData);

        // Формируем данные для графика по регионам
        const regionChartData = regionDistribution.map((item) => ({
          region: item.region_title,
          заказы: item.orders_count,
        }));
        setRegionData(regionChartData);

        setComparison(comparisonData);
      } catch (err) {
        console.error("Ошибка загрузки данных дашборда:", err);
        // Устанавливаем пустые данные при ошибке, чтобы не ломать интерфейс
        setOrdersData([]);
        setStatusData([]);
        setRegionData([]);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  const stats = useMemo(() => {
    const getChangePercent = (current: number, previous: number): string => {
      if (previous === 0) return current > 0 ? "+100%" : "0%";
      const change = ((current - previous) / previous) * 100;
      const sign = change >= 0 ? "+" : "";
      return `${sign}${change.toFixed(0)}%`;
    };

    return [
      {
        label: "Активные заказы",
        value: loading ? "..." : String(statsData.activeOrders),
        change: comparison ? getChangePercent(statsData.activeOrders, comparison.previous.orders) : "0%",
        icon: TrendingUp,
        color: "bg-blue-500",
      },
      {
        label: "Онлайн водители",
        value: loading ? "..." : String(statsData.onlineDrivers),
        change: "+0%", // Для водителей нет сравнения в comparison API
        icon: Car,
        color: "bg-green-500",
      },
      {
        label: "Всего пассажиров",
        value: loading ? "..." : String(statsData.totalPassengers),
        change: "+0%",
        icon: Users,
        color: "bg-purple-500",
      },
      {
        label: "Выполнено сегодня",
        value: loading ? "..." : String(statsData.completedToday),
        change: comparison ? getChangePercent(statsData.completedToday, comparison.previous.completed) : "0%",
        icon: Clock,
        color: "bg-orange-500",
      },
    ];
  }, [loading, statsData, comparison]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl dark:text-white">Главная панель</h1>
        <p className="text-gray-600 dark:text-gray-400">Обзор системы в реальном времени</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.color} w-12 h-12 rounded-lg flex items-center justify-center text-white`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-green-600 dark:text-green-400 text-sm">{stat.change}</span>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{stat.label}</p>
              <p className="text-3xl dark:text-white mt-1">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl dark:text-white mb-4">Заказы за неделю</h2>
          {loading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : ordersData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
              Нет данных
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={ordersData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="заказы"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl dark:text-white mb-4">Распределение по статусам</h2>
          {loading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : statusData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
              Нет данных
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Region Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl dark:text-white mb-4">Статистика по регионам</h2>
          {loading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : regionData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
              Нет данных
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={regionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="region" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="заказы" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent Orders */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl dark:text-white mb-4">Последние заказы</h2>
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : (
          <div className="space-y-4">
              {recentOrdersData.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">Нет заказов</p>
              ) : (
                recentOrdersData.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{order.id}</p>
                      <p className="mt-1 dark:text-white">{order.passenger.full_name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Водитель: {order.driver?.name || "Не назначен"}
                      </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs ${
                          order.status === "completed"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : order.status === "driver_en_route" || order.status === "ride_ongoing"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    }`}
                  >
                    {order.status === "pending" ? "Ожидание" :
                     order.status === "assigned" ? "Назначен" :
                     order.status === "driver_en_route" ? "В пути" :
                     order.status === "ride_ongoing" ? "В поездке" :
                     order.status === "completed" ? "Выполнено" :
                     order.status === "cancelled" ? "Отменено" : order.status}
                  </span>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(order.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                </div>
              </div>
                ))
              )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}