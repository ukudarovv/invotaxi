import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Clock, MapPin, User, Car, Phone, Check, X, Loader2, RefreshCw, Filter, Map as MapIcon, List, Eye, Zap, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { Modal } from "./Modal";
import { ordersApi, Order } from "../services/orders";
import { dispatchApi } from "../services/dispatch";
import { driversApi, Driver } from "../services/drivers";
import { regionsApi, Region } from "../services/regions";
import { toast } from "sonner";
import { getDispatchMapWebSocket } from "../services/websocket";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export function Dispatch() {
  const [queueOrdersData, setQueueOrdersData] = useState<Order[]>([]);
  const [activeOrdersData, setActiveOrdersData] = useState<Order[]>([]);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [orderDetailsModal, setOrderDetailsModal] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoAssignProgress, setAutoAssignProgress] = useState({ current: 0, total: 0 });
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');
  const [wsReconnectAttempts, setWsReconnectAttempts] = useState(0);
  
  // Фильтры и сортировка
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // Вид отображения (список/карта)
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  
  // Ref для polling
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isModalOpenRef = useRef(false);
  const wsRef = useRef<ReturnType<typeof getDispatchMapWebSocket> | null>(null);

  // Функция загрузки заказов
  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      const [queueData, activeData] = await Promise.all([
        ordersApi.getOrders({ status: "active_queue" }),
        ordersApi.getOrders({ status: "assigned,driver_en_route,ride_ongoing" }),
      ]);
      setQueueOrdersData(queueData);
      setActiveOrdersData(activeData);
      setLastUpdate(new Date());
    } catch (err: any) {
      setError(err.message || "Ошибка загрузки заказов");
      console.error("Ошибка загрузки заказов:", err);
    }
  }, []);

  // Загрузка водителей и регионов
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        await Promise.all([
          loadOrders(),
          driversApi.getDrivers().then(setAllDrivers),
          regionsApi.getRegions().then(setRegions),
        ]);
      } catch (err: any) {
        setError(err.message || "Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // WebSocket для обновления данных в реальном времени
  useEffect(() => {
    const ws = getDispatchMapWebSocket();
    wsRef.current = ws;

    // Обработчик обновления заказа
    ws.on("order_update", (data: any) => {
      // Обновляем заказы в очереди
      setQueueOrdersData((prev) => {
        const index = prev.findIndex((o) => o.id === data.id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        // Если заказ в статусе active_queue, добавляем его
        if (data.status === "active_queue") {
          return [...prev, data as Order];
        }
        // Если статус изменился и заказ больше не в очереди, удаляем его
        if (data.status !== "active_queue") {
          return prev.filter((o) => o.id !== data.id);
        }
        return prev;
      });

      // Обновляем активные заказы
      setActiveOrdersData((prev) => {
        const activeStatuses = ["assigned", "driver_en_route", "ride_ongoing"];
        const index = prev.findIndex((o) => o.id === data.id);
        
        if (index !== -1) {
          // Если статус изменился и заказ больше не активный, удаляем его
          if (!activeStatuses.includes(data.status)) {
            return prev.filter((o) => o.id !== data.id);
          }
          // Обновляем существующий заказ
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        // Если заказ стал активным, добавляем его
        if (activeStatuses.includes(data.status)) {
          return [...prev, data as Order];
        }
        return prev;
      });
      
      setLastUpdate(new Date());
    });

    // Обработчик создания нового заказа
    ws.on("order_created", (data: any) => {
      if (data.status === "active_queue") {
        setQueueOrdersData((prev) => [...prev, data as Order]);
        setLastUpdate(new Date());
      }
    });

    // Обработчик обновления локации водителя
    ws.on("driver_location_update", (data: any) => {
      setAllDrivers((prev) => {
        const index = prev.findIndex((d) => String(d.id) === String(data.driver_id));
        if (index !== -1) {
          // Обновляем существующего водителя
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            current_lat: data.lat,
            current_lon: data.lon,
            last_location_update: data.timestamp || new Date().toISOString(),
          };
          return updated;
        }
        // Если водителя нет в списке, добавляем его (если есть локация)
        if (data.lat && data.lon) {
          return [...prev, {
            id: parseInt(data.driver_id),
            user: {
              id: 0,
              username: '',
              phone: '',
            },
            name: data.name || 'Неизвестный водитель',
            car_model: data.car_model || '',
            plate_number: '',
            capacity: 4,
            is_online: data.is_online ?? true,
            current_lat: data.lat,
            current_lon: data.lon,
            last_location_update: data.timestamp || new Date().toISOString(),
          } as Driver];
        }
        return prev;
      });
      setLastUpdate(new Date());
    });

    // Обработчик обновления статуса водителя (онлайн/оффлайн)
    ws.on("driver_status_update", (data: any) => {
      setAllDrivers((prev) => {
        const index = prev.findIndex((d) => String(d.id) === String(data.driver_id));
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            is_online: data.is_online,
          };
          return updated;
        }
        return prev;
      });
      setLastUpdate(new Date());
    });

    // Обновляем статус подключения
    const updateStatus = () => {
      setWsStatus(ws.getConnectionStatus());
      setWsReconnectAttempts(ws.getReconnectAttempts());
    };
    
    // Обновляем статус при изменении
    const statusInterval = setInterval(updateStatus, 1000);
    updateStatus(); // Первоначальное обновление
    
    // Подключаемся к WebSocket
    ws.connect().catch((error) => {
      console.error("WebSocket connection error:", error);
      updateStatus();
      // Fallback на polling если WebSocket не работает
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          loadOrders();
        }, 8000);
      }
    });

    // Отключаемся при размонтировании
    return () => {
      clearInterval(statusInterval);
      ws.disconnect();
    };
  }, [loadOrders]);

  // Polling для обновления данных в реальном времени (fallback)
  useEffect(() => {
    // Используем polling только если WebSocket не подключен
    if (wsRef.current?.connected) return;
    
    // Останавливаем polling если модальное окно открыто
    if (isModalOpenRef.current) return;

    pollingIntervalRef.current = setInterval(() => {
      loadOrders();
    }, 8000); // Обновление каждые 8 секунд

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [loadOrders]);

  // Отслеживание открытия модальных окон
  useEffect(() => {
    isModalOpenRef.current = assignModal !== null || orderDetailsModal !== null;
  }, [assignModal, orderDetailsModal]);

  // Загрузка кандидатов при открытии модального окна назначения
  useEffect(() => {
    const loadCandidates = async () => {
      if (assignModal) {
        try {
          const data = await dispatchApi.getCandidates(assignModal);
          setCandidates(data.candidates || []);
        } catch (err: any) {
          console.error("Ошибка загрузки кандидатов:", err);
          toast.error("Ошибка загрузки кандидатов");
        }
      }
    };
    loadCandidates();
  }, [assignModal]);

  // Загрузка детальной информации о заказе
  useEffect(() => {
    const loadOrderDetails = async () => {
      if (orderDetailsModal) {
        try {
          const order = await ordersApi.getOrder(orderDetailsModal);
          setOrderDetails(order);
        } catch (err: any) {
          console.error("Ошибка загрузки деталей заказа:", err);
          toast.error("Ошибка загрузки деталей заказа");
        }
      }
    };
    loadOrderDetails();
  }, [orderDetailsModal]);

  // Фильтрация заказов
  const filteredQueueOrders = useMemo(() => {
    let filtered = [...queueOrdersData];

    // Фильтр по статусу
    if (statusFilter !== "all") {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    // Фильтр по региону
    if (regionFilter !== "all") {
      filtered = filtered.filter(order => order.passenger.region?.id === regionFilter);
    }

    // Фильтр по приоритету (если есть поле priority)
    if (priorityFilter !== "all") {
      // Предполагаем что priority может быть в order или вычисляется
      // Пока пропускаем, так как в Order интерфейсе нет поля priority
    }

    // Фильтр по времени
    if (timeFilter !== "all") {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      filtered = filtered.filter(order => {
        const orderDate = new Date(order.created_at);
        if (timeFilter === "today") {
          return orderDate >= today;
        } else if (timeFilter === "yesterday") {
          return orderDate >= yesterday && orderDate < today;
        }
        return true;
      });
    }

    // Сортировка
    filtered.sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === "created_at") {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortBy === "status") {
        comparison = a.status.localeCompare(b.status);
      } else if (sortBy === "passenger") {
        comparison = a.passenger.full_name.localeCompare(b.passenger.full_name);
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [queueOrdersData, statusFilter, regionFilter, priorityFilter, timeFilter, sortBy, sortOrder]);

  // Автоматическое назначение всех заказов
  const handleAutoAssignAll = async () => {
    if (queueOrdersData.length === 0) {
      toast.info("Нет заказов в очереди для назначения");
      return;
    }

    setAutoAssigning(true);
    setAutoAssignProgress({ current: 0, total: queueOrdersData.length });

    try {
      // Используем backend эндпоинт для массового назначения
      const result = await dispatchApi.autoAssignAll();
      
      setAutoAssigning(false);
      setAutoAssignProgress({ current: 0, total: 0 });

      // Обновляем список заказов
      await loadOrders();

      if (result.assigned > 0) {
        toast.success(`Успешно назначено: ${result.assigned} заказ(ов)`);
      }
      if (result.failed > 0) {
        toast.error(`Не удалось назначить: ${result.failed} заказ(ов)`);
        if (result.failed_orders && result.failed_orders.length > 0) {
          console.error("Ошибки назначения:", result.failed_orders);
        }
      }
      if (result.assigned === 0 && result.failed === 0) {
        toast.info(result.message || "Нет заказов для назначения");
      }
    } catch (err: any) {
      setAutoAssigning(false);
      setAutoAssignProgress({ current: 0, total: 0 });
      toast.error(err.message || "Ошибка автоматического назначения");
      console.error("Ошибка автоматического назначения:", err);
    }
  };

  const handleAssignOrder = async (orderId: string, driverId?: string) => {
    try {
      await dispatchApi.assignOrder(orderId, driverId);
      toast.success("Водитель успешно назначен");
      await loadOrders();
      setAssignModal(null);
      setSelectedDriver(null);
    } catch (err: any) {
      toast.error(err.message || "Ошибка назначения заказа");
      setError(err.message || "Ошибка назначения заказа");
    }
  };

  const selectedOrder = queueOrdersData.find((order) => order.id === assignModal);

  // Вычисление среднего времени ожидания
  const averageWaitTime = useMemo(() => {
    if (queueOrdersData.length === 0) return 0;
    const now = Date.now();
    const totalWait = queueOrdersData.reduce((sum, order) => {
      const orderTime = new Date(order.created_at).getTime();
      return sum + (now - orderTime);
    }, 0);
    return Math.round(totalWait / queueOrdersData.length / 1000 / 60); // в минутах
  }, [queueOrdersData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl dark:text-white">Диспетчеризация</h1>
              <p className="text-gray-600 dark:text-gray-400">Управление текущими заказами и назначение водителей</p>
            </div>
            {/* WebSocket Status Indicator */}
            <div className="flex items-center gap-2">
              {wsStatus === 'connected' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm">
                  <Wifi className="w-4 h-4" />
                  <span>Подключено</span>
                </div>
              )}
              {wsStatus === 'connecting' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Подключение...</span>
                </div>
              )}
              {wsStatus === 'disconnected' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400 rounded-lg text-sm">
                  <WifiOff className="w-4 h-4" />
                  <span>Отключено</span>
                </div>
              )}
              {wsStatus === 'error' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Ошибка подключения</span>
                  {wsReconnectAttempts > 0 && (
                    <span className="text-xs">({wsReconnectAttempts} попыток)</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadOrders}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
            title="Обновить данные"
          >
            <RefreshCw className="w-5 h-5" />
            Обновить
          </button>
          <button
            onClick={handleAutoAssignAll}
            disabled={autoAssigning || queueOrdersData.length === 0}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {autoAssigning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Назначение... ({autoAssignProgress.current}/{autoAssignProgress.total})
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Автоматическое назначение
              </>
            )}
          </button>
        </div>
      </div>

      {/* Индикатор последнего обновления */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Последнее обновление: {lastUpdate.toLocaleTimeString("ru-RU")}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">В очереди</p>
          <p className="text-3xl mt-2 text-orange-600 dark:text-orange-400">{loading ? "..." : queueOrdersData.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">В процессе</p>
          <p className="text-3xl mt-2 text-blue-600 dark:text-blue-400">{loading ? "..." : activeOrdersData.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Доступно водителей</p>
          <p className="text-3xl mt-2 text-green-600 dark:text-green-400">
            {loading ? "..." : allDrivers.filter(d => d.is_online).length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Среднее время ожидания</p>
          <p className="text-3xl mt-2 dark:text-white">{averageWaitTime} мин</p>
        </div>
      </div>

      {/* Фильтры и сортировка */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium dark:text-white">Фильтры:</span>
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
          >
            <option value="all">Все статусы</option>
            <option value="active_queue">В очереди</option>
            <option value="submitted">Отправлен</option>
            <option value="awaiting_dispatcher_decision">Ожидает решения</option>
          </select>

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
          >
            <option value="all">Все регионы</option>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.title}
              </option>
            ))}
          </select>

          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
          >
            <option value="all">Все время</option>
            <option value="today">Сегодня</option>
            <option value="yesterday">Вчера</option>
          </select>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm font-medium dark:text-white">Сортировка:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="created_at">По дате</option>
              <option value="status">По статусу</option>
              <option value="passenger">По пассажиру</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
                viewMode === "list"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              <List className="w-4 h-4" />
              Список
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
                viewMode === "map"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              <MapIcon className="w-4 h-4" />
              Карта
            </button>
          </div>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Queue Orders */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl mb-4 dark:text-white">Очередь заказов ({filteredQueueOrders.length})</h2>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="col-span-full flex items-center justify-center p-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Загрузка заказов...</span>
                </div>
              ) : filteredQueueOrders.length === 0 ? (
                <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
                  Нет заказов в очереди
                </div>
              ) : (
                filteredQueueOrders.map((order) => (
                  <div
                    key={order.id}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm text-gray-500 dark:text-gray-400">{order.id}</span>
                        </div>
                        <p className="flex items-center gap-2 dark:text-white">
                          <User className="w-4 h-4 text-gray-400" />
                          {order.passenger.full_name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                          <Phone className="w-4 h-4" />
                          {order.passenger.user.phone}
                        </p>
                        {order.passenger.region && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Регион: {order.passenger.region.title}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <Clock className="w-4 h-4" />
                        {new Date(order.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    <div className="space-y-2 mb-3">
                      <p className="text-sm flex items-start gap-2 dark:text-gray-300">
                        <MapPin className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                        <span>{order.pickup_title}</span>
                      </p>
                      <p className="text-sm flex items-start gap-2 dark:text-gray-300">
                        <MapPin className="w-4 h-4 text-red-600 dark:text-red-400 mt-1 flex-shrink-0" />
                        <span>{order.dropoff_title}</span>
                      </p>
                    </div>

                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                        {order.note || "Без примечаний"}
                      </span>
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                        {order.status}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setOrderDetailsModal(order.id)}
                        className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        Детали
                      </button>
                      <button
                        onClick={() => setAssignModal(order.id)}
                        className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                      >
                        Назначить
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Available Drivers */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl mb-4 dark:text-white">Доступные водители</h2>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  {assignModal ? "Загрузка кандидатов..." : "Выберите заказ для просмотра доступных водителей"}
                </p>
              ) : (
                candidates.map((driver) => (
                  <div
                    key={driver.driver_id}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-green-300 dark:hover:border-green-500 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xl">
                        {driver.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="dark:text-white">{driver.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Car className="w-4 h-4" />
                          {driver.car_model}
                        </p>
                      </div>
                      <span className={`text-sm flex items-center gap-1 ${
                        driver.is_online
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-400"
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          driver.is_online
                            ? "bg-green-600 dark:bg-green-400"
                            : "bg-gray-400"
                        }`} />
                        {driver.is_online ? "Онлайн" : "Офлайн"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Расстояние</p>
                        <p className="dark:text-white">
                          {driver.priority?.distance ? `${(driver.priority.distance / 1000).toFixed(1)} км` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Заказов</p>
                        <p className="dark:text-white">{driver.priority?.order_count || 0}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Регион</p>
                        <p className="dark:text-white">{driver.priority?.region_match ? "✓" : "✗"}</p>
                      </div>
                    </div>

                    <div className="mb-3">
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                        Вместимость: {driver.capacity}
                      </span>
                    </div>

                    <button
                      onClick={() => handleAssignOrder(assignModal!, String(driver.driver_id))}
                      disabled={!assignModal || !driver.is_online}
                      className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Назначить
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Map View */
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl mb-4 dark:text-white">Карта заказов и водителей</h2>
          <div className="w-full h-[600px] rounded-lg overflow-hidden">
            <DispatchMap
              orders={filteredQueueOrders}
              activeOrders={activeOrdersData}
              drivers={allDrivers.filter(d => d.is_online && d.current_lat && d.current_lon)}
              onOrderClick={(orderId) => setOrderDetailsModal(orderId)}
            />
          </div>
        </div>
      )}

      {/* Active Orders */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl mb-4 dark:text-white">Активные заказы</h2>
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">Загрузка...</span>
          </div>
        ) : activeOrdersData.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">Нет активных заказов</p>
        ) : (
          <div className="space-y-4">
            {activeOrdersData.map((order) => (
              <div
                key={order.id}
                className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-500 transition-colors cursor-pointer"
                onClick={() => setOrderDetailsModal(order.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{order.id}</span>
                    <p className="mt-1 dark:text-white">
                      <strong>{order.passenger.full_name}</strong> → <strong>{order.driver?.name || "Не назначен"}</strong>
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-sm">
                    {order.status}
                  </span>
                </div>

                <div className="space-y-2 mb-3">
                  <p className="text-sm flex items-start gap-2 dark:text-gray-300">
                    <MapPin className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                    <span>{order.pickup_title}</span>
                  </p>
                  <p className="text-sm flex items-start gap-2 dark:text-gray-300">
                    <MapPin className="w-4 h-4 text-red-600 dark:text-red-400 mt-1 flex-shrink-0" />
                    <span>{order.dropoff_title}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign Driver Modal */}
      <Modal
        isOpen={assignModal !== null}
        onClose={() => {
          setAssignModal(null);
          setSelectedDriver(null);
        }}
        title="Назначить водителя на заказ"
        size="md"
        footer={
          <>
            <button
              onClick={() => {
                setAssignModal(null);
                setSelectedDriver(null);
              }}
              className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => selectedDriver && assignModal && handleAssignOrder(assignModal, selectedDriver)}
              disabled={!selectedDriver}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-5 h-5" />
              Назначить
            </button>
          </>
        }
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Заказ</p>
              <div className="space-y-2">
                <p className="dark:text-white">
                  <strong>{selectedOrder.id}</strong> - {selectedOrder.passenger.full_name}
                </p>
                <div className="text-sm space-y-1">
                  <p className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{selectedOrder.pickup_title}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{selectedOrder.dropoff_title}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                    {selectedOrder.note || "Без примечаний"}
                  </span>
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                    {selectedOrder.status}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">Выберите водителя</p>
              {candidates.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">Загрузка кандидатов...</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {candidates.map((driver) => (
                    <button
                      key={driver.driver_id}
                      onClick={() => setSelectedDriver(String(driver.driver_id))}
                      disabled={!driver.is_online}
                      className={`w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedDriver === String(driver.driver_id)
                          ? "border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/20"
                          : "border-gray-200 dark:border-gray-600"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        {driver.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="dark:text-white">{driver.name}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <span className="flex items-center gap-1">
                            <Car className="w-3 h-3" />
                            {driver.car_model}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 mt-1">
                          <span>{driver.priority?.distance ? `${(driver.priority.distance / 1000).toFixed(1)} км` : "—"}</span>
                          <span>Заказов: {driver.priority?.order_count || 0}</span>
                          <span>{driver.priority?.region_match ? "✓ Регион" : "✗ Регион"}</span>
                        </div>
                      </div>
                      {selectedDriver === String(driver.driver_id) && (
                        <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Order Details Modal */}
      <Modal
        isOpen={orderDetailsModal !== null}
        onClose={() => {
          setOrderDetailsModal(null);
          setOrderDetails(null);
        }}
        title="Детали заказа"
        size="lg"
        footer={
          <button
            onClick={() => {
              setOrderDetailsModal(null);
              setOrderDetails(null);
            }}
            className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Закрыть
          </button>
        }
      >
        {orderDetails ? (
          <div className="space-y-6">
            {/* Пассажир */}
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <h3 className="font-semibold dark:text-white mb-3">Информация о пассажире</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Имя:</span>
                  <p className="dark:text-white font-medium">{orderDetails.passenger.full_name}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Телефон:</span>
                  <p className="dark:text-white font-medium">{orderDetails.passenger.user.phone}</p>
                </div>
                {orderDetails.passenger.user.email && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Email:</span>
                    <p className="dark:text-white font-medium">{orderDetails.passenger.user.email}</p>
                  </div>
                )}
                {orderDetails.passenger.region && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Регион:</span>
                    <p className="dark:text-white font-medium">{orderDetails.passenger.region.title}</p>
                  </div>
                )}
                {orderDetails.passenger.disability_category && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Категория инвалидности:</span>
                    <p className="dark:text-white font-medium">{orderDetails.passenger.disability_category}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Сопровождение:</span>
                  <p className="dark:text-white font-medium">{orderDetails.has_companion ? "Требуется" : "Не требуется"}</p>
                </div>
              </div>
            </div>

            {/* Адреса */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <h3 className="font-semibold dark:text-white mb-3">Адреса</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Место забора:</p>
                  <p className="dark:text-white">{orderDetails.pickup_title}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Координаты: {orderDetails.pickup_lat.toFixed(6)}, {orderDetails.pickup_lon.toFixed(6)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Место доставки:</p>
                  <p className="dark:text-white">{orderDetails.dropoff_title}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Координаты: {orderDetails.dropoff_lat.toFixed(6)}, {orderDetails.dropoff_lon.toFixed(6)}
                  </p>
                </div>
                {orderDetails.distance_km && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Расстояние:</p>
                    <p className="dark:text-white font-medium">{orderDetails.distance_km.toFixed(2)} км</p>
                  </div>
                )}
              </div>
            </div>

            {/* Водитель */}
            {orderDetails.driver && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="font-semibold dark:text-white mb-3">Назначенный водитель</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Имя:</span>
                    <p className="dark:text-white font-medium">{orderDetails.driver.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Телефон:</span>
                    <p className="dark:text-white font-medium">{orderDetails.driver.user.phone}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Машина:</span>
                    <p className="dark:text-white font-medium">{orderDetails.driver.car_model}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Номер:</span>
                    <p className="dark:text-white font-medium">{orderDetails.driver.plate_number}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Цена */}
            {(orderDetails.estimated_price || orderDetails.final_price) && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <h3 className="font-semibold dark:text-white mb-3">Информация о цене</h3>
                <div className="space-y-2 text-sm">
                  {orderDetails.final_price ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Финальная цена:</span>
                      <span className="dark:text-white font-bold text-lg">{orderDetails.final_price} тг</span>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Предварительная цена:</span>
                      <span className="dark:text-white font-bold">{orderDetails.estimated_price} тг</span>
                    </div>
                  )}
                  {orderDetails.price_breakdown && (
                    <div className="mt-3 pt-3 border-t border-yellow-200 dark:border-yellow-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Детализация:</p>
                      {Object.entries(orderDetails.price_breakdown).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-gray-600 dark:text-gray-300">{key}:</span>
                          <span className="dark:text-white">{value} тг</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Статус и время */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <h3 className="font-semibold dark:text-white mb-3">Статус и время</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Статус:</span>
                  <p className="dark:text-white font-medium">{orderDetails.status}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Создан:</span>
                  <p className="dark:text-white">{new Date(orderDetails.created_at).toLocaleString("ru-RU")}</p>
                </div>
                {orderDetails.assigned_at && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Назначен:</span>
                    <p className="dark:text-white">{new Date(orderDetails.assigned_at).toLocaleString("ru-RU")}</p>
                  </div>
                )}
                {orderDetails.completed_at && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Завершен:</span>
                    <p className="dark:text-white">{new Date(orderDetails.completed_at).toLocaleString("ru-RU")}</p>
                  </div>
                )}
                {orderDetails.assignment_reason && (
                  <div className="col-span-2">
                    <span className="text-gray-500 dark:text-gray-400">Причина назначения:</span>
                    <p className="dark:text-white">{orderDetails.assignment_reason}</p>
                  </div>
                )}
                {orderDetails.note && (
                  <div className="col-span-2">
                    <span className="text-gray-500 dark:text-gray-400">Примечание:</span>
                    <p className="dark:text-white">{orderDetails.note}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        )}
      </Modal>
    </div>
  );
}

// Компонент карты для диспетчеризации
interface DispatchMapProps {
  orders: Order[];
  activeOrders: Order[];
  drivers: Driver[];
  onOrderClick: (orderId: string) => void;
}

// Функция для плавной анимации перемещения маркера
function animateMarker(marker: L.Marker, newPos: [number, number], duration: number = 1000): void {
  const startPos = marker.getLatLng();
  const startTime = Date.now();
  
  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Используем easing функцию для плавности
    const easeProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    
    const lat = startPos.lat + (newPos[0] - startPos.lat) * easeProgress;
    const lng = startPos.lng + (newPos[1] - startPos.lng) * easeProgress;
    
    marker.setLatLng([lat, lng]);
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
}

// Функция для визуальной индикации обновления маркера
function highlightMarker(marker: L.Marker, duration: number = 500): void {
  const element = marker.getElement();
  if (!element) return;
  
  // Добавляем класс для подсветки
  element.style.transition = `transform ${duration}ms ease-in-out`;
  element.style.transform = 'scale(1.3)';
  element.style.zIndex = '1000';
  
  setTimeout(() => {
    if (element) {
      element.style.transform = 'scale(1)';
      setTimeout(() => {
        if (element) {
          element.style.zIndex = '';
        }
      }, duration);
    }
  }, duration);
}

function DispatchMap({ orders, activeOrders, drivers, onOrderClick }: DispatchMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const orderMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const driverMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const previousDataRef = useRef<{ orders: Set<string>, activeOrders: Set<string>, drivers: Set<string> }>({
    orders: new Set(),
    activeOrders: new Set(),
    drivers: new Set(),
  });

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Центр карты - средняя точка всех заказов или по умолчанию
    const allOrders = [...orders, ...activeOrders];
    const centerLat = allOrders.length > 0
      ? allOrders.reduce((sum, o) => sum + o.pickup_lat, 0) / allOrders.length
      : 55.7558;
    const centerLon = allOrders.length > 0
      ? allOrders.reduce((sum, o) => sum + o.pickup_lon, 0) / allOrders.length
      : 37.6173;

    mapInstanceRef.current = L.map(mapRef.current).setView([centerLat, centerLon], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(mapInstanceRef.current);
  }, []);

  // Обновление маркеров заказов
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const currentOrderIds = new Set<string>();
    const allOrders = [...orders, ...activeOrders];

    // Обновляем или создаем маркеры для заказов
    allOrders.forEach(order => {
      const orderId = String(order.id);
      currentOrderIds.add(orderId);
      
      const existingMarker = orderMarkersRef.current.get(orderId);
      const isActiveOrder = activeOrders.some(o => String(o.id) === orderId);
      
      // Определяем цвет маркера
      const iconColor = isActiveOrder ? 'blue' : 'orange';
      const iconUrl = `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${iconColor}.png`;

      if (existingMarker) {
        // Обновляем существующий маркер
        const currentPos = existingMarker.getLatLng();
        const newPos: [number, number] = [order.pickup_lat, order.pickup_lon];
        let wasUpdated = false;
        
        // Обновляем позицию только если она изменилась
        if (Math.abs(currentPos.lat - newPos[0]) > 0.0001 || Math.abs(currentPos.lng - newPos[1]) > 0.0001) {
          existingMarker.setLatLng(newPos);
          wasUpdated = true;
        }

        // Обновляем иконку если статус изменился
        const currentIconUrl = (existingMarker.options.icon as L.Icon)?.options.iconUrl || '';
        if (!currentIconUrl.includes(iconColor)) {
          existingMarker.setIcon(L.icon({
            iconUrl,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
          }));
          wasUpdated = true;
        }

        // Визуальная индикация обновления
        if (wasUpdated) {
          highlightMarker(existingMarker);
        }

        // Обновляем popup
        const popupContent = isActiveOrder
          ? `
            <div style="min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-weight: 600;">Активный заказ ${order.id}</h3>
              <p style="margin: 4px 0; font-size: 12px;">Пассажир: ${order.passenger?.full_name || 'Не указан'}</p>
              <p style="margin: 4px 0; font-size: 12px;">Водитель: ${order.driver?.name || 'Не назначен'}</p>
              <p style="margin: 4px 0; font-size: 12px;">Статус: ${order.status}</p>
            </div>
          `
          : `
            <div style="min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-weight: 600;">Заказ ${order.id}</h3>
              <p style="margin: 4px 0; font-size: 12px;">Пассажир: ${order.passenger?.full_name || 'Не указан'}</p>
              <p style="margin: 4px 0; font-size: 12px;">От: ${order.pickup_title}</p>
              <p style="margin: 4px 0; font-size: 12px;">До: ${order.dropoff_title}</p>
              <button onclick="window.dispatchEvent(new CustomEvent('orderClick', {detail: '${order.id}'}))" 
                      style="margin-top: 8px; padding: 4px 8px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Детали
              </button>
            </div>
          `;
        existingMarker.setPopupContent(popupContent);
      } else {
        // Создаем новый маркер
        const marker = L.marker([order.pickup_lat, order.pickup_lon], {
          icon: L.icon({
            iconUrl,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
          })
        }).addTo(mapInstanceRef.current);

        const popupContent = isActiveOrder
          ? `
            <div style="min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-weight: 600;">Активный заказ ${order.id}</h3>
              <p style="margin: 4px 0; font-size: 12px;">Пассажир: ${order.passenger?.full_name || 'Не указан'}</p>
              <p style="margin: 4px 0; font-size: 12px;">Водитель: ${order.driver?.name || 'Не назначен'}</p>
              <p style="margin: 4px 0; font-size: 12px;">Статус: ${order.status}</p>
            </div>
          `
          : `
            <div style="min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-weight: 600;">Заказ ${order.id}</h3>
              <p style="margin: 4px 0; font-size: 12px;">Пассажир: ${order.passenger?.full_name || 'Не указан'}</p>
              <p style="margin: 4px 0; font-size: 12px;">От: ${order.pickup_title}</p>
              <p style="margin: 4px 0; font-size: 12px;">До: ${order.dropoff_title}</p>
              <button onclick="window.dispatchEvent(new CustomEvent('orderClick', {detail: '${order.id}'}))" 
                      style="margin-top: 8px; padding: 4px 8px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Детали
              </button>
            </div>
          `;

        marker.bindPopup(popupContent);
        marker.on('click', () => {
          onOrderClick(order.id);
        });

        orderMarkersRef.current.set(orderId, marker);
      }
    });

    // Удаляем маркеры заказов, которых больше нет
    previousDataRef.current.orders.forEach(orderId => {
      if (!currentOrderIds.has(orderId)) {
        const marker = orderMarkersRef.current.get(orderId);
        if (marker) {
          // Плавное удаление маркера с анимацией
          const element = marker.getElement();
          if (element) {
            element.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
            element.style.opacity = '0';
            element.style.transform = 'scale(0.5)';
            setTimeout(() => {
              marker.remove();
              orderMarkersRef.current.delete(orderId);
            }, 300);
          } else {
            marker.remove();
            orderMarkersRef.current.delete(orderId);
          }
        }
      }
    });

    previousDataRef.current.orders = currentOrderIds;
  }, [orders, activeOrders, onOrderClick]);

  // Обновление маркеров водителей
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const currentDriverIds = new Set<string>();
    const onlineDrivers = drivers.filter(d => d.is_online && d.current_lat && d.current_lon);

    onlineDrivers.forEach(driver => {
      const driverId = String(driver.id);
      currentDriverIds.add(driverId);
      
      const existingMarker = driverMarkersRef.current.get(driverId);
      const newPos: [number, number] = [driver.current_lat!, driver.current_lon!];

      if (existingMarker) {
        // Обновляем позицию с анимацией
        const currentPos = existingMarker.getLatLng();
        const distance = Math.sqrt(
          Math.pow(currentPos.lat - newPos[0], 2) + 
          Math.pow(currentPos.lng - newPos[1], 2)
        );

        // Если расстояние больше минимального порога, анимируем перемещение
        if (distance > 0.0001) {
          // Используем плавную анимацию перемещения маркера
          animateMarker(existingMarker, newPos, 1000); // 1 секунда для плавной анимации
        }

        // Обновляем popup
        const popupContent = `
          <div style="min-width: 150px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 600;">${driver.name}</h3>
            <p style="margin: 4px 0; font-size: 12px;">Машина: ${driver.car_model}</p>
            <p style="margin: 4px 0; font-size: 12px;">Регион: ${driver.region?.title || 'Не указан'}</p>
            <p style="margin: 4px 0; font-size: 12px;">Статус: ${driver.is_online ? 'Онлайн' : 'Оффлайн'}</p>
          </div>
        `;
        existingMarker.setPopupContent(popupContent);
      } else {
        // Создаем новый маркер водителя
        const marker = L.marker(newPos, {
          icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
          })
        }).addTo(mapInstanceRef.current);

        const popupContent = `
          <div style="min-width: 150px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 600;">${driver.name}</h3>
            <p style="margin: 4px 0; font-size: 12px;">Машина: ${driver.car_model}</p>
            <p style="margin: 4px 0; font-size: 12px;">Регион: ${driver.region?.title || 'Не указан'}</p>
            <p style="margin: 4px 0; font-size: 12px;">Статус: ${driver.is_online ? 'Онлайн' : 'Оффлайн'}</p>
          </div>
        `;

        marker.bindPopup(popupContent);
        driverMarkersRef.current.set(driverId, marker);
      }
    });

    // Удаляем маркеры водителей, которые больше не онлайн или не имеют локации
    previousDataRef.current.drivers.forEach(driverId => {
      if (!currentDriverIds.has(driverId)) {
        const marker = driverMarkersRef.current.get(driverId);
        if (marker) {
          marker.remove();
          driverMarkersRef.current.delete(driverId);
        }
      }
    });

    previousDataRef.current.drivers = currentDriverIds;
  }, [drivers]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      orderMarkersRef.current.forEach(marker => marker.remove());
      driverMarkersRef.current.forEach(marker => marker.remove());
      orderMarkersRef.current.clear();
      driverMarkersRef.current.clear();
    };
  }, []);

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}
