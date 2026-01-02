import { useState } from "react";
import {
  Search,
  Filter,
  FileText,
  User,
  Clock,
  Activity,
  Shield,
  Phone,
  ShoppingCart,
  Car,
  Users,
} from "lucide-react";
import { Modal } from "./Modal";

interface LogEntry {
  id: string;
  timestamp: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
  action: string;
  category: "order" | "driver" | "passenger" | "user" | "call" | "system";
  description: string;
  details?: any;
  ipAddress?: string;
}

const mockLogs: LogEntry[] = [
  {
    id: "LOG001",
    timestamp: "2025-01-02 11:45:23",
    user: { id: "USR001", name: "Администратор", role: "admin" },
    action: "create_order",
    category: "order",
    description: "Создан заказ ORD001",
    details: {
      orderId: "ORD001",
      passengerId: "PS001",
      from: "ул. Абая 123",
      to: "пр. Достык 45",
    },
    ipAddress: "192.168.1.100",
  },
  {
    id: "LOG002",
    timestamp: "2025-01-02 11:42:15",
    user: { id: "OPR001", name: "Оператор 1", role: "operator" },
    action: "make_call",
    category: "call",
    description: "Исходящий звонок пассажиру Алия Карим",
    details: {
      callId: "CALL001",
      phone: "+7 777 111 2222",
      duration: "3:30",
    },
    ipAddress: "192.168.1.101",
  },
  {
    id: "LOG003",
    timestamp: "2025-01-02 11:40:00",
    user: { id: "DSP001", name: "Диспетчер 1", role: "dispatcher" },
    action: "assign_driver",
    category: "order",
    description: "Назначен водитель на заказ ORD002",
    details: {
      orderId: "ORD002",
      driverId: "DR001",
      driverName: "Асан Мукашев",
    },
    ipAddress: "192.168.1.102",
  },
  {
    id: "LOG004",
    timestamp: "2025-01-02 11:35:45",
    user: { id: "USR001", name: "Администратор", role: "admin" },
    action: "create_driver",
    category: "driver",
    description: "Добавлен новый водитель DR005",
    details: {
      driverId: "DR005",
      name: "Дмитрий Сергеев",
      car: "Nissan Teana",
      region: "Нур-Султан",
    },
    ipAddress: "192.168.1.100",
  },
  {
    id: "LOG005",
    timestamp: "2025-01-02 11:30:12",
    user: { id: "OPR002", name: "Оператор 2", role: "operator" },
    action: "update_order",
    category: "order",
    description: "Обновлен статус заказа ORD003",
    details: {
      orderId: "ORD003",
      oldStatus: "active_queue",
      newStatus: "assigned",
    },
    ipAddress: "192.168.1.103",
  },
  {
    id: "LOG006",
    timestamp: "2025-01-02 11:25:30",
    user: { id: "USR001", name: "Администратор", role: "admin" },
    action: "create_passenger",
    category: "passenger",
    description: "Зарегистрирован новый пассажир PS006",
    details: {
      passengerId: "PS006",
      name: "Анна Петрова",
      region: "Алматы",
      disability: "Категория I",
    },
    ipAddress: "192.168.1.100",
  },
  {
    id: "LOG007",
    timestamp: "2025-01-02 11:20:00",
    user: { id: "DSP001", name: "Диспетчер 1", role: "dispatcher" },
    action: "cancel_order",
    category: "order",
    description: "Отменен заказ ORD004",
    details: {
      orderId: "ORD004",
      reason: "Пассажир отменил",
    },
    ipAddress: "192.168.1.102",
  },
  {
    id: "LOG008",
    timestamp: "2025-01-02 11:15:45",
    user: { id: "USR001", name: "Администратор", role: "admin" },
    action: "update_settings",
    category: "system",
    description: "Обновлены системные настройки",
    details: {
      setting: "dispatch_radius",
      oldValue: "5 км",
      newValue: "7 км",
    },
    ipAddress: "192.168.1.100",
  },
];

export function Logs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [viewModal, setViewModal] = useState<string | null>(null);

  const filteredLogs = mockLogs.filter((log) => {
    const matchesSearch =
      log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || log.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const selectedLog = mockLogs.find((l) => l.id === viewModal);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "order":
        return ShoppingCart;
      case "driver":
        return Car;
      case "passenger":
        return Users;
      case "user":
        return User;
      case "call":
        return Phone;
      case "system":
        return Shield;
      default:
        return Activity;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "order":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "driver":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "passenger":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "user":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "call":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
      case "system":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "order":
        return "Заказ";
      case "driver":
        return "Водитель";
      case "passenger":
        return "Пассажир";
      case "user":
        return "Пользователь";
      case "call":
        return "Звонок";
      case "system":
        return "Система";
      default:
        return category;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl dark:text-white">Логи и аудит</h1>
          <p className="text-gray-600 dark:text-gray-400">
            История действий и системных событий
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Всего записей</p>
          </div>
          <p className="text-3xl dark:text-white">{mockLogs.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Заказы</p>
          </div>
          <p className="text-3xl dark:text-white">
            {mockLogs.filter((l) => l.category === "order").length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
              <Phone className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Звонки</p>
          </div>
          <p className="text-3xl dark:text-white">
            {mockLogs.filter((l) => l.category === "call").length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Система</p>
          </div>
          <p className="text-3xl dark:text-white">
            {mockLogs.filter((l) => l.category === "system").length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по описанию, пользователю или ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="all">Все категории</option>
              <option value="order">Заказы</option>
              <option value="driver">Водители</option>
              <option value="passenger">Пассажиры</option>
              <option value="user">Пользователи</option>
              <option value="call">Звонки</option>
              <option value="system">Система</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Время
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Пользователь
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Категория
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Описание
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  IP адрес
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredLogs.map((log) => {
                const Icon = getCategoryIcon(log.category);
                return (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm dark:text-white">
                      {log.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <Clock className="w-4 h-4" />
                        {log.timestamp}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="dark:text-white">{log.user.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {log.user.role}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${getCategoryColor(
                          log.category
                        )}`}
                      >
                        <Icon className="w-3 h-3" />
                        {getCategoryLabel(log.category)}
                      </span>
                    </td>
                    <td className="px-6 py-4 dark:text-white max-w-md">
                      {log.description}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {log.ipAddress || "-"}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setViewModal(log.id)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Подробнее"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Log Modal */}
      <Modal
        isOpen={viewModal !== null}
        onClose={() => setViewModal(null)}
        title="Детали лога"
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              {getCategoryIcon(selectedLog.category)({
                className: "w-12 h-12 text-gray-400",
              })}
              <div className="flex-1">
                <h3 className="text-xl dark:text-white">{selectedLog.description}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedLog.timestamp}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${getCategoryColor(
                  selectedLog.category
                )}`}
              >
                {getCategoryLabel(selectedLog.category)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">ID лога</p>
                <p className="dark:text-white">{selectedLog.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Действие</p>
                <p className="dark:text-white">{selectedLog.action}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Пользователь</p>
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <User className="w-10 h-10 text-gray-400" />
                <div>
                  <p className="dark:text-white">{selectedLog.user.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedLog.user.role} • ID: {selectedLog.user.id}
                  </p>
                </div>
              </div>
            </div>

            {selectedLog.ipAddress && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">IP адрес</p>
                <p className="dark:text-white">{selectedLog.ipAddress}</p>
              </div>
            )}

            {selectedLog.details && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Дополнительные детали
                </p>
                <pre className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm overflow-x-auto dark:text-white">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setViewModal(null)}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Pagination */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Показано {filteredLogs.length} из {mockLogs.length} записей
        </p>
        <div className="flex gap-2">
          <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white">
            Назад
          </button>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
            1
          </button>
          <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white">
            Далее
          </button>
        </div>
      </div>
    </div>
  );
}
