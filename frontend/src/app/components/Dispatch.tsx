import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Clock, MapPin, User, Car, Phone, Check, X, Loader2, RefreshCw, Filter, Map as MapIcon, List, Eye, Zap, Wifi, WifiOff, AlertCircle, Calendar, Navigation, Users } from "lucide-react";
import { Modal } from "./Modal";
import { RouteMapView } from "./RouteMapView";
import { ordersApi, Order } from "../services/orders";
import { dispatchApi } from "../services/dispatch";
import { driversApi, Driver } from "../services/drivers";
import { regionsApi, Region, City } from "../services/regions";
import { toast } from "sonner";
import { getDispatchMapWebSocket } from "../services/websocket";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Импортируем leaflet.markercluster
import "leaflet.markercluster";

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
  const [cities, setCities] = useState<City[]>([]);
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
  
  // Фильтры для карты
  const [mapCityFilter, setMapCityFilter] = useState<string>("all");
  const [mapRegionFilter, setMapRegionFilter] = useState<string>("all");
  const [mapOrderStatusFilter, setMapOrderStatusFilter] = useState<string[]>([]);
  const [mapDriverStatusFilter, setMapDriverStatusFilter] = useState<string>("all"); // all, online, offline
  const [showOrders, setShowOrders] = useState<boolean>(true);
  const [showDrivers, setShowDrivers] = useState<boolean>(true);
  const [showRoutes, setShowRoutes] = useState<boolean>(true);
  const [showCities, setShowCities] = useState<boolean>(true);
  const [showRegions, setShowRegions] = useState<boolean>(true);
  
  // Ref для polling
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isModalOpenRef = useRef(false);
  const wsRef = useRef<ReturnType<typeof getDispatchMapWebSocket> | null>(null);
  
  // Дебаунсинг для обновлений локаций
  const locationUpdateTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingLocationUpdatesRef = useRef<Map<string, any>>(new Map());

  // Функция загрузки заказов
  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      console.log("Начинаем загрузку заказов...");
      
      // Загружаем заказы, требующие внимания диспетчера:
      // - submitted, awaiting_dispatcher_decision, active_queue - требуют назначения водителя
      // - assigned, driver_en_route, ride_ongoing - активные заказы с водителем
      const [queueData, activeData] = await Promise.all([
        ordersApi.getOrders({ status: "submitted,awaiting_dispatcher_decision,active_queue" }),
        ordersApi.getOrders({ status: "assigned,driver_en_route,ride_ongoing" }),
      ]);
      
      console.log("Загружено заказов в очереди:", queueData?.length || 0, queueData);
      console.log("Загружено активных заказов:", activeData?.length || 0, activeData);
      
      setQueueOrdersData(Array.isArray(queueData) ? queueData : []);
      setActiveOrdersData(Array.isArray(activeData) ? activeData : []);
      setLastUpdate(new Date());
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || "Ошибка загрузки заказов";
      setError(errorMessage);
      console.error("Ошибка загрузки заказов:", err);
      console.error("Детали ошибки:", err?.response?.data);
      // Устанавливаем пустые массивы в случае ошибки
      setQueueOrdersData([]);
      setActiveOrdersData([]);
    }
  }, []);

  // Загрузка водителей, регионов и городов
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        await Promise.all([
          loadOrders(),
          driversApi.getDrivers().then(setAllDrivers),
          regionsApi.getRegions().then(setRegions),
          regionsApi.getCities().then(setCities),
        ]);
      } catch (err: any) {
        setError(err.message || "Ошибка загрузки данных");
        console.error("Ошибка загрузки данных:", err);
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
      // Статусы заказов в очереди (требуют назначения водителя)
      const queueStatuses = ["submitted", "awaiting_dispatcher_decision", "active_queue"];
      
      // Обновляем заказы в очереди
      setQueueOrdersData((prev) => {
        const index = prev.findIndex((o) => o.id === data.id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          // Если статус изменился и заказ больше не в очереди, удаляем его
          if (!queueStatuses.includes(data.status)) {
            return prev.filter((o) => o.id !== data.id);
          }
          return updated;
        }
        // Если заказ в статусе очереди, добавляем его
        if (queueStatuses.includes(data.status)) {
          return [...prev, data as Order];
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
      const queueStatuses = ["submitted", "awaiting_dispatcher_decision", "active_queue"];
      if (queueStatuses.includes(data.status)) {
        setQueueOrdersData((prev) => [...prev, data as Order]);
        setLastUpdate(new Date());
      }
    });

    // Обработчик обновления локации водителя с дебаунсингом
    ws.on("driver_location_update", (data: any) => {
      const driverId = String(data.driver_id);
      
      // Сохраняем последнее обновление
      pendingLocationUpdatesRef.current.set(driverId, data);
      
      // Очищаем предыдущий таймаут для этого водителя
      const existingTimeout = locationUpdateTimeoutRef.current.get(driverId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      
      // Устанавливаем новый таймаут (дебаунсинг 500ms)
      const timeout = setTimeout(() => {
        const updateData = pendingLocationUpdatesRef.current.get(driverId);
        if (!updateData) return;
        
        setAllDrivers((prev) => {
          const index = prev.findIndex((d) => String(d.id) === driverId);
          if (index !== -1) {
            // Обновляем существующего водителя
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              current_lat: updateData.lat,
              current_lon: updateData.lon,
              last_location_update: updateData.timestamp || new Date().toISOString(),
              eta: updateData.eta, // Добавляем ETA если есть
            };
            return updated;
          }
          // Если водителя нет в списке, добавляем его (если есть локация)
          if (updateData.lat && updateData.lon) {
            return [...prev, {
              id: parseInt(driverId),
              user: {
                id: 0,
                username: '',
                phone: '',
              },
              name: updateData.name || 'Неизвестный водитель',
              car_model: updateData.car_model || '',
              plate_number: '',
              capacity: 4,
              is_online: updateData.is_online ?? true,
              current_lat: updateData.lat,
              current_lon: updateData.lon,
              last_location_update: updateData.timestamp || new Date().toISOString(),
              eta: updateData.eta,
            } as Driver];
          }
          return prev;
        });
        setLastUpdate(new Date());
        
        // Очищаем обработанное обновление
        pendingLocationUpdatesRef.current.delete(driverId);
        locationUpdateTimeoutRef.current.delete(driverId);
      }, 500);
      
      locationUpdateTimeoutRef.current.set(driverId, timeout);
    });
    
    // Обработчик обновления ETA
    ws.on("driver_eta_update", (data: any) => {
      setAllDrivers((prev) => {
        const index = prev.findIndex((d) => String(d.id) === String(data.driver_id));
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            eta: data,
          };
          return updated;
        }
        return prev;
      });
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
      // Очищаем все таймауты дебаунсинга
      locationUpdateTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
      locationUpdateTimeoutRef.current.clear();
      pendingLocationUpdatesRef.current.clear();
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
    // Используем отфильтрованные заказы для назначения
    const ordersToAssign = filteredQueueOrders.filter(order => 
      order.status === "submitted" || 
      order.status === "awaiting_dispatcher_decision" || 
      order.status === "active_queue"
    );

    if (ordersToAssign.length === 0) {
      toast.info("Нет заказов в очереди для назначения");
      return;
    }

    setAutoAssigning(true);
    setAutoAssignProgress({ current: 0, total: ordersToAssign.length });

    try {
      let assigned = 0;
      let failed = 0;
      const failedOrders: string[] = [];

      // Назначаем заказы по одному
      for (let i = 0; i < ordersToAssign.length; i++) {
        const order = ordersToAssign[i];
        setAutoAssignProgress({ current: i + 1, total: ordersToAssign.length });
        
        try {
          // Сначала переводим заказ в active_queue, если он еще не там
          if (order.status !== "active_queue") {
            try {
              await ordersApi.updateOrderStatus(order.id, {
                status: "active_queue",
                reason: "Автоматический перевод в очередь для назначения"
              });
            } catch (statusErr: any) {
              console.warn(`Не удалось перевести заказ ${order.id} в очередь:`, statusErr);
            }
          }

          // Назначаем заказ автоматически (без указания водителя)
          const result = await dispatchApi.assignOrder(order.id);
          
          // Проверяем результат назначения
          if (result.success && result.driver_id) {
            assigned++;
          } else {
            failed++;
            const errorMsg = result.rejection_reason || result.reason || "Не удалось назначить водителя";
            failedOrders.push(`${order.id}: ${errorMsg}`);
            console.warn(`Не удалось назначить заказ ${order.id}:`, errorMsg);
          }
          
          // Небольшая задержка между назначениями
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err: any) {
          failed++;
          // Извлекаем детальное сообщение об ошибке
          const errorMessage = err.response?.data?.rejection_reason || 
                              err.response?.data?.reason ||
                              err.message || 
                              "Ошибка назначения";
          failedOrders.push(`${order.id}: ${errorMessage}`);
          console.error(`Ошибка назначения заказа ${order.id}:`, err);
        }
      }
      
      setAutoAssigning(false);
      setAutoAssignProgress({ current: 0, total: 0 });

      // Обновляем список заказов
      await loadOrders();

      if (assigned > 0) {
        toast.success(`Успешно назначено: ${assigned} заказ(ов)`);
      }
      if (failed > 0) {
        toast.error(`Не удалось назначить: ${failed} заказ(ов)`);
        if (failedOrders.length > 0) {
          console.error("Ошибки назначения:", failedOrders);
        }
      }
      if (assigned === 0 && failed === 0) {
        toast.info("Нет заказов для назначения");
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
      const result = await dispatchApi.assignOrder(orderId, driverId);
      
      // Проверяем результат назначения
      if (result.success && result.driver_id) {
        toast.success("Водитель успешно назначен");
        await loadOrders();
        setAssignModal(null);
        setSelectedDriver(null);
      } else {
        const errorMsg = result.rejection_reason || result.reason || "Не удалось назначить водителя";
        toast.error(errorMsg);
        setError(errorMsg);
      }
    } catch (err: any) {
      // Извлекаем детальное сообщение об ошибке
      const errorMessage = err.response?.data?.rejection_reason || 
                          err.response?.data?.reason ||
                          err.message || 
                          "Ошибка назначения заказа";
      toast.error(errorMessage);
      setError(errorMessage);
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
            disabled={autoAssigning || filteredQueueOrders.length === 0}
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

      {/* Индикатор последнего обновления и ошибки */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Последнее обновление: {lastUpdate.toLocaleTimeString("ru-RU")}
        </div>
        {error && (
          <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded">
            ⚠️ {error}
          </div>
        )}
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
        <div className="space-y-6">
          {/* Queue Orders */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl dark:text-white">Очередь заказов ({filteredQueueOrders.length})</h2>
              {filteredQueueOrders.length > 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Требуют назначения водителя
                </span>
              )}
            </div>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="col-span-full flex items-center justify-center p-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Загрузка заказов...</span>
                </div>
              ) : filteredQueueOrders.length === 0 ? (
                <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
                  {queueOrdersData.length === 0 ? (
                    <div>
                      <p className="mb-2 text-lg">Нет заказов в очереди</p>
                      <p className="text-sm mb-4">Для тестирования диспетчеризации создайте заказы в разделе "Заказы"</p>
                      {error && (
                        <p className="text-sm text-red-500 dark:text-red-400 mt-2">Ошибка: {error}</p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="mb-2">Нет заказов, соответствующих фильтрам</p>
                      <p className="text-sm">Всего заказов в очереди: {queueOrdersData.length}</p>
                    </div>
                  )}
                </div>
              ) : (
                filteredQueueOrders.map((order) => {
                  // Вычисляем время ожидания
                  const waitTime = Math.round((Date.now() - new Date(order.created_at).getTime()) / 1000 / 60);
                  const waitTimeHours = Math.floor(waitTime / 60);
                  const waitTimeMinutes = waitTime % 60;
                  const waitTimeText = waitTimeHours > 0 
                    ? `${waitTimeHours} ч ${waitTimeMinutes} мин`
                    : `${waitTimeMinutes} мин`;

                  return (
                    <div
                      key={order.id}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-mono text-gray-500 dark:text-gray-400">#{order.id.split('_')[1] || order.id}</span>
                            <span className={`text-xs px-2 py-1 rounded ${
                              waitTime > 30 
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                : waitTime > 15
                                ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                                : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            }`}>
                              Ожидание: {waitTimeText}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <User className="w-4 h-4 text-gray-400" />
                            <p className="dark:text-white font-medium">{order.passenger.full_name}</p>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            {order.passenger.user.phone}
                          </p>
                          {order.passenger.region && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {order.passenger.region.title}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                            <Clock className="w-4 h-4" />
                            {new Date(order.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          {order.desired_pickup_time && (
                            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                              <Calendar className="w-3 h-3" />
                              {new Date(order.desired_pickup_time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                          <MapPin className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Откуда</p>
                            <p className="text-sm dark:text-gray-300">{order.pickup_title}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                          <MapPin className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Куда</p>
                            <p className="text-sm dark:text-gray-300">{order.dropoff_title}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {order.has_companion && (
                          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            С сопровождением
                          </span>
                        )}
                        {order.seats_needed > 1 && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                            Мест: {order.seats_needed}
                          </span>
                        )}
                        {order.distance_km && (
                          <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded flex items-center gap-1">
                            <Navigation className="w-3 h-3" />
                            {order.distance_km.toFixed(1)} км
                          </span>
                        )}
                        {order.note && (
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded" title={order.note}>
                            {order.note.length > 30 ? order.note.substring(0, 30) + "..." : order.note}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setOrderDetailsModal(order.id)}
                          className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2 text-sm"
                        >
                          <Eye className="w-4 h-4" />
                          Детали
                        </button>
                        <button
                          onClick={() => setAssignModal(order.id)}
                          className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-sm font-medium"
                        >
                          Назначить водителя
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Orders */}
          {activeOrdersData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl dark:text-white">Активные заказы ({activeOrdersData.length})</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  В процессе выполнения
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeOrdersData.map((order) => {
                  const getStatusLabel = (status: string) => {
                    const labels: Record<string, string> = {
                      assigned: "Назначен",
                      driver_en_route: "Водитель в пути",
                      ride_ongoing: "Поездка началась",
                    };
                    return labels[status] || status;
                  };

                  const getStatusColor = (status: string) => {
                    const colors: Record<string, string> = {
                      assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
                      driver_en_route: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                      ride_ongoing: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                    };
                    return colors[status] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
                  };

                  return (
                    <div
                      key={order.id}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-500 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <span className="text-sm font-mono text-gray-500 dark:text-gray-400">#{order.id.split('_')[1] || order.id}</span>
                          <p className="dark:text-white font-medium mt-1">{order.passenger.full_name}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </div>
                      
                      {order.driver && (
                        <div className="mb-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Водитель</p>
                          <p className="text-sm dark:text-white flex items-center gap-1">
                            <Car className="w-3 h-3" />
                            {order.driver.name} - {order.driver.car_model}
                          </p>
                        </div>
                      )}

                      <div className="space-y-1 mb-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-green-600 dark:text-green-400" />
                          <span className="truncate">{order.pickup_title}</span>
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-red-600 dark:text-red-400" />
                          <span className="truncate">{order.dropoff_title}</span>
                        </p>
                      </div>

                      <button
                        onClick={() => setOrderDetailsModal(order.id)}
                        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2 text-sm"
                      >
                        <Eye className="w-4 h-4" />
                        Детали
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl dark:text-white">Карта заказов и водителей</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const map = document.querySelector('.leaflet-container') as any;
                  if (map && map._leaflet_id) {
                    // Автомасштабирование к видимым объектам
                    const bounds = L.latLngBounds([]);
                    const allOrders = [...filteredQueueOrders, ...activeOrdersData];
                    const filteredDrivers = allDrivers.filter(d => {
                      if (mapDriverStatusFilter === "online") return d.is_online && d.current_lat && d.current_lon;
                      if (mapDriverStatusFilter === "offline") return !d.is_online && d.current_lat && d.current_lon;
                      return d.current_lat && d.current_lon;
                    });
                    
                    allOrders.forEach(o => {
                      if (o.pickup_lat && o.pickup_lon) bounds.extend([o.pickup_lat, o.pickup_lon]);
                    });
                    filteredDrivers.forEach(d => {
                      if (d.current_lat && d.current_lon) bounds.extend([d.current_lat, d.current_lon]);
                    });
                    
                    if (!bounds.isValid()) return;
                    
                    const mapInstance = (window as any).__mapInstance;
                    if (mapInstance) {
                      mapInstance.fitBounds(bounds, { padding: [50, 50] });
                    }
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm flex items-center gap-2"
              >
                <MapIcon className="w-4 h-4" />
                Показать всех
              </button>
            </div>
          </div>
          
          {/* Панель фильтров карты */}
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Фильтр по городу */}
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">Город</label>
                <select
                  value={mapCityFilter}
                  onChange={(e) => {
                    setMapCityFilter(e.target.value);
                    setMapRegionFilter("all"); // Сбрасываем фильтр региона при смене города
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="all">Все города</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.title}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Фильтр по региону */}
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">Регион</label>
                <select
                  value={mapRegionFilter}
                  onChange={(e) => setMapRegionFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  disabled={mapCityFilter !== "all" && regions.filter(r => r.city_id === mapCityFilter || r.city?.id === mapCityFilter).length === 0}
                >
                  <option value="all">Все регионы</option>
                  {regions
                    .filter(region => {
                      // Если выбран город, показываем только регионы этого города
                      if (mapCityFilter !== "all") {
                        return region.city_id === mapCityFilter || region.city?.id === mapCityFilter;
                      }
                      return true;
                    })
                    .map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.title} {region.city ? `(${region.city.title})` : ''}
                      </option>
                    ))}
                </select>
              </div>
              
              {/* Фильтр по статусу водителя */}
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">Статус водителя</label>
                <select
                  value={mapDriverStatusFilter}
                  onChange={(e) => setMapDriverStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="all">Все</option>
                  <option value="online">Только онлайн</option>
                  <option value="offline">Только оффлайн</option>
                </select>
              </div>
              
              {/* Переключатели видимости */}
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">Видимость</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showOrders}
                      onChange={(e) => setShowOrders(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm dark:text-gray-300">Заказы</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDrivers}
                      onChange={(e) => setShowDrivers(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm dark:text-gray-300">Водители</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showRoutes}
                      onChange={(e) => setShowRoutes(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm dark:text-gray-300">Маршруты</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCities}
                      onChange={(e) => setShowCities(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm dark:text-gray-300">Города</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showRegions}
                      onChange={(e) => setShowRegions(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm dark:text-gray-300">Регионы</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          <div className="w-full h-[600px] rounded-lg overflow-hidden">
            <DispatchMap
              orders={filteredQueueOrders.filter(o => {
                // Фильтр по городу
                if (mapCityFilter !== "all") {
                  const orderRegion = regions.find(r => r.id === o.passenger?.region_id);
                  if (!orderRegion || (orderRegion.city_id !== mapCityFilter && orderRegion.city?.id !== mapCityFilter)) {
                    return false;
                  }
                }
                // Фильтр по региону
                if (mapRegionFilter !== "all" && o.passenger?.region_id !== mapRegionFilter) return false;
                return true;
              })}
              activeOrders={activeOrdersData.filter(o => {
                // Фильтр по городу
                if (mapCityFilter !== "all") {
                  const orderRegion = regions.find(r => r.id === o.passenger?.region_id);
                  if (!orderRegion || (orderRegion.city_id !== mapCityFilter && orderRegion.city?.id !== mapCityFilter)) {
                    return false;
                  }
                }
                // Фильтр по региону
                if (mapRegionFilter !== "all" && o.passenger?.region_id !== mapRegionFilter) return false;
                return true;
              })}
              drivers={allDrivers.filter(d => {
                if (!d.current_lat || !d.current_lon) return false;
                // Фильтр по городу
                if (mapCityFilter !== "all") {
                  const driverRegion = regions.find(r => r.id === d.region?.id);
                  if (!driverRegion || (driverRegion.city_id !== mapCityFilter && driverRegion.city?.id !== mapCityFilter)) {
                    return false;
                  }
                }
                // Фильтр по региону
                if (mapRegionFilter !== "all" && d.region?.id !== mapRegionFilter) return false;
                // Фильтр по статусу водителя
                if (mapDriverStatusFilter === "online") return d.is_online;
                if (mapDriverStatusFilter === "offline") return !d.is_online;
                return true;
              })}
              onOrderClick={(orderId) => setOrderDetailsModal(orderId)}
              showOrders={showOrders}
              showDrivers={showDrivers}
              showRoutes={showRoutes}
              cities={cities}
              regions={regions}
              showCities={showCities}
              showRegions={showRegions}
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
        size="lg"
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
            {/* Информация о заказе */}
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Заказ #{selectedOrder.id.split('_')[1] || selectedOrder.id}</p>
                  <p className="dark:text-white font-medium text-lg">{selectedOrder.passenger.full_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" />
                    {selectedOrder.passenger.user.phone}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="w-4 h-4" />
                    {new Date(selectedOrder.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {(() => {
                    const waitTime = Math.round((Date.now() - new Date(selectedOrder.created_at).getTime()) / 1000 / 60);
                    const waitTimeHours = Math.floor(waitTime / 60);
                    const waitTimeMinutes = waitTime % 60;
                    const waitTimeText = waitTimeHours > 0 
                      ? `${waitTimeHours} ч ${waitTimeMinutes} мин`
                      : `${waitTimeMinutes} мин`;
                    return (
                      <span className={`text-xs px-2 py-1 rounded mt-1 inline-block ${
                        waitTime > 30 
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          : waitTime > 15
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      }`}>
                        Ожидание: {waitTimeText}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Откуда</p>
                  <p className="text-sm dark:text-gray-300 flex items-start gap-1">
                    <MapPin className="w-3 h-3 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    {selectedOrder.pickup_title}
                  </p>
                </div>
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Куда</p>
                  <p className="text-sm dark:text-gray-300 flex items-start gap-1">
                    <MapPin className="w-3 h-3 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    {selectedOrder.dropoff_title}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {selectedOrder.has_companion && (
                  <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    С сопровождением
                  </span>
                )}
                {selectedOrder.seats_needed > 1 && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                    Мест: {selectedOrder.seats_needed}
                  </span>
                )}
                {selectedOrder.distance_km && (
                  <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded flex items-center gap-1">
                    <Navigation className="w-3 h-3" />
                    {selectedOrder.distance_km.toFixed(1)} км
                  </span>
                )}
                {selectedOrder.note && (
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded">
                    {selectedOrder.note}
                  </span>
                )}
              </div>
            </div>

            {/* Карта с маршрутом */}
            {selectedOrder.pickup_lat && selectedOrder.pickup_lon && selectedOrder.dropoff_lat && selectedOrder.dropoff_lon && (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium dark:text-white">Маршрут заказа</p>
                </div>
                <div className="h-64">
                  <RouteMapView
                    pickupLat={selectedOrder.pickup_lat}
                    pickupLon={selectedOrder.pickup_lon}
                    dropoffLat={selectedOrder.dropoff_lat}
                    dropoffLon={selectedOrder.dropoff_lon}
                    distanceKm={selectedOrder.distance_km}
                    orderId={selectedOrder.id}
                  />
                </div>
              </div>
            )}

            {/* Список кандидатов */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Доступные водители ({candidates.length})</p>
                {candidates.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Сортировка: по приоритету
                  </p>
                )}
              </div>
              {candidates.length === 0 ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">Загрузка кандидатов...</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {candidates.map((driver, index) => {
                    const isSelected = selectedDriver === String(driver.driver_id);
                    const priorityScore = driver.priority?.region_match ? 3 : 0;
                    const priorityScoreText = index === 0 ? "Лучший вариант" : index < 3 ? "Хороший вариант" : "Доступен";
                    
                    return (
                      <button
                        key={driver.driver_id}
                        onClick={() => setSelectedDriver(String(driver.driver_id))}
                        disabled={!driver.is_online}
                        className={`w-full flex items-start gap-3 p-4 border-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected
                            ? "border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/20 shadow-md"
                            : "border-gray-200 dark:border-gray-600"
                        } ${index === 0 ? "ring-2 ring-indigo-200 dark:ring-indigo-800" : ""}`}
                      >
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold flex-shrink-0 ${
                          isSelected
                            ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                            : "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400"
                        }`}>
                          {driver.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="dark:text-white font-medium">{driver.name}</p>
                            {index === 0 && (
                              <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded">
                                ⭐ {priorityScoreText}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
                            <span className="flex items-center gap-1">
                              <Car className="w-3 h-3" />
                              {driver.car_model}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Вместимость: {driver.capacity}
                            </span>
                            <span className={`flex items-center gap-1 ${
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
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <p className="text-gray-500 dark:text-gray-400 mb-0.5">Расстояние</p>
                              <p className="dark:text-white font-medium">
                                {driver.priority?.distance ? `${(driver.priority.distance / 1000).toFixed(1)} км` : "—"}
                              </p>
                            </div>
                            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <p className="text-gray-500 dark:text-gray-400 mb-0.5">Заказов сегодня</p>
                              <p className="dark:text-white font-medium">{driver.priority?.order_count || 0}</p>
                            </div>
                            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <p className="text-gray-500 dark:text-gray-400 mb-0.5">Регион</p>
                              <p className={`font-medium ${
                                driver.priority?.region_match
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-gray-500 dark:text-gray-400"
                              }`}>
                                {driver.priority?.region_match ? "✓ Совпадает" : "✗ Другой"}
                              </p>
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
                        )}
                      </button>
                    );
                  })}
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
  showOrders?: boolean;
  showDrivers?: boolean;
  showRoutes?: boolean;
  cities?: City[];
  regions?: Region[];
  showCities?: boolean;
  showRegions?: boolean;
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

function DispatchMap({ orders, activeOrders, drivers, onOrderClick, showOrders = true, showDrivers = true, showRoutes = true, cities = [], regions = [], showCities = true, showRegions = true }: DispatchMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const orderMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const driverMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const driverRoutesRef = useRef<Map<string, L.Polyline>>(new Map());
  const orderRoutesRef = useRef<Map<string, L.Polyline>>(new Map());
  const routeCacheRef = useRef<Map<string, any>>(new Map());
  const orderClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const driverClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const cityMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const regionLayersRef = useRef<Map<string, L.Layer>>(new Map());
  const previousDataRef = useRef<{ orders: Set<string>, activeOrders: Set<string>, drivers: Set<string> }>({
    orders: new Set(),
    activeOrders: new Set(),
    drivers: new Set(),
  });

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Добавляем CSS стили для кластеров вручную, если они еще не добавлены
    if (!document.getElementById('leaflet-markercluster-styles')) {
      const style = document.createElement('style');
      style.id = 'leaflet-markercluster-styles';
      style.textContent = `
        .marker-cluster-small { background-color: rgba(181, 226, 140, 0.6); }
        .marker-cluster-small div { background-color: rgba(110, 204, 57, 0.6); }
        .marker-cluster-medium { background-color: rgba(241, 211, 87, 0.6); }
        .marker-cluster-medium div { background-color: rgba(240, 194, 12, 0.6); }
        .marker-cluster-large { background-color: rgba(253, 156, 115, 0.6); }
        .marker-cluster-large div { background-color: rgba(241, 128, 23, 0.6); }
        .marker-cluster { background-clip: padding-box; border-radius: 20px; }
        .marker-cluster div { width: 30px; height: 30px; margin-left: 5px; margin-top: 5px; text-align: center; border-radius: 15px; font: 12px "Helvetica Neue", Arial, Helvetica, sans-serif; }
        .marker-cluster span { line-height: 30px; }
      `;
      document.head.appendChild(style);
    }

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

    // Инициализируем кластеры
    orderClusterRef.current = (L as any).markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    });
    orderClusterRef.current.addTo(mapInstanceRef.current);

    driverClusterRef.current = (L as any).markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    });
    driverClusterRef.current.addTo(mapInstanceRef.current);
  }, []);

  // Сохраняем ссылку на карту в window для доступа извне
  useEffect(() => {
    if (mapInstanceRef.current) {
      (window as any).__mapInstance = mapInstanceRef.current;
    }
  }, [mapInstanceRef.current]);

  // Обновление маркеров заказов
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (!showOrders) {
      // Скрываем все маркеры заказов
      orderMarkersRef.current.forEach(marker => {
        if (orderClusterRef.current) {
          orderClusterRef.current.removeLayer(marker);
        } else {
          marker.remove();
        }
      });
      return;
    }

    const currentOrderIds = new Set<string>();
    const allOrders = [...orders, ...activeOrders];

    // Обновляем или создаем маркеры для заказов
    allOrders.forEach(order => {
      const orderId = String(order.id);
      currentOrderIds.add(orderId);
      
      const existingMarker = orderMarkersRef.current.get(orderId);
      const isActiveOrder = activeOrders.some(o => String(o.id) === orderId);
      
      // Определяем цвет маркера в зависимости от статуса
      let iconColor = 'orange'; // По умолчанию для заказов в очереди
      if (isActiveOrder) {
        const status = order.status;
        if (status === 'assigned') iconColor = 'blue';
        else if (status === 'driver_en_route') iconColor = 'violet';
        else if (status === 'ride_ongoing') iconColor = 'green';
        else if (status === 'arrived_waiting') iconColor = 'yellow';
        else iconColor = 'blue';
      }
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

        // Обновляем popup с улучшенной информацией
        const statusLabels: Record<string, string> = {
          'active_queue': 'В очереди',
          'assigned': 'Назначен',
          'driver_en_route': 'Водитель в пути',
          'arrived_waiting': 'Водитель прибыл',
          'ride_ongoing': 'Поездка началась',
        };
        const statusLabel = statusLabels[order.status] || order.status;
        
        const popupContent = isActiveOrder
          ? `
            <div style="min-width: 220px;">
              <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">Активный заказ ${order.id}</h3>
              <div style="margin-bottom: 8px; padding: 6px; background: #f3f4f6; border-radius: 4px;">
                <p style="margin: 2px 0; font-size: 12px;"><strong>Пассажир:</strong> ${order.passenger?.full_name || 'Не указан'}</p>
                <p style="margin: 2px 0; font-size: 12px;"><strong>Водитель:</strong> ${order.driver?.name || 'Не назначен'}</p>
                <p style="margin: 2px 0; font-size: 12px;"><strong>Статус:</strong> <span style="color: #3b82f6;">${statusLabel}</span></p>
              </div>
              ${order.pickup_title ? `<p style="margin: 4px 0; font-size: 11px; color: #6b7280;">📍 От: ${order.pickup_title}</p>` : ''}
              ${order.dropoff_title ? `<p style="margin: 4px 0; font-size: 11px; color: #6b7280;">🎯 До: ${order.dropoff_title}</p>` : ''}
              <button onclick="window.dispatchEvent(new CustomEvent('orderClick', {detail: '${order.id}'}))" 
                      style="margin-top: 8px; padding: 6px 12px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">
                Детали заказа
              </button>
            </div>
          `
          : `
            <div style="min-width: 220px;">
              <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">Заказ ${order.id}</h3>
              <div style="margin-bottom: 8px; padding: 6px; background: #fef3c7; border-radius: 4px;">
                <p style="margin: 2px 0; font-size: 12px;"><strong>Статус:</strong> <span style="color: #f59e0b;">${statusLabel}</span></p>
                <p style="margin: 2px 0; font-size: 12px;"><strong>Пассажир:</strong> ${order.passenger?.full_name || 'Не указан'}</p>
              </div>
              ${order.pickup_title ? `<p style="margin: 4px 0; font-size: 11px; color: #6b7280;">📍 От: ${order.pickup_title}</p>` : ''}
              ${order.dropoff_title ? `<p style="margin: 4px 0; font-size: 11px; color: #6b7280;">🎯 До: ${order.dropoff_title}</p>` : ''}
              <button onclick="window.dispatchEvent(new CustomEvent('orderClick', {detail: '${order.id}'}))" 
                      style="margin-top: 8px; padding: 6px 12px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">
                Детали заказа
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
        });

        const statusLabels: Record<string, string> = {
          'active_queue': 'В очереди',
          'assigned': 'Назначен',
          'driver_en_route': 'Водитель в пути',
          'arrived_waiting': 'Водитель прибыл',
          'ride_ongoing': 'Поездка началась',
        };
        const statusLabel = statusLabels[order.status] || order.status;
        
        const popupContent = isActiveOrder
          ? `
            <div style="min-width: 220px;">
              <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">Активный заказ ${order.id}</h3>
              <div style="margin-bottom: 8px; padding: 6px; background: #f3f4f6; border-radius: 4px;">
                <p style="margin: 2px 0; font-size: 12px;"><strong>Пассажир:</strong> ${order.passenger?.full_name || 'Не указан'}</p>
                <p style="margin: 2px 0; font-size: 12px;"><strong>Водитель:</strong> ${order.driver?.name || 'Не назначен'}</p>
                <p style="margin: 2px 0; font-size: 12px;"><strong>Статус:</strong> <span style="color: #3b82f6;">${statusLabel}</span></p>
              </div>
              ${order.pickup_title ? `<p style="margin: 4px 0; font-size: 11px; color: #6b7280;">📍 От: ${order.pickup_title}</p>` : ''}
              ${order.dropoff_title ? `<p style="margin: 4px 0; font-size: 11px; color: #6b7280;">🎯 До: ${order.dropoff_title}</p>` : ''}
              <button onclick="window.dispatchEvent(new CustomEvent('orderClick', {detail: '${order.id}'}))" 
                      style="margin-top: 8px; padding: 6px 12px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">
                Детали заказа
              </button>
            </div>
          `
          : `
            <div style="min-width: 220px;">
              <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">Заказ ${order.id}</h3>
              <div style="margin-bottom: 8px; padding: 6px; background: #fef3c7; border-radius: 4px;">
                <p style="margin: 2px 0; font-size: 12px;"><strong>Статус:</strong> <span style="color: #f59e0b;">${statusLabel}</span></p>
                <p style="margin: 2px 0; font-size: 12px;"><strong>Пассажир:</strong> ${order.passenger?.full_name || 'Не указан'}</p>
              </div>
              ${order.pickup_title ? `<p style="margin: 4px 0; font-size: 11px; color: #6b7280;">📍 От: ${order.pickup_title}</p>` : ''}
              ${order.dropoff_title ? `<p style="margin: 4px 0; font-size: 11px; color: #6b7280;">🎯 До: ${order.dropoff_title}</p>` : ''}
              <button onclick="window.dispatchEvent(new CustomEvent('orderClick', {detail: '${order.id}'}))" 
                      style="margin-top: 8px; padding: 6px 12px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">
                Детали заказа
              </button>
            </div>
          `;

        marker.bindPopup(popupContent);
        marker.on('click', () => {
          onOrderClick(order.id);
        });

        orderMarkersRef.current.set(orderId, marker);
        
        // Добавляем маркер в кластер
        if (orderClusterRef.current) {
          orderClusterRef.current.addLayer(marker);
        } else if (mapInstanceRef.current) {
          marker.addTo(mapInstanceRef.current);
        }
      }
    });

    // Удаляем маркеры заказов, которых больше нет
    previousDataRef.current.orders.forEach(orderId => {
      if (!currentOrderIds.has(orderId)) {
        const marker = orderMarkersRef.current.get(orderId);
        if (marker) {
          // Удаляем из кластера
          if (orderClusterRef.current) {
            orderClusterRef.current.removeLayer(marker);
          } else {
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
      }
    });

    previousDataRef.current.orders = currentOrderIds;
  }, [orders, activeOrders, onOrderClick]);

  // Обновление маркеров водителей
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (!showDrivers) {
      // Скрываем все маркеры водителей
      driverMarkersRef.current.forEach(marker => {
        if (driverClusterRef.current) {
          driverClusterRef.current.removeLayer(marker);
        } else {
          marker.remove();
        }
      });
      return;
    }

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

        // Определяем цвет маркера водителя в зависимости от статуса
        let driverIconColor = 'green';
        const hasActiveOrder = activeOrders.some(o => o.driver_id === driverId);
        if (!driver.is_online) {
          driverIconColor = 'grey';
        } else if (hasActiveOrder) {
          driverIconColor = 'red';
        }
        
        // Обновляем popup с дополнительной информацией
        const lastUpdate = driver.last_location_update 
          ? new Date(driver.last_location_update).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          : 'Неизвестно';
        
        // Получаем ETA если есть
        const etaInfo = (driver as any).eta;
        const etaText = etaInfo 
          ? `<p style="margin: 4px 0; font-size: 12px;"><strong>⏱️ ETA:</strong> <span style="color: #3b82f6;">~${etaInfo.duration_minutes} мин</span></p>
             <p style="margin: 2px 0; font-size: 11px; color: #6b7280;">Расстояние: ${etaInfo.distance_km?.toFixed(2) || '—'} км</p>`
          : '';
        
        const popupContent = `
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">${driver.name}</h3>
            <div style="margin-bottom: 8px; padding: 6px; background: ${driver.is_online ? '#d1fae5' : '#f3f4f6'}; border-radius: 4px;">
              <p style="margin: 2px 0; font-size: 12px;"><strong>Статус:</strong> <span style="color: ${driver.is_online ? '#10b981' : '#6b7280'};">${driver.is_online ? '🟢 Онлайн' : '⚫ Оффлайн'}</span></p>
              ${hasActiveOrder ? '<p style="margin: 2px 0; font-size: 11px; color: #dc2626;">🚗 На заказе</p>' : ''}
            </div>
            <p style="margin: 4px 0; font-size: 12px;"><strong>Машина:</strong> ${driver.car_model}</p>
            <p style="margin: 4px 0; font-size: 12px;"><strong>Регион:</strong> ${driver.region?.title || 'Не указан'}</p>
            ${etaText}
            <p style="margin: 4px 0; font-size: 11px; color: #6b7280;">🕐 Обновлено: ${lastUpdate}</p>
          </div>
        `;
        
        // Обновляем иконку водителя если нужно
        if (existingMarker) {
          const currentIconUrl = (existingMarker.options.icon as L.Icon)?.options.iconUrl || '';
          const newIconUrl = `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${driverIconColor}.png`;
          if (!currentIconUrl.includes(driverIconColor)) {
            existingMarker.setIcon(L.icon({
              iconUrl: newIconUrl,
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
            }));
          }
        }
        existingMarker.setPopupContent(popupContent);
      } else {
        // Определяем цвет маркера водителя
        let driverIconColor = 'green';
        const hasActiveOrder = activeOrders.some(o => o.driver_id === driverId);
        if (!driver.is_online) {
          driverIconColor = 'grey';
        } else if (hasActiveOrder) {
          driverIconColor = 'red';
        }
        
        // Создаем новый маркер водителя
        const marker = L.marker(newPos, {
          icon: L.icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${driverIconColor}.png`,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
          })
        });

        const lastUpdate = driver.last_location_update 
          ? new Date(driver.last_location_update).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          : 'Неизвестно';
        
        // Получаем ETA если есть
        const etaInfo = (driver as any).eta;
        const etaText = etaInfo 
          ? `<p style="margin: 4px 0; font-size: 12px;"><strong>⏱️ ETA:</strong> <span style="color: #3b82f6;">~${etaInfo.duration_minutes} мин</span></p>
             <p style="margin: 2px 0; font-size: 11px; color: #6b7280;">Расстояние: ${etaInfo.distance_km?.toFixed(2) || '—'} км</p>`
          : '';
        
        const popupContent = `
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">${driver.name}</h3>
            <div style="margin-bottom: 8px; padding: 6px; background: ${driver.is_online ? '#d1fae5' : '#f3f4f6'}; border-radius: 4px;">
              <p style="margin: 2px 0; font-size: 12px;"><strong>Статус:</strong> <span style="color: ${driver.is_online ? '#10b981' : '#6b7280'};">${driver.is_online ? '🟢 Онлайн' : '⚫ Оффлайн'}</span></p>
              ${hasActiveOrder ? '<p style="margin: 2px 0; font-size: 11px; color: #dc2626;">🚗 На заказе</p>' : ''}
            </div>
            <p style="margin: 4px 0; font-size: 12px;"><strong>Машина:</strong> ${driver.car_model}</p>
            <p style="margin: 4px 0; font-size: 12px;"><strong>Регион:</strong> ${driver.region?.title || 'Не указан'}</p>
            ${etaText}
            <p style="margin: 4px 0; font-size: 11px; color: #6b7280;">🕐 Обновлено: ${lastUpdate}</p>
          </div>
        `;

        marker.bindPopup(popupContent);
        driverMarkersRef.current.set(driverId, marker);
        
        // Добавляем маркер в кластер
        if (driverClusterRef.current) {
          driverClusterRef.current.addLayer(marker);
        } else if (mapInstanceRef.current) {
          marker.addTo(mapInstanceRef.current);
        }
      }
    });

    // Удаляем маркеры водителей, которые больше не онлайн или не имеют локации
    previousDataRef.current.drivers.forEach(driverId => {
      if (!currentDriverIds.has(driverId)) {
        const marker = driverMarkersRef.current.get(driverId);
        if (marker) {
          // Удаляем из кластера
          if (driverClusterRef.current) {
            driverClusterRef.current.removeLayer(marker);
          } else {
            marker.remove();
          }
          driverMarkersRef.current.delete(driverId);
        }
      }
    });

    previousDataRef.current.drivers = currentDriverIds;
  }, [drivers]);

  // Отображение маршрутов водителей до активных заказов
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (!showRoutes) {
      // Скрываем все маршруты
      driverRoutesRef.current.forEach(route => route.remove());
      orderRoutesRef.current.forEach(route => route.remove());
      return;
    }

    const activeOrdersWithDrivers = activeOrders.filter(o => o.driver_id);
    
    activeOrdersWithDrivers.forEach(async (order) => {
      const driverId = order.driver_id!;
      const driver = drivers.find(d => String(d.id) === driverId);
      
      if (!driver || !driver.current_lat || !driver.current_lon) return;
      if (!order.pickup_lat || !order.pickup_lon) return;

      const routeKey = `driver_${driverId}_order_${order.id}`;
      
      // Проверяем кэш
      if (routeCacheRef.current.has(routeKey)) {
        const cachedRoute = routeCacheRef.current.get(routeKey);
        const existingRoute = driverRoutesRef.current.get(routeKey);
        
        if (!existingRoute && cachedRoute) {
          const polyline = L.polyline(cachedRoute.route as [number, number][], {
            color: '#3b82f6',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 10'
          }).addTo(mapInstanceRef.current);
          
          driverRoutesRef.current.set(routeKey, polyline);
        }
        return;
      }

      // Загружаем маршрут
      try {
        const routeData = await dispatchApi.getDriverRoute(driverId);
        routeCacheRef.current.set(routeKey, routeData);
        
        // Удаляем старый маршрут если есть
        const existingRoute = driverRoutesRef.current.get(routeKey);
        if (existingRoute) {
          existingRoute.remove();
        }
        
        // Создаем новый маршрут
        const polyline = L.polyline(routeData.route as [number, number][], {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.7,
          dashArray: '10, 10'
        }).addTo(mapInstanceRef.current);
        
        polyline.bindPopup(`
          <div style="min-width: 150px;">
            <h4 style="margin: 0 0 8px 0; font-weight: 600;">Маршрут водителя</h4>
            <p style="margin: 4px 0; font-size: 12px;">Расстояние: ${routeData.distance_km.toFixed(2)} км</p>
            <p style="margin: 4px 0; font-size: 12px;">Время в пути: ~${routeData.duration_minutes} мин</p>
          </div>
        `);
        
        driverRoutesRef.current.set(routeKey, polyline);
      } catch (error) {
        console.error(`Error loading route for driver ${driverId}:`, error);
      }
    });

    // Удаляем маршруты для неактивных заказов
    driverRoutesRef.current.forEach((route, key) => {
      const [, driverId, , orderId] = key.split('_');
      const orderExists = activeOrders.some(o => 
        String(o.id) === orderId && o.driver_id === driverId
      );
      
      if (!orderExists) {
        route.remove();
        driverRoutesRef.current.delete(key);
        routeCacheRef.current.delete(key);
      }
    });
  }, [activeOrders, drivers]);

  // Отображение маршрутов заказов (от точки забора до высадки)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const ordersWithDropoff = activeOrders.filter(o => 
      o.pickup_lat && o.pickup_lon && o.dropoff_lat && o.dropoff_lon
    );

    ordersWithDropoff.forEach(async (order) => {
      const routeKey = `order_${order.id}`;
      
      // Проверяем кэш
      if (routeCacheRef.current.has(routeKey)) {
        const cachedRoute = routeCacheRef.current.get(routeKey);
        const existingRoute = orderRoutesRef.current.get(routeKey);
        
        if (!existingRoute && cachedRoute) {
          const polyline = L.polyline(cachedRoute.route as [number, number][], {
            color: '#10b981',
            weight: 4,
            opacity: 0.7
          }).addTo(mapInstanceRef.current);
          
          orderRoutesRef.current.set(routeKey, polyline);
        }
        return;
      }

      // Загружаем маршрут
      try {
        const routeData = await dispatchApi.getOrderRoute(String(order.id));
        routeCacheRef.current.set(routeKey, routeData);
        
        // Удаляем старый маршрут если есть
        const existingRoute = orderRoutesRef.current.get(routeKey);
        if (existingRoute) {
          existingRoute.remove();
        }
        
        // Создаем новый маршрут
        const polyline = L.polyline(routeData.route as [number, number][], {
          color: '#10b981',
          weight: 4,
          opacity: 0.7
        }).addTo(mapInstanceRef.current);
        
        polyline.bindPopup(`
          <div style="min-width: 150px;">
            <h4 style="margin: 0 0 8px 0; font-weight: 600;">Маршрут заказа</h4>
            <p style="margin: 4px 0; font-size: 12px;">От: ${order.pickup_title}</p>
            <p style="margin: 4px 0; font-size: 12px;">До: ${order.dropoff_title}</p>
            <p style="margin: 4px 0; font-size: 12px;">Расстояние: ${routeData.distance_km.toFixed(2)} км</p>
            <p style="margin: 4px 0; font-size: 12px;">Время в пути: ~${routeData.duration_minutes} мин</p>
          </div>
        `);
        
        orderRoutesRef.current.set(routeKey, polyline);
      } catch (error) {
        console.error(`Error loading route for order ${order.id}:`, error);
      }
    });

    // Удаляем маршруты для неактивных заказов
    orderRoutesRef.current.forEach((route, key) => {
      const [, orderId] = key.split('_');
      const orderExists = activeOrders.some(o => String(o.id) === orderId);
      
      if (!orderExists) {
        route.remove();
        orderRoutesRef.current.delete(key);
        routeCacheRef.current.delete(key);
      }
    });
  }, [activeOrders]);

  // Отображение городов на карте
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    if (!showCities) {
      // Скрываем все маркеры городов
      cityMarkersRef.current.forEach(marker => {
        marker.remove();
      });
      cityMarkersRef.current.clear();
      return;
    }

    const currentCityIds = new Set<string>();

    cities.forEach(city => {
      if (!city.center_lat || !city.center_lon) return;
      
      const cityId = city.id;
      currentCityIds.add(cityId);
      
      const existingMarker = cityMarkersRef.current.get(cityId);
      const position: [number, number] = [city.center_lat, city.center_lon];

      if (existingMarker) {
        // Обновляем существующий маркер
        existingMarker.setLatLng(position);
        
        const popupContent = `
          <div style="min-width: 180px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">🏙️ ${city.title}</h3>
            <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">ID: ${city.id}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">
              Координаты: ${city.center_lat.toFixed(6)}, ${city.center_lon.toFixed(6)}
            </p>
          </div>
        `;
        existingMarker.setPopupContent(popupContent);
      } else {
        // Создаем новый маркер города
        const marker = L.marker(position, {
          icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
          })
        });

        const popupContent = `
          <div style="min-width: 180px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">🏙️ ${city.title}</h3>
            <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">ID: ${city.id}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">
              Координаты: ${city.center_lat.toFixed(6)}, ${city.center_lon.toFixed(6)}
            </p>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.addTo(mapInstanceRef.current);
        cityMarkersRef.current.set(cityId, marker);
      }
    });

    // Удаляем маркеры городов, которых больше нет
    cityMarkersRef.current.forEach((marker, cityId) => {
      if (!currentCityIds.has(cityId)) {
        marker.remove();
        cityMarkersRef.current.delete(cityId);
      }
    });
  }, [cities, showCities]);

  // Отображение регионов на карте
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    if (!showRegions) {
      // Скрываем все слои регионов
      regionLayersRef.current.forEach(layer => {
        layer.remove();
      });
      regionLayersRef.current.clear();
      return;
    }

    const currentRegionIds = new Set<string>();

    regions.forEach(region => {
      if (!region.center_lat || !region.center_lon) return;
      
      const regionId = region.id;
      currentRegionIds.add(regionId);
      
      const existingLayer = regionLayersRef.current.get(regionId);
      const position: [number, number] = [region.center_lat, region.center_lon];

      if (existingLayer) {
        // Обновляем popup существующего слоя
        const popupContent = `
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">📍 ${region.title}</h3>
            ${region.city ? `<p style="margin: 4px 0; font-size: 12px; color: #6b7280;">Город: ${region.city.title}</p>` : ''}
            <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">ID: ${region.id}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">
              Координаты: ${region.center_lat.toFixed(6)}, ${region.center_lon.toFixed(6)}
            </p>
            ${region.service_radius_meters ? `<p style="margin: 4px 0; font-size: 12px; color: #6b7280;">Радиус: ${region.service_radius_meters} м</p>` : ''}
          </div>
        `;
        if ('setPopupContent' in existingLayer) {
          (existingLayer as any).setPopupContent(popupContent);
        }
        // Для кругов обновляем позицию и радиус
        if ('setLatLng' in existingLayer && 'setRadius' in existingLayer) {
          (existingLayer as L.Circle).setLatLng(position);
          if (region.service_radius_meters) {
            (existingLayer as L.Circle).setRadius(region.service_radius_meters);
          }
        }
      } else {
        // Создаем новый слой региона
        let layer: L.Layer;
        
        // Если есть полигон, создаем полигон
        if (region.polygon_coordinates && region.polygon_coordinates.length >= 3) {
          const latlngs = region.polygon_coordinates.map(
            (p) => [p[0], p[1]] as [number, number]
          );
          layer = L.polygon(latlngs, {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.2,
            weight: 2,
          });
        } else {
          // Иначе создаем круг
          const radius = region.service_radius_meters || 2000; // По умолчанию 2000м
          layer = L.circle(position, {
            radius: radius,
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.2,
            weight: 2,
          });
        }

        const popupContent = `
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">📍 ${region.title}</h3>
            ${region.city ? `<p style="margin: 4px 0; font-size: 12px; color: #6b7280;">Город: ${region.city.title}</p>` : ''}
            <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">ID: ${region.id}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">
              Координаты: ${region.center_lat.toFixed(6)}, ${region.center_lon.toFixed(6)}
            </p>
            ${region.service_radius_meters ? `<p style="margin: 4px 0; font-size: 12px; color: #6b7280;">Радиус: ${region.service_radius_meters} м</p>` : ''}
          </div>
        `;

        layer.bindPopup(popupContent);
        layer.addTo(mapInstanceRef.current);
        regionLayersRef.current.set(regionId, layer);
      }
    });

    // Удаляем слои регионов, которых больше нет
    regionLayersRef.current.forEach((layer, regionId) => {
      if (!currentRegionIds.has(regionId)) {
        layer.remove();
        regionLayersRef.current.delete(regionId);
      }
    });
  }, [regions, showRegions]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      orderMarkersRef.current.forEach(marker => marker.remove());
      driverMarkersRef.current.forEach(marker => marker.remove());
      driverRoutesRef.current.forEach(route => route.remove());
      orderRoutesRef.current.forEach(route => route.remove());
      cityMarkersRef.current.forEach(marker => marker.remove());
      regionLayersRef.current.forEach(layer => layer.remove());
      orderMarkersRef.current.clear();
      driverMarkersRef.current.clear();
      driverRoutesRef.current.clear();
      orderRoutesRef.current.clear();
      cityMarkersRef.current.clear();
      regionLayersRef.current.clear();
      routeCacheRef.current.clear();
    };
  }, []);

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}
