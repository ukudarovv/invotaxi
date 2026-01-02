import { useState } from "react";
import { MapPin, Users, Navigation, Filter, Car } from "lucide-react";

const mockDrivers = [
  {
    id: "DR001",
    name: "Асан Мукашев",
    phone: "+7 777 123 4567",
    car: "Toyota Camry",
    carNumber: "A 123 BC 02",
    region: "Алматы",
    online: true,
    rating: 4.8,
    address: "ул. Абая 123, кв. 45",
    lat: 43.238949,
    lng: 76.945833,
  },
  {
    id: "DR002",
    name: "Мурат Казбеков",
    phone: "+7 777 234 5678",
    car: "Hyundai Sonata",
    carNumber: "B 456 DE 02",
    region: "Алматы",
    online: true,
    rating: 4.9,
    address: "ул. Сатпаева 67",
    lat: 43.256949,
    lng: 76.925833,
  },
  {
    id: "DR003",
    name: "Олег Николаев",
    phone: "+7 777 345 6789",
    car: "Toyota Prius",
    carNumber: "C 789 FG 02",
    region: "Алматы",
    online: false,
    rating: 4.7,
    address: "мкр. Самал-2, д. 12",
    lat: 43.228949,
    lng: 76.965833,
  },
  {
    id: "DR004",
    name: "Серик Амангельдиев",
    phone: "+7 777 456 7890",
    car: "Kia K5",
    carNumber: "D 012 HI 02",
    region: "Нур-Султан",
    online: true,
    rating: 4.6,
    address: "пр. Кабанбай батыра 34",
    lat: 51.169392,
    lng: 71.449074,
  },
  {
    id: "DR005",
    name: "Дмитрий Сергеев",
    phone: "+7 777 567 8901",
    car: "Nissan Teana",
    carNumber: "E 345 JK 02",
    region: "Нур-Султан",
    online: true,
    rating: 4.9,
    address: "ул. Достык 89",
    lat: 51.159392,
    lng: 71.439074,
  },
];

const mockOrders = [
  {
    id: "ORD001",
    passenger: "Алия Карим",
    pickup: "мкр. Самал-1, д. 45",
    destination: "БЦ Нурлы Тау",
    status: "В пути",
    lat: 43.248949,
    lng: 76.935833,
  },
  {
    id: "ORD002",
    passenger: "Ержан Бектемиров",
    pickup: "ул. Абая 150",
    destination: "ТРЦ Достык Плаза",
    status: "Ожидание",
    lat: 43.268949,
    lng: 76.915833,
  },
];

export function Map() {
  const [selectedRegion, setSelectedRegion] = useState("Алматы");
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<typeof mockDrivers[0] | null>(null);

  const center = selectedRegion === "Алматы" 
    ? { lat: 43.238949, lng: 76.945833 }
    : { lat: 51.169392, lng: 71.449074 };

  const filteredDrivers = mockDrivers.filter((driver) => {
    const matchesRegion = driver.region === selectedRegion;
    const matchesOnline = !showOnlineOnly || driver.online;
    return matchesRegion && matchesOnline;
  });

  const onlineCount = filteredDrivers.filter((d) => d.online).length;
  const offlineCount = filteredDrivers.filter((d) => !d.online).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl dark:text-white">Карта диспетчеризации</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Отслеживание водителей и заказов в реальном времени
          </p>
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
              <p className="text-2xl dark:text-white">{onlineCount}</p>
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
              <p className="text-2xl dark:text-white">{offlineCount}</p>
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
              <p className="text-2xl dark:text-white">{mockOrders.length}</p>
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
              <p className="text-2xl dark:text-white">{filteredDrivers.length}</p>
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
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
          >
            <option>Алматы</option>
            <option>Нур-Султан</option>
            <option>Шымкент</option>
            <option>Караганда</option>
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

      {/* Map Container - Styled Placeholder */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="w-full h-[calc(100vh-400px)] min-h-[500px] relative bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800">
          {/* Map Placeholder with Grid */}
          <div className="absolute inset-0 opacity-10 dark:opacity-5">
            <svg className="w-full h-full">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          {/* Driver Markers */}
          <div className="absolute inset-0 overflow-hidden">
            {filteredDrivers.map((driver, index) => {
              const baseLeft = 20;
              const baseTop = 20;
              const offsetX = (index % 3) * 30;
              const offsetY = Math.floor(index / 3) * 25;
              
              return (
                <div
                  key={driver.id}
                  className="absolute cursor-pointer transform -translate-x-1/2 -translate-y-1/2 group"
                  style={{
                    left: `${baseLeft + offsetX}%`,
                    top: `${baseTop + offsetY}%`,
                  }}
                  onClick={() => setSelectedDriver(driver)}
                >
                  {/* Marker Pin */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${
                    driver.online 
                      ? "bg-green-500 dark:bg-green-600" 
                      : "bg-gray-400 dark:bg-gray-600"
                  }`}>
                    <Car className="w-5 h-5 text-white" />
                  </div>
                  
                  {/* Pulse Animation for Online Drivers */}
                  {driver.online && (
                    <div className="absolute inset-0 rounded-full bg-green-500 dark:bg-green-600 animate-ping opacity-30"></div>
                  )}
                  
                  {/* Hover Info */}
                  <div className="absolute left-12 top-0 hidden group-hover:block z-10">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 min-w-[200px] border border-gray-200 dark:border-gray-700">
                      <p className="font-semibold dark:text-white text-sm">{driver.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{driver.car}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{driver.carNumber}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`w-2 h-2 rounded-full ${driver.online ? "bg-green-500" : "bg-gray-400"}`}></span>
                        <span className="text-xs dark:text-gray-300">{driver.online ? "Онлайн" : "Оффлайн"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Order Markers */}
            {mockOrders.map((order, index) => {
              const baseLeft = 50;
              const baseTop = 40;
              const offsetX = (index % 2) * 25;
              const offsetY = Math.floor(index / 2) * 30;
              
              return (
                <div
                  key={order.id}
                  className="absolute cursor-pointer transform -translate-x-1/2 -translate-y-1/2 group"
                  style={{
                    left: `${baseLeft + offsetX}%`,
                    top: `${baseTop + offsetY}%`,
                  }}
                >
                  {/* Order Pin */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 bg-blue-500 dark:bg-blue-600">
                    <MapPin className="w-4 h-4 text-white" />
                  </div>
                  
                  {/* Hover Info */}
                  <div className="absolute left-10 top-0 hidden group-hover:block z-10">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 min-w-[200px] border border-gray-200 dark:border-gray-700">
                      <p className="font-semibold dark:text-white text-sm">{order.passenger}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">От: {order.pickup}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">До: {order.destination}</p>
                      <span className="inline-block mt-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs">
                        {order.status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Map Center Indicator */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-4 h-4 rounded-full bg-indigo-500 dark:bg-indigo-400 opacity-50"></div>
          </div>

          {/* Map Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2">
            <button className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700">
              <span className="text-xl dark:text-white">+</span>
            </button>
            <button className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700">
              <span className="text-xl dark:text-white">−</span>
            </button>
          </div>

          {/* Legend */}
          <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
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
                <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                <span className="text-xs dark:text-gray-300">Активный заказ</span>
              </div>
            </div>
          </div>

          {/* Region Label */}
          <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg px-4 py-2 border border-gray-200 dark:border-gray-700">
            <p className="text-sm font-semibold dark:text-white">{selectedRegion}</p>
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
                    selectedDriver.online
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedDriver.online ? "bg-green-600" : "bg-gray-400"}`} />
                  {selectedDriver.online ? "Онлайн" : "Оффлайн"}
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Телефон</p>
              <p className="dark:text-white">{selectedDriver.phone}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Машина</p>
              <p className="dark:text-white">{selectedDriver.car}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Номер</p>
              <p className="dark:text-white">{selectedDriver.carNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Рейтинг</p>
              <p className="dark:text-white">⭐ {selectedDriver.rating}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">Адрес</p>
              <p className="dark:text-white">{selectedDriver.address}</p>
            </div>
          </div>
        </div>
      )}

      {/* Info Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>💡 Демо режим:</strong> Это интерактивная карта-заглушка. Для работы с реальной картой подключите Google Maps API или другой картографический сервис.
        </p>
      </div>
    </div>
  );
}
