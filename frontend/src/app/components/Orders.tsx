import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Filter, Plus, Eye, Edit, X, Check, UserCircle, Car as CarIcon, Phone, Loader2, ArrowUpDown, ArrowUp, ArrowDown, MapPin, Sparkles } from "lucide-react";
import { Modal } from "./Modal";
import { ordersApi, Order } from "../services/orders";
import { passengersApi, Passenger } from "../services/passengers";
import { dispatchApi } from "../services/dispatch";
import { format } from "date-fns";
import { RouteMapPicker } from "./RouteMapPicker";
import { RouteMapView } from "./RouteMapView";
import { toast } from "sonner";

const statuses = ["Все", "Ожидание", "В пути", "Выполнено", "Отменён"];

// Маппинг статусов API на отображаемые
const statusMap: Record<string, string> = {
  "draft": "Черновик",
  "submitted": "Отправлено",
  "awaiting_dispatcher_decision": "Ожидание решения диспетчера",
  "rejected": "Отклонено",
  "active_queue": "В очереди",
  "assigned": "Назначено",
  "driver_en_route": "Водитель в пути",
  "arrived_waiting": "Ожидание пассажира",
  "no_show": "Пассажир не пришел",
  "ride_ongoing": "Поездка началась",
  "completed": "Завершено",
  "cancelled": "Отменено",
  "incident": "Инцидент",
};

interface OrdersProps {
  selectedOrderId?: string | null;
  onOrderClose?: () => void;
}

type SortField = 'id' | 'created_at' | 'status' | 'price' | 'passenger';
type SortDirection = 'asc' | 'desc';

export function Orders({ selectedOrderId, onOrderClose }: OrdersProps = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("Все");
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [viewModal, setViewModal] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [callModal, setCallModal] = useState<{ name: string; phone: string; type: string } | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState<string>("");
  const [editingNote, setEditingNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  
  // Состояние для создания заказа
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedPassengerId, setSelectedPassengerId] = useState<string>("");
  const [orderDate, setOrderDate] = useState<string>("");
  const [orderTime, setOrderTime] = useState<string>("");
  const [orderNote, setOrderNote] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [generateModal, setGenerateModal] = useState(false);
  const [generatingOrders, setGeneratingOrders] = useState(false);
  const [ordersCount, setOrdersCount] = useState(5);

  // Load orders from API
  useEffect(() => {
    const loadOrders = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await ordersApi.getOrders();
        setOrders(data);
      } catch (err: any) {
        setError(err.message || "Ошибка загрузки заказов");
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, []);

  // Load passengers from API
  useEffect(() => {
    const loadPassengers = async () => {
      try {
        const data = await passengersApi.getPassengers();
        setPassengers(data);
      } catch (err: any) {
        console.error("Ошибка загрузки пассажиров:", err);
      }
    };
    loadPassengers();
  }, []);

  // Установка текущей даты и времени по умолчанию
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setOrderDate(tomorrow.toISOString().split('T')[0]);
    setOrderTime("10:00");
  }, []);

  // Обработчик создания заказа
  const handleCreateOrder = async () => {
    // Валидация
    if (!selectedPassengerId) {
      toast.error("Выберите пассажира");
      return;
    }

    if (!pickupCoords) {
      toast.error("Выберите точку на карте для места отправления");
      return;
    }

    if (!dropoffCoords) {
      toast.error("Выберите точку на карте для места назначения");
      return;
    }

    if (!orderDate || !orderTime) {
      toast.error("Укажите дату и время поездки");
      return;
    }

    try {
      setCreatingOrder(true);

      // Формируем дату и время
      const [hours, minutes] = orderTime.split(':');
      const desiredPickupTime = new Date(orderDate);
      desiredPickupTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // Создаем заказ
      // Используем адрес, если указан, иначе используем координаты как адрес
      const pickupTitle = pickupAddress.trim() || `${pickupCoords.lat.toFixed(6)}, ${pickupCoords.lon.toFixed(6)}`;
      const dropoffTitle = dropoffAddress.trim() || `${dropoffCoords.lat.toFixed(6)}, ${dropoffCoords.lon.toFixed(6)}`;
      
      const orderData = {
        pickup_title: pickupTitle,
        dropoff_title: dropoffTitle,
        pickup_lat: pickupCoords.lat,
        pickup_lon: pickupCoords.lon,
        dropoff_lat: dropoffCoords.lat,
        dropoff_lon: dropoffCoords.lon,
        desired_pickup_time: desiredPickupTime.toISOString(),
        passenger_id: parseInt(selectedPassengerId),
        note: orderNote.trim() || undefined,
        has_companion: false,
      };

      const newOrder = await ordersApi.createOrder(orderData);
      
      toast.success("Заказ успешно создан!");
      
      // Обновляем список заказов
      const updatedOrders = await ordersApi.getOrders();
      setOrders(updatedOrders);
      
      // Закрываем модальное окно и сбрасываем форму
      setCreateModal(false);
      setPickupAddress("");
      setDropoffAddress("");
      setPickupCoords(null);
      setDropoffCoords(null);
      setSelectedPassengerId("");
      setOrderNote("");
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setOrderDate(tomorrow.toISOString().split('T')[0]);
      setOrderTime("10:00");
    } catch (err: any) {
      console.error("Ошибка создания заказа:", err);
      toast.error(err.response?.data?.detail || err.message || "Ошибка создания заказа");
    } finally {
      setCreatingOrder(false);
    }
  };

  // Auto-open order if selectedOrderId is provided
  useEffect(() => {
    if (selectedOrderId) {
      setViewModal(selectedOrderId);
    }
  }, [selectedOrderId]);

  // Handle modal close and notify parent
  const handleViewModalClose = () => {
    setViewModal(null);
    if (onOrderClose) {
      onOrderClose();
    }
  };

  // Refresh orders after status update
  const refreshOrders = async () => {
    try {
      const data = await ordersApi.getOrders();
      setOrders(data);
    } catch (err: any) {
      setError(err.message || "Ошибка обновления заказов");
    }
  };

  // Load candidates when assign modal opens
  useEffect(() => {
    const loadCandidates = async () => {
      if (assignModal) {
        try {
          setLoadingCandidates(true);
          setError(null);
          
          // Проверяем статус заказа и переводим в active_queue если нужно
          const order = orders.find(o => o.id === assignModal);
          if (order && order.status !== 'active_queue') {
            // Переводим заказ в статус active_queue
            try {
              await ordersApi.updateOrderStatus(assignModal, {
                status: 'active_queue',
                reason: 'Перевод в очередь для назначения водителя'
              });
              // Обновляем список заказов
              await refreshOrders();
            } catch (statusErr: any) {
              setError(`Не удалось перевести заказ в очередь: ${statusErr.message}`);
              setLoadingCandidates(false);
              return;
            }
          }
          
          const response = await dispatchApi.getCandidates(assignModal);
          setCandidates(response.candidates || []);
          setSelectedDriverId(null); // Reset selection
        } catch (err: any) {
          setError(err.message || "Ошибка загрузки кандидатов");
          setCandidates([]);
        } finally {
          setLoadingCandidates(false);
        }
      }
    };
    loadCandidates();
  }, [assignModal, orders]);

  // Helper function to format order for display (moved before useMemo that uses it)
  const formatOrderForDisplay = useCallback((order: Order) => {
    const displayStatus = statusMap[order.status] || order.status;
    const date = new Date(order.created_at);
    const price = order.final_price || order.estimated_price;
    return {
      id: order.id,
      passenger: order.passenger.full_name,
      driver: order.driver?.name || "Неназначен",
      from: order.pickup_title,
      to: order.dropoff_title,
      status: displayStatus,
      time: format(date, "HH:mm"),
      date: format(date, "dd.MM.yyyy"),
      price: price ? `${price.toFixed(2)} ₸` : "—",
      priceValue: price || 0,
      distance: order.distance_km,
      order: order,
    };
  }, []);

  // Find selected order data (using useMemo to ensure it's computed correctly)
  const selectedOrderData = useMemo(() => {
    return orders.find(
      (o) => o.id === viewModal || o.id === editModal || o.id === assignModal
    );
  }, [orders, viewModal, editModal, assignModal]);

  const selectedOrder = useMemo(() => {
    return selectedOrderData ? formatOrderForDisplay(selectedOrderData) : null;
  }, [selectedOrderData, formatOrderForDisplay]);

  // Get available status transitions (соответствует логике бэкенда из OrderService.validate_status_transition)
  const getAvailableStatuses = (currentStatus: string): string[] => {
    // Валидные переходы для каждого статуса (точно соответствуют бэкенду)
    const statusTransitions: Record<string, string[]> = {
      'draft': ['submitted', 'cancelled'],
      'submitted': ['awaiting_dispatcher_decision', 'rejected', 'cancelled'],
      'awaiting_dispatcher_decision': ['active_queue', 'rejected', 'cancelled'],
      'rejected': ['submitted', 'cancelled'], // Можно восстановить отклоненный заказ, вернув в submitted
      'active_queue': ['assigned', 'cancelled'],
      'assigned': ['driver_en_route', 'cancelled'],
      'driver_en_route': ['arrived_waiting', 'cancelled'],
      'arrived_waiting': ['ride_ongoing', 'no_show', 'cancelled'],
      'no_show': ['cancelled'],
      'ride_ongoing': ['completed', 'incident', 'cancelled'],
      'incident': ['completed', 'cancelled'],
      'completed': [], // Завершенный заказ нельзя изменить (нет переходов в бэкенде)
      'cancelled': ['submitted', 'active_queue'], // Можно восстановить отмененный заказ
    };

    // Возвращаем валидные переходы для текущего статуса
    const validTransitions = statusTransitions[currentStatus];
    return validTransitions || [];
  };

  // Handle edit modal open
  useEffect(() => {
    if (editModal && selectedOrderData) {
      setEditingStatus(selectedOrderData.status);
      setEditingNote(selectedOrderData.note || "");
    }
  }, [editModal, selectedOrderData]);

  // Handle save order edit
  const handleSaveOrder = async () => {
    if (!editModal || !selectedOrderData) return;

    try {
      setSaving(true);
      setError(null);

      // Если статус изменился, обновляем через updateOrderStatus
      if (editingStatus !== selectedOrderData.status) {
        await ordersApi.updateOrderStatus(editModal, {
          status: editingStatus,
          reason: `Изменение статуса с ${selectedOrderData.status} на ${editingStatus}`
        });
      }

      // Если примечание изменилось, обновляем через updateOrder
      if (editingNote !== (selectedOrderData.note || "")) {
        await ordersApi.updateOrder(editModal, {
          note: editingNote
        });
      }

      // Обновляем список заказов
      await refreshOrders();
      setEditModal(null);
      setEditingStatus("");
      setEditingNote("");
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || "Ошибка сохранения заказа";
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Generate random coordinates within city bounds (Атырау)
  const generateRandomCoordinates = () => {
    // Центр Атырау: 47.10869114222083, 51.9049072265625
    // Генерируем координаты в радиусе примерно 10 км от центра
    const centerLat = 47.10869114222083;
    const centerLon = 51.9049072265625;
    const radiusKm = 10;
    
    // Примерно 1 градус широты = 111 км
    // Примерно 1 градус долготы на этой широте ≈ 75 км
    const latOffset = (Math.random() * 2 - 1) * (radiusKm / 111);
    const lonOffset = (Math.random() * 2 - 1) * (radiusKm / 75);
    
    return {
      lat: centerLat + latOffset,
      lon: centerLon + lonOffset
    };
  };

  // Generate random address
  const generateRandomAddress = () => {
    const streets = [
      'ул. Абая',
      'ул. Сатпаева',
      'пр. Азаттык',
      'ул. Байтурсынова',
      'ул. Жамбыла',
      'пр. Назарбаева',
      'ул. Казыбек би',
      'ул. Муканова',
      'ул. Пушкина',
      'ул. Ленина',
      'ул. Гагарина',
      'ул. Мира',
      'ул. Центральная',
      'ул. Новая',
      'ул. Советская',
      'ул. Ауэзова',
      'ул. Достык',
      'ул. Курмангазы',
      'пр. Республики',
      'ул. Шевченко'
    ];
    
    const street = streets[Math.floor(Math.random() * streets.length)];
    const building = Math.floor(Math.random() * 200) + 1;
    
    return `${street}, ${building}`;
  };

  // Generate test orders from random passengers
  const handleGenerateTestOrders = async () => {
    if (passengers.length === 0) {
      toast.error("Нет доступных пассажиров для создания заказов");
      return;
    }

    if (ordersCount < 1 || ordersCount > 50) {
      toast.error("Количество заказов должно быть от 1 до 50");
      return;
    }

    try {
      setGeneratingOrders(true);
      setError(null);

      const createdOrders: string[] = [];
      const errors: string[] = [];

      for (let i = 0; i < ordersCount; i++) {
        try {
          // Выбираем случайного пассажира
          const randomPassenger = passengers[Math.floor(Math.random() * passengers.length)];
          
          // Генерируем координаты для отправления и назначения
          const pickupCoords = generateRandomCoordinates();
          const dropoffCoords = generateRandomCoordinates();
          
          // Генерируем адреса
          const pickupTitle = generateRandomAddress();
          const dropoffTitle = generateRandomAddress();
          
          // Генерируем случайное время в ближайшие 2 часа
          const desiredPickupTime = new Date();
          desiredPickupTime.setHours(desiredPickupTime.getHours() + Math.floor(Math.random() * 2) + 1);
          desiredPickupTime.setMinutes(Math.floor(Math.random() * 60));
          
          const orderData = {
            pickup_title: pickupTitle,
            dropoff_title: dropoffTitle,
            pickup_lat: pickupCoords.lat,
            pickup_lon: pickupCoords.lon,
            dropoff_lat: dropoffCoords.lat,
            dropoff_lon: dropoffCoords.lon,
            desired_pickup_time: desiredPickupTime.toISOString(),
            passenger_id: randomPassenger.id,
            note: `Тестовый заказ #${i + 1}`,
            has_companion: Math.random() > 0.7, // 30% вероятность сопровождения
          };

          const newOrder = await ordersApi.createOrder(orderData);
          createdOrders.push(newOrder.id);
          
          // Небольшая задержка между запросами, чтобы не перегружать сервер
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err: any) {
          errors.push(`Заказ #${i + 1}: ${err.message || "Ошибка создания"}`);
        }
      }

      // Обновляем список заказов
      await refreshOrders();
      
      // Показываем результат
      if (createdOrders.length > 0) {
        toast.success(`Успешно создано ${createdOrders.length} из ${ordersCount} заказов`);
      }
      if (errors.length > 0) {
        toast.error(`Ошибки при создании ${errors.length} заказов`);
        console.error("Ошибки создания заказов:", errors);
      }
      
      setGenerateModal(false);
      setOrdersCount(5);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || "Ошибка генерации заказов";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setGeneratingOrders(false);
    }
  };

  // Handle driver assignment
  const handleAssignDriver = async () => {
    if (!assignModal || !selectedDriverId) {
      setError("Выберите водителя");
      return;
    }

    try {
      setAssigning(true);
      setError(null);
      const response = await dispatchApi.assignOrder(assignModal, String(selectedDriverId));
      
      if (response.success) {
        // Refresh orders list
        await refreshOrders();
        setAssignModal(null);
        setSelectedDriverId(null);
        setCandidates([]);
      } else {
        setError(response.rejection_reason || "Не удалось назначить водителя");
      }
    } catch (err: any) {
      setError(err.message || "Ошибка назначения водителя");
    } finally {
      setAssigning(false);
    }
  };

  const filteredAndSortedOrders = useMemo(() => {
    // Фильтрация
    let filtered = orders.filter((order) => {
      const displayStatus = statusMap[order.status] || order.status;
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.passenger.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.driver?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.pickup_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.dropoff_title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
        selectedStatus === "Все" || displayStatus === selectedStatus;
    return matchesSearch && matchesStatus;
  });

    // Сортировка
    filtered = [...filtered].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'id':
          aValue = a.id;
          bValue = b.id;
          break;
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'status':
          aValue = statusMap[a.status] || a.status;
          bValue = statusMap[b.status] || b.status;
          break;
        case 'price':
          aValue = a.final_price || a.estimated_price || 0;
          bValue = b.final_price || b.estimated_price || 0;
          break;
        case 'passenger':
          aValue = a.passenger.full_name;
          bValue = b.passenger.full_name;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [orders, searchTerm, selectedStatus, sortField, sortDirection]);

  // Sort function
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Ожидание":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "В пути":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "Выполнено":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Отменён":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl dark:text-white">Управление заказами</h1>
          <p className="text-gray-600 dark:text-gray-400">Просмотр и управление всеми заказами</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setGenerateModal(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
          >
            <Sparkles className="w-5 h-5" />
            Генерировать заказы
          </button>
          <button 
            onClick={() => setCreateModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            <Plus className="w-5 h-5" />
            Создать заказ
          </button>
        </div>
      </div>

      {/* Navigation Alert */}
      {selectedOrderId && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
            <Phone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-indigo-900 dark:text-indigo-200">
              <strong>Переход из модуля звонков</strong>
            </p>
            <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
              Заказ {selectedOrderId} выделен и открыт
            </p>
          </div>
          <button 
            onClick={handleViewModalClose}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Поиск по ID, пассажиру или водителю..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            {statuses.map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  selectedStatus === status
                    ? "bg-indigo-600 text-white dark:bg-indigo-500"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">Загрузка заказов...</span>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => handleSort('id')}
                  >
                    <div className="flex items-center gap-2">
                  ID
                      {getSortIcon('id')}
                    </div>
                </th>
                  <th 
                    className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => handleSort('passenger')}
                  >
                    <div className="flex items-center gap-2">
                  Пассажир
                      {getSortIcon('passenger')}
                    </div>
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Водитель
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Маршрут
                </th>
                  <th 
                    className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-2">
                  Статус
                      {getSortIcon('status')}
                    </div>
                </th>
                  <th 
                    className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => handleSort('created_at')}
                  >
                    <div className="flex items-center gap-2">
                  Время
                      {getSortIcon('created_at')}
                    </div>
                </th>
                  <th 
                    className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => handleSort('price')}
                  >
                    <div className="flex items-center gap-2">
                  Цена
                      {getSortIcon('price')}
                    </div>
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAndSortedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      Заказы не найдены
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedOrders.map((order) => {
                    const displayOrder = formatOrderForDisplay(order);
                    return (
                <tr 
                  key={order.id} 
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedOrderId === order.id 
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-500 dark:ring-indigo-400' 
                      : ''
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap dark:text-white">
                          {displayOrder.id}
                  </td>
                        <td className="px-6 py-4 dark:text-white">{displayOrder.passenger}</td>
                  <td className="px-6 py-4 dark:text-white">
                          {displayOrder.driver === "Неназначен" ? (
                            <span className="text-gray-400 dark:text-gray-500">{displayOrder.driver}</span>
                    ) : (
                            displayOrder.driver
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                            <p className="text-gray-900 dark:text-white">{displayOrder.from}</p>
                            <p className="text-gray-500 dark:text-gray-400">→ {displayOrder.to}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs ${getStatusColor(
                              displayOrder.status
                      )}`}
                    >
                            {displayOrder.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <div>
                            <p>{displayOrder.date}</p>
                            <p>{displayOrder.time}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap dark:text-white">
                          {displayOrder.price}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewModal(order.id)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Просмотр"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setEditModal(order.id)}
                        className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                        title="Редактировать"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                            {displayOrder.driver === "Неназначен" && (
                        <button
                          onClick={() => setAssignModal(order.id)}
                          className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                          title="Назначить водителя"
                        >
                          <CarIcon className="w-5 h-5" />
                        </button>
                      )}
                      <button
                              onClick={() => setCallModal({ 
                                name: displayOrder.passenger, 
                                phone: order.passenger.user.phone, 
                                type: "passenger" 
                              })}
                        className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                        title="Позвонить пассажиру"
                      >
                        <Phone className="w-5 h-5" />
                      </button>
                            {displayOrder.driver !== "Неназначен" && order.driver && (
                        <button
                                onClick={() => setCallModal({ 
                                  name: displayOrder.driver, 
                                  phone: order.driver.user.phone, 
                                  type: "driver" 
                                })}
                          className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                          title="Позвонить водителю"
                        >
                          <Phone className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                    );
                  })
                )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* View Modal */}
      <Modal
        isOpen={viewModal !== null}
        onClose={handleViewModalClose}
        title="Детали заказа"
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">ID заказа</p>
                <p className="text-lg dark:text-white font-mono">{selectedOrder.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Статус</p>
                <span className={`inline-block px-3 py-1 rounded-full text-xs ${getStatusColor(selectedOrder.order.status)}`}>
                  {selectedOrder.status}
                </span>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Пассажир</p>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-2">
                <div className="flex items-center gap-3">
                  <UserCircle className="w-10 h-10 text-gray-400" />
                  <div className="flex-1">
                    <p className="dark:text-white font-medium">{selectedOrder.order.passenger.full_name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{selectedOrder.order.passenger.user.phone}</p>
                    {selectedOrder.order.passenger.user.email && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{selectedOrder.order.passenger.user.email}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  {selectedOrder.order.passenger.region && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Регион</p>
                      <p className="text-sm dark:text-white">{selectedOrder.order.passenger.region.title}</p>
                    </div>
                  )}
                  {selectedOrder.order.passenger.disability_category && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Категория</p>
                      <p className="text-sm dark:text-white">{selectedOrder.order.passenger.disability_category}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedOrder.driver !== "Неназначен" && selectedOrder.order.driver && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Водитель</p>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-2">
                  <div className="flex items-center gap-3">
                    <CarIcon className="w-10 h-10 text-gray-400" />
                    <div className="flex-1">
                      <p className="dark:text-white font-medium">{selectedOrder.order.driver.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{selectedOrder.order.driver.user.phone}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Машина</p>
                      <p className="text-sm dark:text-white">{selectedOrder.order.driver.car_model}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Гос. номер</p>
                      <p className="text-sm dark:text-white">{selectedOrder.order.driver.plate_number}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Маршрут</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">A</div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Откуда</p>
                      <p className="dark:text-white">{selectedOrder.from}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">B</div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Куда</p>
                      <p className="dark:text-white">{selectedOrder.to}</p>
                    </div>
                  </div>
                </div>
                
                {/* Мини-карта с маршрутом */}
                {selectedOrder.order.pickup_lat && selectedOrder.order.pickup_lon && 
                 selectedOrder.order.dropoff_lat && selectedOrder.order.dropoff_lon && (
                  <RouteMapView
                    pickupLat={selectedOrder.order.pickup_lat}
                    pickupLon={selectedOrder.order.pickup_lon}
                    dropoffLat={selectedOrder.order.dropoff_lat}
                    dropoffLon={selectedOrder.order.dropoff_lon}
                    pickupTitle={selectedOrder.from}
                    dropoffTitle={selectedOrder.to}
                    distanceKm={selectedOrder.order.distance_km}
                    orderId={selectedOrder.id}
                    height="250px"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Желаемое время забора</p>
                <p className="dark:text-white">
                  {new Date(selectedOrder.order.desired_pickup_time).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Расстояние</p>
                <p className="dark:text-white">{selectedOrder.order.distance_km ? `${selectedOrder.order.distance_km.toFixed(2)} км` : "—"}</p>
              </div>
            </div>

            {/* Дополнительная информация */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Создан</p>
                <p className="dark:text-white">
                  {new Date(selectedOrder.order.created_at).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              {selectedOrder.order.assigned_at && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Назначен</p>
                  <p className="dark:text-white">
                    {new Date(selectedOrder.order.assigned_at).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              )}
              {selectedOrder.order.completed_at && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Завершен</p>
                  <p className="dark:text-white">
                    {new Date(selectedOrder.order.completed_at).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              )}
              {selectedOrder.order.waiting_time_minutes && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Время ожидания</p>
                  <p className="dark:text-white">{selectedOrder.order.waiting_time_minutes} мин</p>
                </div>
              )}
            </div>

            {/* Особенности заказа */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Особенности</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedOrder.order.has_companion && (
                    <span className="inline-block px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded text-xs">
                      С сопровождением
                    </span>
                  )}
                  {selectedOrder.order.video_recording && (
                    <span className="inline-block px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs">
                      Видеозапись
                    </span>
                  )}
                  {selectedOrder.order.seats_needed > 1 && (
                    <span className="inline-block px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs">
                      Мест: {selectedOrder.order.seats_needed}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Координаты</p>
                <div className="text-xs dark:text-gray-300 mt-1">
                  <p>Откуда: {selectedOrder.order.pickup_lat.toFixed(6)}, {selectedOrder.order.pickup_lon.toFixed(6)}</p>
                  <p>Куда: {selectedOrder.order.dropoff_lat.toFixed(6)}, {selectedOrder.order.dropoff_lon.toFixed(6)}</p>
                </div>
              </div>
            </div>

            {/* Примечание */}
            {selectedOrder.order.note && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Примечание</p>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <p className="text-sm dark:text-white">{selectedOrder.order.note}</p>
                </div>
              </div>
            )}

            {/* Причины */}
            {(selectedOrder.order.assignment_reason || selectedOrder.order.rejection_reason) && (
              <div className="space-y-2">
                {selectedOrder.order.assignment_reason && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Причина назначения</p>
                    <p className="text-sm dark:text-white p-2 bg-green-50 dark:bg-green-900/20 rounded">{selectedOrder.order.assignment_reason}</p>
                  </div>
                )}
                {selectedOrder.order.rejection_reason && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Причина отклонения</p>
                    <p className="text-sm dark:text-white p-2 bg-red-50 dark:bg-red-900/20 rounded">{selectedOrder.order.rejection_reason}</p>
                  </div>
                )}
              </div>
            )}

            {/* Цена */}
            {(selectedOrder.order.final_price || selectedOrder.order.estimated_price) && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedOrder.order.final_price ? "Финальная стоимость" : "Предварительная стоимость"}
                    </p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                      {(selectedOrder.order.final_price || selectedOrder.order.estimated_price || 0).toFixed(2)} ₸
                    </p>
                  </div>
                  {selectedOrder.order.final_price && selectedOrder.order.estimated_price && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Было оценено</p>
                      <p className="text-sm line-through text-gray-400">{selectedOrder.order.estimated_price.toFixed(2)} ₸</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Детализация цены */}
            {selectedOrder.order.price_breakdown && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Детализация стоимости</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Расстояние ({selectedOrder.order.distance_km?.toFixed(2) || 0} км)</span>
                    <span className="dark:text-white">{selectedOrder.order.price_breakdown.base_distance_price?.toFixed(2) || "0.00"} ₸</span>
                  </div>
                  {selectedOrder.order.price_breakdown.waiting_time_price > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Ожидание ({selectedOrder.order.waiting_time_minutes || 0} мин)</span>
                      <span className="dark:text-white">{selectedOrder.order.price_breakdown.waiting_time_price?.toFixed(2) || "0.00"} ₸</span>
                    </div>
                  )}
                  {selectedOrder.order.has_companion && selectedOrder.order.price_breakdown.companion_fee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Доплата за сопровождение</span>
                      <span className="dark:text-white">{selectedOrder.order.price_breakdown.companion_fee?.toFixed(2) || "0.00"} ₸</span>
                    </div>
                  )}
                  {selectedOrder.order.price_breakdown.disability_multiplier && selectedOrder.order.price_breakdown.disability_multiplier !== 1.0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Множитель категории</span>
                      <span className="dark:text-white">×{selectedOrder.order.price_breakdown.disability_multiplier.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrder.order.price_breakdown.night_multiplier && selectedOrder.order.price_breakdown.night_multiplier !== 1.0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Ночной тариф</span>
                      <span className="dark:text-white">×{selectedOrder.order.price_breakdown.night_multiplier.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrder.order.price_breakdown.weekend_multiplier && selectedOrder.order.price_breakdown.weekend_multiplier !== 1.0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Выходной день</span>
                      <span className="dark:text-white">×{selectedOrder.order.price_breakdown.weekend_multiplier.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrder.order.price_breakdown.minimum_fare_adjustment && selectedOrder.order.price_breakdown.minimum_fare_adjustment > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Минимальная стоимость</span>
                      <span className="dark:text-white">+{selectedOrder.order.price_breakdown.minimum_fare_adjustment.toFixed(2)} ₸</span>
                    </div>
                  )}
                  {selectedOrder.order.price_breakdown.subtotal && (
                    <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">Промежуточный итог</span>
                      <span className="dark:text-white">{selectedOrder.order.price_breakdown.subtotal.toFixed(2)} ₸</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 font-semibold">
                    <span className="text-gray-900 dark:text-white">Итого</span>
                    <span className="text-xl text-green-600 dark:text-green-400">
                      {selectedOrder.order.price_breakdown.total ? 
                        `${selectedOrder.order.price_breakdown.total.toFixed(2)} ₸` : 
                        (selectedOrder.order.final_price || selectedOrder.order.estimated_price ? 
                          `${(selectedOrder.order.final_price || selectedOrder.order.estimated_price || 0).toFixed(2)} ₸` : 
                          "—")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">
                На карте
              </button>
              <button
                onClick={handleViewModalClose}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={editModal !== null}
        onClose={() => {
          setEditModal(null);
          setEditingStatus("");
          setEditingNote("");
        }}
        title="Редактировать заказ"
        size="md"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Заказ</p>
              <p className="dark:text-white font-medium">{selectedOrder.id}</p>
            </div>

            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Статус</label>
              {getAvailableStatuses(selectedOrder.order.status).length > 0 ? (
                <>
                  <select
                    value={editingStatus}
                    onChange={(e) => setEditingStatus(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={selectedOrder.order.status}>
                      {statusMap[selectedOrder.order.status] || selectedOrder.order.status} (текущий)
                    </option>
                    {getAvailableStatuses(selectedOrder.order.status).map((status) => (
                      <option key={status} value={status}>
                        {statusMap[status] || status}
                      </option>
                    ))}
              </select>
                  {editingStatus !== selectedOrder.order.status && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Статус будет изменен с "{statusMap[selectedOrder.order.status] || selectedOrder.order.status}" на "{statusMap[editingStatus] || editingStatus}"
                    </p>
                  )}
                </>
              ) : (
                <div className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 bg-gray-50">
                  <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {statusMap[selectedOrder.order.status] || selectedOrder.order.status}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Изменение статуса недоступно для этого заказа
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Примечания</label>
              <textarea
                value={editingNote}
                onChange={(e) => setEditingNote(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Добавьте примечания к заказу..."
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSaveOrder}
                disabled={saving}
                className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                  saving
                    ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                <Check className="w-5 h-5" />
                Сохранить
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setEditModal(null);
                  setEditingStatus("");
                  setEditingNote("");
                }}
                disabled={saving}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
                Отмена
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Assign Driver Modal */}
      <Modal
        isOpen={assignModal !== null}
        onClose={() => {
          setAssignModal(null);
          setSelectedDriverId(null);
          setCandidates([]);
        }}
        title="Назначить водителя"
        size="md"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Заказ</p>
              <p className="dark:text-white">{selectedOrder.id} - {selectedOrder.passenger}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-300">Доступные водители</p>
              {loadingCandidates ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Загрузка водителей...</span>
                </div>
              ) : candidates.length === 0 ? (
                <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                  Нет доступных водителей
                </div>
              ) : (
                candidates.map((candidate) => (
                <button
                    key={candidate.driver_id}
                    onClick={() => setSelectedDriverId(candidate.driver_id)}
                    className={`w-full flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                      selectedDriverId === candidate.driver_id
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-400"
                        : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      {candidate.name[0]}
                  </div>
                  <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <p className="dark:text-white font-medium">{candidate.name}</p>
                        {!candidate.is_online && (
                          <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                            Офлайн
                          </span>
                        )}
                        {candidate.is_online && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                            Онлайн
                          </span>
                        )}
                  </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {candidate.car_model} • Вместимость: {candidate.capacity}
                        {candidate.priority.distance !== null && (
                          <> • {candidate.priority.distance.toFixed(1)} км</>
                        )}
                        {candidate.priority.region_match && (
                          <span className="ml-2 text-green-600 dark:text-green-400">✓ Регион совпадает</span>
                        )}
                      </p>
                    </div>
                    {selectedDriverId === candidate.driver_id && (
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                    )}
                </button>
                ))
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleAssignDriver}
                disabled={!selectedDriverId || assigning}
                className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  selectedDriverId && !assigning
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                }`}
              >
                {assigning ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Назначение...
                  </>
                ) : (
                  "Назначить"
                )}
              </button>
              <button
                onClick={() => {
                  setAssignModal(null);
                  setSelectedDriverId(null);
                  setCandidates([]);
                }}
                disabled={assigning}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Call Modal */}
      <Modal
        isOpen={callModal !== null}
        onClose={() => setCallModal(null)}
        title={`Позвонить ${callModal?.type === 'passenger' ? 'пассажиру' : 'водителю'}`}
        size="sm"
        footer={
          callModal ? (
            <>
              <button
                onClick={() => setCallModal(null)}
                className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Отмена
              </button>
              <button className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 shadow-lg shadow-green-500/30">
                <Phone className="w-5 h-5" />
                Позвонить
              </button>
            </>
          ) : undefined
        }
      >
        {callModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center ring-4 ring-green-50 dark:ring-green-900/50">
                <Phone className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <p className="dark:text-white mb-1">{callModal.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">{callModal.phone}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {callModal.type === 'passenger' ? '👤 Пассажир' : '🚗 Водитель'}
                </p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                💡 <strong>Совет:</strong> Убедитесь, что микрофон и наушники подключены перед началом звонка.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Pagination */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Показано {filteredAndSortedOrders.length} из {orders.length} заказов
        </p>
        <div className="flex gap-2">
          <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white">
            Назад
          </button>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
            1
          </button>
          <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white">
            2
          </button>
          <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white">
            Далее
          </button>
        </div>
      </div>

      {/* Create Order Modal */}
      <Modal
        isOpen={createModal}
        onClose={() => {
          setCreateModal(false);
          // Сброс состояния при закрытии
          setPickupAddress("");
          setDropoffAddress("");
          setPickupCoords(null);
          setDropoffCoords(null);
          setSelectedPassengerId("");
          setOrderNote("");
          const now = new Date();
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          setOrderDate(tomorrow.toISOString().split('T')[0]);
          setOrderTime("10:00");
        }}
        title="Создать новый заказ"
        size="xl"
        footer={
          <>
            <button
              onClick={() => {
                setCreateModal(false);
                setPickupAddress("");
                setDropoffAddress("");
                setPickupCoords(null);
                setDropoffCoords(null);
                setSelectedPassengerId("");
                setOrderNote("");
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                setOrderDate(tomorrow.toISOString().split('T')[0]);
                setOrderTime("10:00");
              }}
              className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Отмена
            </button>
            <button 
              onClick={handleCreateOrder}
              disabled={creatingOrder}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingOrder ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Создание...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Создать заказ
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Пассажир *</label>
            <select 
              value={selectedPassengerId}
              onChange={(e) => setSelectedPassengerId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Выберите пассажира</option>
              {passengers.map((passenger) => (
                <option key={passenger.id} value={passenger.id.toString()}>
                  {passenger.full_name} ({passenger.user.phone})
                </option>
              ))}
            </select>
          </div>

          {/* Карта для выбора точек маршрута */}
          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Выберите маршрут на карте *
            </label>
            <RouteMapPicker
              height="400px"
              onPickupChange={(lat, lon) => {
                setPickupCoords({ lat, lon });
              }}
              onDropoffChange={(lat, lon) => {
                setDropoffCoords({ lat, lon });
              }}
              initialPickup={pickupCoords ? { lat: pickupCoords.lat, lon: pickupCoords.lon } : undefined}
              initialDropoff={dropoffCoords ? { lat: dropoffCoords.lat, lon: dropoffCoords.lon } : undefined}
            />
          </div>

          {/* Поля для адресов */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
                Откуда (адрес)
              </label>
              <input
                type="text"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="Введите адрес начала маршрута или выберите на карте"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
                Куда (адрес)
              </label>
              <input
                type="text"
                value={dropoffAddress}
                onChange={(e) => setDropoffAddress(e.target.value)}
                placeholder="Введите адрес назначения или выберите на карте"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Дата *</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Время *</label>
              <input
                type="time"
                value={orderTime}
                onChange={(e) => setOrderTime(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Водитель</label>
            <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white">
              <option value="">Назначить позже</option>
              <option value="dr001">Асан Мукашев - Toyota Camry</option>
              <option value="dr002">Мурат Казбеков - Honda Accord</option>
              <option value="dr003">Дмитрий Сергеев - Mazda 6</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Примечания</label>
            <textarea
              rows={3}
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Дополнительная информация о заказе..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      </Modal>

      {/* Generate Test Orders Modal */}
      <Modal
        isOpen={generateModal}
        onClose={() => {
          setGenerateModal(false);
          setOrdersCount(5);
        }}
        title="Генерация тестовых заказов"
        size="md"
        footer={
          <>
            <button
              onClick={() => {
                setGenerateModal(false);
                setOrdersCount(5);
              }}
              disabled={generatingOrders}
              className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={handleGenerateTestOrders}
              disabled={generatingOrders || passengers.length === 0}
              className={`px-6 py-2.5 rounded-lg flex items-center gap-2 transition-colors ${
                generatingOrders || passengers.length === 0
                  ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                  : "bg-purple-600 text-white hover:bg-purple-700"
              }`}
            >
              {generatingOrders ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Генерация...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Создать заказы
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {passengers.length === 0 ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Нет доступных пассажиров в базе данных. Сначала создайте пассажиров.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  💡 <strong>Информация:</strong> Будет создано {ordersCount} тестовых заказов от случайных пассажиров из базы данных. 
                  Для каждого заказа будут сгенерированы случайные адреса и координаты в пределах города Атырау.
                </p>
              </div>

              <div>
                <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
                  Количество заказов для генерации
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={ordersCount}
                  onChange={(e) => setOrdersCount(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Доступно пассажиров: {passengers.length}
                </p>
              </div>

              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium dark:text-gray-300">Что будет сгенерировано:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Случайные пассажиры из базы данных</li>
                  <li>Случайные адреса отправления и назначения</li>
                  <li>Случайные координаты в пределах города</li>
                  <li>Время забора в ближайшие 2 часа</li>
                  <li>30% вероятность сопровождения</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}