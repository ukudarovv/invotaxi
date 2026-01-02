import { Download, TrendingUp, Calendar } from "lucide-react";
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
  AreaChart,
  Area,
} from "recharts";

const monthlyData = [
  { month: "Янв", заказы: 245, выполнено: 230, отменено: 15 },
  { month: "Фев", заказы: 268, выполнено: 255, отменено: 13 },
  { month: "Мар", заказы: 290, выполнено: 278, отменено: 12 },
  { month: "Апр", заказы: 312, выполнено: 298, отменено: 14 },
  { month: "Май", заказы: 335, выполнено: 320, отменено: 15 },
  { month: "Июн", заказы: 358, выполнено: 342, отменено: 16 },
];

const driverPerformance = [
  { name: "Асан М.", заказы: 245, рейтинг: 4.8 },
  { name: "Мурат К.", заказы: 189, рейтинг: 4.9 },
  { name: "Олег Н.", заказы: 312, рейтинг: 4.7 },
  { name: "Серик А.", заказы: 156, рейтинг: 4.6 },
  { name: "Дмитрий С.", заказы: 203, рейтинг: 4.9 },
];

const peakHours = [
  { hour: "00:00", заказы: 12 },
  { hour: "04:00", заказы: 8 },
  { hour: "08:00", заказы: 45 },
  { hour: "12:00", заказы: 67 },
  { hour: "16:00", заказы: 52 },
  { hour: "20:00", заказы: 38 },
];

const regionDistribution = [
  { name: "Алматы", value: 145, color: "#3b82f6" },
  { name: "Нур-Султан", value: 98, color: "#8b5cf6" },
  { name: "Шымкент", value: 76, color: "#10b981" },
  { name: "Караганда", value: 54, color: "#f59e0b" },
];

export function Analytics() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-gray-900 dark:text-white">Аналитика и отчеты</h1>
          <p className="text-gray-600 dark:text-gray-400">Статистика и анализ работы системы</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-600">
            <Calendar className="w-5 h-5" />
            Выбрать период
          </button>
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700">
            <Download className="w-5 h-5" />
            Экспорт
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-600 dark:text-gray-400 text-sm">Всего заказов</p>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-3xl mt-2 text-gray-900 dark:text-white">1,808</p>
          <p className="text-sm text-green-600 mt-2">+15.3% к прошлому месяцу</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-600 dark:text-gray-400 text-sm">Выполнено</p>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-3xl mt-2 text-gray-900 dark:text-white">1,723</p>
          <p className="text-sm text-green-600 mt-2">95.3% успешности</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-600 dark:text-gray-400 text-sm">Среднее время</p>
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-3xl mt-2 text-gray-900 dark:text-white">23 мин</p>
          <p className="text-sm text-green-600 mt-2">-5% к прошлому месяцу</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-600 dark:text-gray-400 text-sm">Выручка</p>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-3xl mt-2 text-gray-900 dark:text-white">₸4.2M</p>
          <p className="text-sm text-green-600 mt-2">+18.7% к прошлому месяцу</p>
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl mb-4 text-gray-900 dark:text-white">Динамика заказов по месяцам</h2>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="заказы"
              stroke="#3b82f6"
              fillOpacity={1}
              fill="url(#colorOrders)"
            />
            <Line type="monotone" dataKey="выполнено" stroke="#10b981" strokeWidth={2} />
            <Line type="monotone" dataKey="отменено" stroke="#ef4444" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Driver Performance */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl mb-4 text-gray-900 dark:text-white">Топ водители</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={driverPerformance} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={80} />
              <Tooltip />
              <Bar dataKey="заказы" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Region Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl mb-4 text-gray-900 dark:text-white">Распределение по регионам</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={regionDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {regionDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Peak Hours */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl mb-4 text-gray-900 dark:text-white">Пиковые часы загруженности</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={peakHours}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="заказы"
              stroke="#f59e0b"
              strokeWidth={3}
              dot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl mb-4 text-gray-900 dark:text-white">Сводная таблица</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Метрика
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Сегодня
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Неделя
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Месяц
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Изменение
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">Всего заказов</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">89</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">523</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">1,808</td>
                <td className="px-6 py-4 text-green-600">+15.3%</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">Выполнено</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">82</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">498</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">1,723</td>
                <td className="px-6 py-4 text-green-600">+14.8%</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">Отменено</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">7</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">25</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">85</td>
                <td className="px-6 py-4 text-green-600">-2.1%</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">Новые пассажиры</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">3</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">18</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">76</td>
                <td className="px-6 py-4 text-green-600">+23.4%</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">Выручка (₸)</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">223,400</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">1,245,600</td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-100">4,187,200</td>
                <td className="px-6 py-4 text-green-600">+18.7%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}