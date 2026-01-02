import { useState, useEffect } from "react";
import { Search, Filter, Plus, Eye, Edit, X, Check, UserCircle, Car as CarIcon, Phone, MapPin } from "lucide-react";
import { Modal } from "./Modal";
import { RouteMapPicker } from "./RouteMapPicker";

const mockOrders = [
  {
    id: "#4532",
    passenger: "Алия Карим",
    driver: "Асан Мукашев",
    from: "ул. Абая 143",
    to: "пр. Достык 67",
    status: "В пути",
    time: "10:30",
    date: "02.01.2026",
    price: "2,500 ₸",
  },
  {
    id: "#4531",
    passenger: "Ержан Бектемиров",
    driver: "Неназначен",
    from: "ул. Фурманова 85",
    to: "ул. Розыбакиева 120",
    status: "Ожидание",
    time: "10:25",
    date: "02.01.2026",
    price: "1,800 ₸",
  },
  {
    id: "#4530",
    passenger: "Сауле Тулеуова",
    driver: "Мурат Казбеков",
    from: "мкр. Самал 34",
    to: "Аэропорт",
    status: "Выполнено",
    time: "10:15",
    date: "02.01.2026",
    price: "3,200 ₸",
  },
  {
    id: "#4529",
    passenger: "Максим Петров",
    driver: "Олег Николаев",
    from: "ул. Масанчи 12",
    to: "ТРЦ Мега",
    status: "В пути",
    time: "10:10",
    date: "02.01.2026",
    price: "2,100 ₸",
  },
  {
    id: "#4528",
    passenger: "Динара Сагадиева",
    driver: "Серик Амангельдиев",
    from: "пр. Назарбаева 45",
    to: "ул. Толе би 89",
    status: "Выполнено",
    time: "09:50",
    date: "02.01.2026",
    price: "1,600 ₸",
  },
  {
    id: "#4527",
    passenger: "Игорь Ли",
    driver: "Неназначен",
    from: "мкр. Аксай 23",
    to: "ул. Байтурсынова 76",
    status: "Отменён",
    time: "09:30",
    date: "02.01.2026",
    price: "2,800 ₸",
  },
];

const statuses = ["Все", "Ожидание", "В пути", "Выполнено", "Отменён"];

interface OrdersProps {
  selectedOrderId?: string | null;
  onOrderClose?: () => void;
}

export function Orders({ selectedOrderId, onOrderClose }: OrdersProps = {}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("Все");
  const [viewModal, setViewModal] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [callModal, setCallModal] = useState<{ name: string; phone: string; type: string } | null>(null);
  const [createModal, setCreateModal] = useState(false);
  
  // Состояние для создания заказа
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lon: number } | null>(null);

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

  const filteredOrders = mockOrders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.passenger.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.driver.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      selectedStatus === "Все" || order.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

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

  const selectedOrder = mockOrders.find(
    (o) => o.id === viewModal || o.id === editModal || o.id === assignModal
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl dark:text-white">Управление заказами</h1>
          <p className="text-gray-600 dark:text-gray-400">Просмотр и управление всеми заказами</p>
        </div>
        <button 
          onClick={() => setCreateModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          <Plus className="w-5 h-5" />
          Создать заказ
        </button>
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

      {/* Orders Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Пассажир
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Водитель
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Маршрут
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Время
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Цена
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredOrders.map((order) => (
                <tr 
                  key={order.id} 
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedOrderId === order.id 
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-500 dark:ring-indigo-400' 
                      : ''
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap dark:text-white">
                    {order.id}
                  </td>
                  <td className="px-6 py-4 dark:text-white">{order.passenger}</td>
                  <td className="px-6 py-4 dark:text-white">
                    {order.driver === "Неназначен" ? (
                      <span className="text-gray-400 dark:text-gray-500">{order.driver}</span>
                    ) : (
                      order.driver
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <p className="text-gray-900 dark:text-white">{order.from}</p>
                      <p className="text-gray-500 dark:text-gray-400">→ {order.to}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs ${getStatusColor(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <div>
                      <p>{order.date}</p>
                      <p>{order.time}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap dark:text-white">
                    {order.price}
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
                      {order.driver === "Неназначен" && (
                        <button
                          onClick={() => setAssignModal(order.id)}
                          className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                          title="Назначить водителя"
                        >
                          <CarIcon className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => setCallModal({ name: order.passenger, phone: "+7 777 123 4567", type: "passenger" })}
                        className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                        title="Позвонить пассажиру"
                      >
                        <Phone className="w-5 h-5" />
                      </button>
                      {order.driver !== "Неназначен" && (
                        <button
                          onClick={() => setCallModal({ name: order.driver, phone: "+7 777 987 6543", type: "driver" })}
                          className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                          title="Позвонить водителю"
                        >
                          <Phone className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                <p className="text-lg dark:text-white">{selectedOrder.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Статус</p>
                <span className={`inline-block px-3 py-1 rounded-full text-xs ${getStatusColor(selectedOrder.status)}`}>
                  {selectedOrder.status}
                </span>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Пассажир</p>
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <UserCircle className="w-10 h-10 text-gray-400" />
                <div>
                  <p className="dark:text-white">{selectedOrder.passenger}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">+7 777 123 4567</p>
                </div>
              </div>
            </div>

            {selectedOrder.driver !== "Неназначен" && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Водитель</p>
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <CarIcon className="w-10 h-10 text-gray-400" />
                  <div>
                    <p className="dark:text-white">{selectedOrder.driver}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">+7 777 987 6543</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Маршрут</p>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Дата и время</p>
                <p className="dark:text-white">{selectedOrder.date} в {selectedOrder.time}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Стоимость</p>
                <p className="text-xl text-green-600 dark:text-green-400">{selectedOrder.price}</p>
              </div>
            </div>

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
        onClose={() => setEditModal(null)}
        title="Редактировать заказ"
        size="md"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Статус</label>
              <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
                <option>{selectedOrder.status}</option>
                <option>Ожидание</option>
                <option>В пути</option>
                <option>Выполнено</option>
                <option>Отменён</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Примечания</label>
              <textarea
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                placeholder="Добавьте примечания к заказу..."
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2">
                <Check className="w-5 h-5" />
                Сохранить
              </button>
              <button
                onClick={() => setEditModal(null)}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2"
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
        onClose={() => setAssignModal(null)}
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
              {["Асан Мукашев", "Мурат Казбеков", "Дмитрий Сергеев"].map((driver) => (
                <button
                  key={driver}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    {driver[0]}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="dark:text-white">{driver}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Toyota Camry • 2.3 км</p>
                  </div>
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-4">
              <button className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700">
                Назначить
              </button>
              <button
                onClick={() => setAssignModal(null)}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
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
          Показано {filteredOrders.length} из {mockOrders.length} заказов
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
              }}
              className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Отмена
            </button>
            <button className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Создать заказ
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Пассажир *</label>
            <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white">
              <option value="">Выберите пассажира</option>
              <option value="ps001">Алия Карим (+7 777 111 2222)</option>
              <option value="ps002">Ержан Бектемиров (+7 777 222 3333)</option>
              <option value="ps003">Сауле Тулеуова (+7 777 333 4444)</option>
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
                Откуда (адрес) *
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
                Куда (адрес) *
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
                defaultValue="2026-01-02"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Время *</label>
              <input
                type="time"
                defaultValue="10:30"
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
              placeholder="Дополнительная информация о заказе..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}