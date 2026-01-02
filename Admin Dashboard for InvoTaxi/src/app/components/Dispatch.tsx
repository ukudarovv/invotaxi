import { useState } from "react";
import { Clock, MapPin, User, Car, Phone, Check, X } from "lucide-react";
import { Modal } from "./Modal";

const queueOrders = [
  {
    id: "#4533",
    passenger: "Анна Смирнова",
    phone: "+7 777 888 9999",
    from: "ул. Жибек Жолы 123",
    to: "ул. Сатпаева 45",
    time: "10:45",
    priority: "Высокий",
    requirements: "Инвалидная коляска",
  },
  {
    id: "#4534",
    passenger: "Болат Нурмагамбетов",
    phone: "+7 777 777 8888",
    from: "мкр. Коктем 15",
    to: "ул. Абылай хана 89",
    time: "11:00",
    priority: "Средний",
    requirements: "Сопровождение",
  },
  {
    id: "#4535",
    passenger: "Елена Викторовна",
    phone: "+7 777 666 5555",
    from: "пр. Аль-Фараби 77",
    to: "Больница №1",
    time: "11:15",
    priority: "Высокий",
    requirements: "Инвалидная коляска + кислород",
  },
];

const availableDrivers = [
  {
    id: "DR001",
    name: "Асан Мукашев",
    car: "Toyota Camry • A 123 BC",
    distance: "1.2 км",
    rating: 4.8,
    capacity: "Инвалидная коляска",
    eta: "5 мин",
  },
  {
    id: "DR002",
    name: "Мурат Казбеков",
    car: "Hyundai Sonata • B 456 DE",
    distance: "2.5 км",
    rating: 4.9,
    capacity: "Инвалидная коляска + сопровождение",
    eta: "8 мин",
  },
  {
    id: "DR003",
    name: "Дмитрий Сергеев",
    car: "Nissan Teana • E 345 JK",
    distance: "3.1 км",
    rating: 4.9,
    capacity: "Инвалидная коляска + сопровождение",
    eta: "10 мин",
  },
];

const activeOrders = [
  {
    id: "#4532",
    passenger: "Алия Карим",
    driver: "Асан Мукашев",
    from: "ул. Абая 143",
    to: "пр. Достык 67",
    status: "В пути",
    progress: 60,
  },
  {
    id: "#4529",
    passenger: "Максим Петров",
    driver: "Олег Николаев",
    from: "ул. Масанчи 12",
    to: "ТРЦ Мега",
    status: "Водитель едет",
    progress: 30,
  },
];

export function Dispatch() {
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const selectedOrder = queueOrders.find((order) => order.id === assignModal);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl dark:text-white">Диспетчеризация</h1>
          <p className="text-gray-600 dark:text-gray-400">Управление текущими заказами и назначение водителей</p>
        </div>
        <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          Автоматическое назначение
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">В очереди</p>
          <p className="text-3xl mt-2 text-orange-600 dark:text-orange-400">{queueOrders.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">В процессе</p>
          <p className="text-3xl mt-2 text-blue-600 dark:text-blue-400">{activeOrders.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Доступно водителей</p>
          <p className="text-3xl mt-2 text-green-600 dark:text-green-400">{availableDrivers.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Среднее время ожидания</p>
          <p className="text-3xl mt-2 dark:text-white">4 мин</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Queue Orders */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl mb-4 dark:text-white">Очередь заказов</h2>
          <div className="space-y-4">
            {queueOrders.map((order) => (
              <div
                key={order.id}
                className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm text-gray-500 dark:text-gray-400">{order.id}</span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          order.priority === "Высокий"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        }`}
                      >
                        {order.priority}
                      </span>
                    </div>
                    <p className="flex items-center gap-2 dark:text-white">
                      <User className="w-4 h-4 text-gray-400" />
                      {order.passenger}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                      <Phone className="w-4 h-4" />
                      {order.phone}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="w-4 h-4" />
                    {order.time}
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  <p className="text-sm flex items-start gap-2 dark:text-gray-300">
                    <MapPin className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                    <span>{order.from}</span>
                  </p>
                  <p className="text-sm flex items-start gap-2 dark:text-gray-300">
                    <MapPin className="w-4 h-4 text-red-600 dark:text-red-400 mt-1 flex-shrink-0" />
                    <span>{order.to}</span>
                  </p>
                </div>

                <div className="mb-3">
                  <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                    {order.requirements}
                  </span>
                </div>

                <button 
                  onClick={() => setAssignModal(order.id)}
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                >
                  Назначить водителя
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Available Drivers */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl mb-4 dark:text-white">Доступные водители</h2>
          <div className="space-y-4">
            {availableDrivers.map((driver) => (
              <div
                key={driver.id}
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
                      {driver.car}
                    </p>
                  </div>
                  <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-600 dark:bg-green-400" />
                    Онлайн
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Расстояние</p>
                    <p className="dark:text-white">{driver.distance}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Прибытие</p>
                    <p className="dark:text-white">{driver.eta}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Рейтинг</p>
                    <p className="dark:text-white">⭐ {driver.rating}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                    {driver.capacity}
                  </span>
                </div>

                <button className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700">
                  Назначить
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Orders */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl mb-4 dark:text-white">Активные заказы</h2>
        <div className="space-y-4">
          {activeOrders.map((order) => (
            <div
              key={order.id}
              className="border border-gray-200 dark:border-gray-600 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{order.id}</span>
                  <p className="mt-1 dark:text-white">
                    <strong>{order.passenger}</strong> → <strong>{order.driver}</strong>
                  </p>
                </div>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-sm">
                  {order.status}
                </span>
              </div>

              <div className="space-y-2 mb-3">
                <p className="text-sm flex items-start gap-2 dark:text-gray-300">
                  <MapPin className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                  <span>{order.from}</span>
                </p>
                <p className="text-sm flex items-start gap-2 dark:text-gray-300">
                  <MapPin className="w-4 h-4 text-red-600 dark:text-red-400 mt-1 flex-shrink-0" />
                  <span>{order.to}</span>
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-500 dark:text-gray-400">Прогресс</span>
                  <span className="dark:text-white">{order.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${order.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
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
            {/* Order Info */}
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Заказ</p>
              <div className="space-y-2">
                <p className="dark:text-white">
                  <strong>{selectedOrder.id}</strong> - {selectedOrder.passenger}
                </p>
                <div className="text-sm space-y-1">
                  <p className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{selectedOrder.from}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{selectedOrder.to}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                    {selectedOrder.requirements}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    selectedOrder.priority === "Высокий"
                      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  }`}>
                    {selectedOrder.priority}
                  </span>
                </div>
              </div>
            </div>

            {/* Drivers List */}
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">Выберите водителя</p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {availableDrivers.map((driver) => (
                  <button
                    key={driver.id}
                    onClick={() => setSelectedDriver(driver.id)}
                    className={`w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left ${
                      selectedDriver === driver.id
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
                          {driver.car}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 mt-1">
                        <span>{driver.distance} • {driver.eta}</span>
                        <span>⭐ {driver.rating}</span>
                      </div>
                    </div>
                    {selectedDriver === driver.id && (
                      <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}