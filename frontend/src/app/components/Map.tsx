import { useState, useEffect, useRef } from "react";
import { MapPin, Users, Navigation, Filter, Car, Loader2, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { dispatchApi, DriverMarker, OrderMarker } from "../services/dispatch";
import { getDispatchMapWebSocket, testWebSocketConnection } from "../services/websocket";
import { regionsApi, City } from "../services/regions";

// Fix для иконок Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Создаем кастомные иконки
const createDriverIcon = (isOnline: boolean) => {
  return L.divIcon({
    className: "custom-driver-icon",
    html: `<div class="w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
      isOnline ? "bg-green-500" : "bg-gray-400"
    }">
      <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const createOrderIcon = (color: string = "blue") => {
  return L.divIcon({
    className: "custom-order-icon",
    html: `<div class="w-8 h-8 rounded-full flex items-center justify-center shadow-lg bg-${color}-500">
      <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Компонент для обновления карты при изменении центра
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export function Map() {
  const [drivers, setDrivers] = useState<DriverMarker[]>([]);
  const [orders, setOrders] = useState<OrderMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>("all");
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverMarker | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderMarker | null>(null);
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');
  const [wsReconnectAttempts, setWsReconnectAttempts] = useState(0);
  const wsRef = useRef<ReturnType<typeof getDispatchMapWebSocket> | null>(null);

  // Загрузка городов
  useEffect(() => {
    const loadCities = async () => {
      try {
        const citiesData = await regionsApi.getCities();
        setCities(citiesData);
        // Устанавливаем первый город по умолчанию, если есть
        if (citiesData.length > 0 && selectedCityId === "all") {
          setSelectedCityId(citiesData[0].id);
        }
      } catch (error) {
        console.error("Error loading cities:", error);
      }
    };
    loadCities();
  }, []);

  // Определяем центр карты на основе выбранного города
  const selectedCity = cities.find(c => c.id === selectedCityId);
  const center: [number, number] = selectedCity
    ? [selectedCity.center_lat, selectedCity.center_lon]
    : [47.1067, 51.9167]; // Атырау по умолчанию

  // Загрузка начальных данных
  useEffect(() => {
    const loadMapData = async () => {
      try {
        setLoading(true);
        const data = await dispatchApi.getMapData();
        setDrivers(data.drivers);
        setOrders(data.orders);
      } catch (error) {
        console.error("Error loading map data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadMapData();
  }, []);

  // Тестирование WebSocket подключения
  useEffect(() => {
    const testConnection = async () => {
      console.log('[Map] Testing WebSocket connection to ws://localhost:8000/ws/test/...');
      console.log('[Map] This will help diagnose if WebSocket is working at all');
      const testResult = await testWebSocketConnection();
      if (testResult) {
        console.log('[Map] ✅ Test WebSocket connection successful - WebSocket is working!');
        console.log('[Map] The problem is likely with authentication or authorization');
      } else {
        console.error('[Map] ❌ Test WebSocket connection failed');
        console.error('[Map] This means WebSocket is not working at all');
        console.error('[Map] Check server logs for messages starting with [ASGI]');
        console.error('[Map] If you see "Protocol type: http" instead of "websocket", the server is not recognizing WebSocket upgrade');
      }
    };
    // Задержка перед тестом, чтобы дать время загрузиться
    setTimeout(testConnection, 1000);
  }, []);

  // Подключение к WebSocket
  useEffect(() => {
    const ws = getDispatchMapWebSocket();
    wsRef.current = ws;
    
    // Обновляем статус подключения
    const updateStatus = () => {
      setWsStatus(ws.getConnectionStatus());
      setWsReconnectAttempts(ws.getReconnectAttempts());
    };
    
    // Обновляем статус при изменении
    const statusInterval = setInterval(updateStatus, 1000);
    updateStatus(); // Первоначальное обновление

    // Регистрируем обработчики
    ws.on("driver_location_update", (data: any) => {
      setDrivers((prev) => {
        const index = prev.findIndex((d) => d.id === data.driver_id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], lat: data.lat, lon: data.lon };
          return updated;
        }
        // Если водителя нет в списке, добавляем его
        return [...prev, {
          id: data.driver_id,
          name: data.name || "",
          lat: data.lat,
          lon: data.lon,
          is_online: data.is_online ?? true,
          car_model: data.car_model || "",
          plate_number: "",
        }];
      });
    });

    ws.on("driver_status_update", (data: any) => {
      setDrivers((prev) => {
        const index = prev.findIndex((d) => d.id === data.driver_id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], is_online: data.is_online };
          return updated;
        }
        return prev;
      });
    });

    ws.on("order_update", (data: any) => {
      setOrders((prev) => {
        const index = prev.findIndex((o) => o.id === data.id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            status: data.status,
            driver_id: data.driver?.id ? String(data.driver.id) : null,
          };
          return updated;
        }
        // Если заказа нет, добавляем его (только если активный)
        const activeStatuses = ['submitted', 'awaiting_dispatcher_decision', 'active_queue', 
          'assigned', 'driver_en_route', 'arrived_waiting', 'ride_ongoing'];
        if (activeStatuses.includes(data.status)) {
          return [...prev, {
            id: data.id,
            pickup_lat: data.pickup_lat,
            pickup_lon: data.pickup_lon,
            dropoff_lat: data.dropoff_lat,
            dropoff_lon: data.dropoff_lon,
            pickup_title: data.pickup_title,
            dropoff_title: data.dropoff_title,
            status: data.status,
            driver_id: data.driver?.id ? String(data.driver.id) : null,
            passenger: data.passenger ? {
              id: String(data.passenger.id),
              full_name: data.passenger.full_name,
            } : null,
            created_at: data.created_at,
          }];
        }
        return prev;
      });
    });

    ws.on("order_created", (data: any) => {
      const activeStatuses = ['submitted', 'awaiting_dispatcher_decision', 'active_queue', 
        'assigned', 'driver_en_route', 'arrived_waiting', 'ride_ongoing'];
      if (activeStatuses.includes(data.status)) {
        setOrders((prev) => [...prev, {
          id: data.id,
          pickup_lat: data.pickup_lat,
          pickup_lon: data.pickup_lon,
          dropoff_lat: data.dropoff_lat,
          dropoff_lon: data.dropoff_lon,
          pickup_title: data.pickup_title,
          dropoff_title: data.dropoff_title,
          status: data.status,
          driver_id: data.driver?.id ? String(data.driver.id) : null,
          passenger: data.passenger ? {
            id: String(data.passenger.id),
            full_name: data.passenger.full_name,
          } : null,
          created_at: data.created_at,
        }]);
      }
    });

    // Подключаемся
    ws.connect().catch((error) => {
      console.error("WebSocket connection error:", error);
    });

    // Отключаемся при размонтировании
    return () => {
      clearInterval(statusInterval);
      ws.disconnect();
    };
  }, []);

  const filteredDrivers = drivers.filter((driver) => {
    const matchesOnline = !showOnlineOnly || driver.is_online;
    return matchesOnline;
  });

  const onlineCount = filteredDrivers.filter((d) => d.is_online).length;
  const offlineCount = filteredDrivers.filter((d) => !d.is_online).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl dark:text-white">Карта диспетчеризации</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Отслеживание водителей и заказов в реальном времени
          </p>
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Car className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Онлайн</p>
              <p className="text-2xl dark:text-white">{loading ? "..." : onlineCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <Car className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Оффлайн</p>
              <p className="text-2xl dark:text-white">{loading ? "..." : offlineCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Navigation className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Активные заказы</p>
              <p className="text-2xl dark:text-white">{loading ? "..." : orders.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Всего водителей</p>
              <p className="text-2xl dark:text-white">{loading ? "..." : filteredDrivers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Фильтры:</span>
          </div>
          <select
            value={selectedCityId}
            onChange={(e) => setSelectedCityId(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">Все города</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.title}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => setShowOnlineOnly(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <span className="text-sm dark:text-gray-300">Только онлайн водители</span>
          </label>
        </div>
      </div>

      {/* Map Container */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="w-full h-[calc(100vh-400px)] min-h-[500px] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <MapContainer
            center={center}
            zoom={12}
            style={{ height: "calc(100vh - 400px)", minHeight: "500px", width: "100%" }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapUpdater center={center} />

            {/* Driver Markers */}
            {filteredDrivers.map((driver) => (
              <Marker
                key={driver.id}
                position={[driver.lat, driver.lon]}
                icon={createDriverIcon(driver.is_online)}
                eventHandlers={{
                  click: () => setSelectedDriver(driver),
                }}
              >
                <Popup>
                  <div className="p-2">
                    <p className="font-semibold text-sm">{driver.name}</p>
                    <p className="text-xs text-gray-500">{driver.car_model}</p>
                    <p className="text-xs text-gray-500">{driver.plate_number}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`w-2 h-2 rounded-full ${driver.is_online ? "bg-green-500" : "bg-gray-400"}`}></span>
                      <span className="text-xs">{driver.is_online ? "Онлайн" : "Оффлайн"}</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Order Markers - Pickup */}
            {orders
              .filter((order) => order.pickup_lat && order.pickup_lon)
              .map((order) => (
                <Marker
                  key={`order-${order.id}-pickup`}
                  position={[order.pickup_lat!, order.pickup_lon!]}
                  icon={createOrderIcon("green")}
                  eventHandlers={{
                    click: () => setSelectedOrder(order),
                  }}
                >
                  <Popup>
                    <div className="p-2">
                      <p className="font-semibold text-sm">Заказ {order.id}</p>
                      <p className="text-xs text-gray-500 mt-1">От: {order.pickup_title}</p>
                      <p className="text-xs text-gray-500">До: {order.dropoff_title}</p>
                      {order.passenger && (
                        <p className="text-xs text-gray-500">Пассажир: {order.passenger.full_name}</p>
                      )}
                      <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {order.status}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              ))}

            {/* Order Markers - Dropoff */}
            {orders
              .filter((order) => order.dropoff_lat && order.dropoff_lon)
              .map((order) => (
                <Marker
                  key={`order-${order.id}-dropoff`}
                  position={[order.dropoff_lat!, order.dropoff_lon!]}
                  icon={createOrderIcon("red")}
                  eventHandlers={{
                    click: () => setSelectedOrder(order),
                  }}
                >
                  <Popup>
                    <div className="p-2">
                      <p className="font-semibold text-sm">Заказ {order.id}</p>
                      <p className="text-xs text-gray-500 mt-1">Назначение: {order.dropoff_title}</p>
                      <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {order.status}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        )}

        {/* Legend */}
        <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700 z-[1000]">
          <p className="text-sm font-semibold dark:text-white mb-2">Легенда</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500"></div>
              <span className="text-xs dark:text-gray-300">Водитель онлайн</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-400"></div>
              <span className="text-xs dark:text-gray-300">Водитель оффлайн</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500"></div>
              <span className="text-xs dark:text-gray-300">Точка забора</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500"></div>
              <span className="text-xs dark:text-gray-300">Точка назначения</span>
            </div>
          </div>
        </div>
      </div>

      {/* Driver Details Panel */}
      {selectedDriver && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl">
                {selectedDriver.name[0]}
              </div>
              <div>
                <h3 className="text-xl dark:text-white">{selectedDriver.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedDriver.id}</p>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs mt-1 ${
                    selectedDriver.is_online
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedDriver.is_online ? "bg-green-600" : "bg-gray-400"}`} />
                  {selectedDriver.is_online ? "Онлайн" : "Оффлайн"}
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedDriver(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Машина</p>
              <p className="dark:text-white">{selectedDriver.car_model}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Номер</p>
              <p className="dark:text-white">{selectedDriver.plate_number}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Регион</p>
              <p className="dark:text-white">{selectedDriver.region || "Не указан"}</p>
            </div>
            <div className="md:col-span-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Координаты</p>
              <p className="dark:text-white">{selectedDriver.lat.toFixed(6)}, {selectedDriver.lon.toFixed(6)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Order Details Panel */}
      {selectedOrder && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl dark:text-white">Заказ {selectedOrder.id}</h3>
              <span className="inline-block mt-2 px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm">
                {selectedOrder.status}
              </span>
            </div>
            <button
              onClick={() => setSelectedOrder(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">От</p>
              <p className="dark:text-white">{selectedOrder.pickup_title}</p>
              {selectedOrder.pickup_lat && selectedOrder.pickup_lon && (
                <p className="text-xs text-gray-500">{selectedOrder.pickup_lat.toFixed(6)}, {selectedOrder.pickup_lon.toFixed(6)}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">До</p>
              <p className="dark:text-white">{selectedOrder.dropoff_title}</p>
              {selectedOrder.dropoff_lat && selectedOrder.dropoff_lon && (
                <p className="text-xs text-gray-500">{selectedOrder.dropoff_lat.toFixed(6)}, {selectedOrder.dropoff_lon.toFixed(6)}</p>
              )}
            </div>
            {selectedOrder.passenger && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Пассажир</p>
                <p className="dark:text-white">{selectedOrder.passenger.full_name}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
