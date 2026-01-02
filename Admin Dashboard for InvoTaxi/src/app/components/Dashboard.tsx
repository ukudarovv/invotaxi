import { TrendingUp, Car, Users, DollarSign, Clock } from "lucide-react";
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

const stats = [
  {
    label: "Активные заказы",
    value: "24",
    change: "+12%",
    icon: TrendingUp,
    color: "bg-blue-500",
  },
  {
    label: "Онлайн водители",
    value: "156",
    change: "+8%",
    icon: Car,
    color: "bg-green-500",
  },
  {
    label: "Всего пассажиров",
    value: "3,248",
    change: "+23%",
    icon: Users,
    color: "bg-purple-500",
  },
  {
    label: "Выполнено сегодня",
    value: "89",
    change: "+15%",
    icon: Clock,
    color: "bg-orange-500",
  },
];

const ordersData = [
  { name: "Пн", заказы: 45 },
  { name: "Вт", заказы: 52 },
  { name: "Ср", заказы: 48 },
  { name: "Чт", заказы: 65 },
  { name: "Пт", заказы: 78 },
  { name: "Сб", заказы: 82 },
  { name: "Вс", заказы: 70 },
];

const statusData = [
  { name: "Ожидание", value: 12, color: "#f59e0b" },
  { name: "В пути", value: 8, color: "#3b82f6" },
  { name: "Выполнено", value: 45, color: "#10b981" },
  { name: "Отменено", value: 5, color: "#ef4444" },
];

const regionData = [
  { region: "Алматы", заказы: 145 },
  { region: "Нур-Султан", заказы: 98 },
  { region: "Шымкент", заказы: 76 },
  { region: "Караганда", заказы: 54 },
];

const recentOrders = [
  {
    id: "#4532",
    passenger: "Алия К.",
    driver: "Асан М.",
    status: "В пути",
    time: "10:30",
  },
  {
    id: "#4531",
    passenger: "Ержан Б.",
    driver: "Дмитрий С.",
    status: "Ожидание",
    time: "10:25",
  },
  {
    id: "#4530",
    passenger: "Сауле Т.",
    driver: "Мурат К.",
    status: "Выполнено",
    time: "10:15",
  },
  {
    id: "#4529",
    passenger: "Максим П.",
    driver: "Олег Н.",
    status: "В пути",
    time: "10:10",
  },
];

export function Dashboard() {
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
        </div>

        {/* Status Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl dark:text-white mb-4">Распределение по статусам</h2>
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
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Region Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl dark:text-white mb-4">Статистика по регионам</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={regionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="region" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="заказы" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Orders */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl dark:text-white mb-4">Последние заказы</h2>
          <div className="space-y-4">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{order.id}</p>
                  <p className="mt-1 dark:text-white">{order.passenger}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Водитель: {order.driver}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs ${
                      order.status === "Выполнено"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : order.status === "В пути"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    }`}
                  >
                    {order.status}
                  </span>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{order.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}