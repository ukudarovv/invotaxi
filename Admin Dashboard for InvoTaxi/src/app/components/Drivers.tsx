import { useState } from "react";
import { Search, Plus, Eye, Edit, MapPin, Phone, Mail, X, Check, Car as CarIcon, Trash2, Save } from "lucide-react";
import { Modal } from "./Modal";
import { MapView } from "./MapView";

interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  car: string;
  carNumber: string;
  region: string;
  online: boolean;
  totalOrders: number;
  rating: number;
  capacity: string;
  address: string;
  licenseNumber: string;
}

const initialDrivers: Driver[] = [
  {
    id: "DR001",
    name: "Асан Мукашев",
    phone: "+7 777 123 4567",
    email: "asan.m@invotaxi.kz",
    car: "Toyota Camry",
    carNumber: "A 123 BC 02",
    region: "Алматы",
    online: true,
    totalOrders: 245,
    rating: 4.8,
    capacity: "Инвалидная коляска",
    address: "ул. Абая 123, кв. 45",
    licenseNumber: "AB 1234567",
  },
  {
    id: "DR002",
    name: "Мурат Казбеков",
    phone: "+7 777 234 5678",
    email: "murat.k@invotaxi.kz",
    car: "Hyundai Sonata",
    carNumber: "B 456 DE 02",
    region: "Алматы",
    online: true,
    totalOrders: 189,
    rating: 4.9,
    capacity: "Инвалидная коляска + сопровождение",
    address: "ул. Сатпаева 67",
    licenseNumber: "AB 7654321",
  },
  {
    id: "DR003",
    name: "Олег Николаев",
    phone: "+7 777 345 6789",
    email: "oleg.n@invotaxi.kz",
    car: "Toyota Prius",
    carNumber: "C 789 FG 02",
    region: "Алматы",
    online: false,
    totalOrders: 312,
    rating: 4.7,
    capacity: "Инвалидная коляска",
    address: "мкр. Самал-2, д. 12",
    licenseNumber: "AB 9876543",
  },
  {
    id: "DR004",
    name: "Серик Амангельдиев",
    phone: "+7 777 456 7890",
    email: "serik.a@invotaxi.kz",
    car: "Kia K5",
    carNumber: "D 012 HI 02",
    region: "Нур-Султан",
    online: true,
    totalOrders: 156,
    rating: 4.6,
    capacity: "Инвалидная коляска",
    address: "пр. Кабанбай батыра 34",
    licenseNumber: "AB 5555555",
  },
  {
    id: "DR005",
    name: "Дмитрий Сергеев",
    phone: "+7 777 567 8901",
    email: "dmitry.s@invotaxi.kz",
    car: "Nissan Teana",
    carNumber: "E 345 JK 02",
    region: "Нур-Султан",
    online: true,
    totalOrders: 203,
    rating: 4.9,
    capacity: "Инвалидная коляска + сопровождение",
    address: "ул. Достык 89",
    licenseNumber: "AB 3333333",
  },
];

export function Drivers() {
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  const [searchTerm, setSearchTerm] = useState("");
  const [onlineFilter, setOnlineFilter] = useState<"all" | "online" | "offline">("all");
  const [viewModal, setViewModal] = useState<Driver | null>(null);
  const [editModal, setEditModal] = useState<Driver | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [callModal, setCallModal] = useState<{ name: string; phone: string } | null>(null);
  const [mapModal, setMapModal] = useState<string | null>(null);

  const filteredDrivers = drivers.filter((driver) => {
    const matchesSearch =
      driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.car.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.carNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOnline =
      onlineFilter === "all" ||
      (onlineFilter === "online" && driver.online) ||
      (onlineFilter === "offline" && !driver.online);
    return matchesSearch && matchesOnline;
  });

  const mapDriver = drivers.find((d) => d.id === mapModal);

  const handleDeleteDriver = () => {
    if (deleteModal) {
      setDrivers(drivers.filter((d) => d.id !== deleteModal));
      setDeleteModal(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl dark:text-white">Управление водителями</h1>
          <p className="text-gray-600 dark:text-gray-400">Просмотр и управление водителями</p>
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          <Plus className="w-5 h-5" />
          Добавить водителя
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Всего водителей</p>
          <p className="text-3xl dark:text-white mt-2">{drivers.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Онлайн</p>
          <p className="text-3xl text-green-600 dark:text-green-400 mt-2">
            {drivers.filter((d) => d.online).length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Средний рейтинг</p>
          <p className="text-3xl dark:text-white mt-2">
            {(drivers.reduce((acc, d) => acc + d.rating, 0) / drivers.length).toFixed(1)}
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
              placeholder="Поиск по имени, машине или номеру..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOnlineFilter("all")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                onlineFilter === "all"
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setOnlineFilter("online")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                onlineFilter === "online"
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              Онлайн
            </button>
            <button
              onClick={() => setOnlineFilter("offline")}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                onlineFilter === "offline"
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              Оффлайн
            </button>
          </div>
        </div>
      </div>

      {/* Drivers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDrivers.map((driver) => (
          <div key={driver.id} className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xl">
                  {driver.name[0]}
                </div>
                <div>
                  <h3 className="text-lg dark:text-white">{driver.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{driver.id}</p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs ${
                  driver.online
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${driver.online ? "bg-green-600" : "bg-gray-400"}`} />
                {driver.online ? "Онлайн" : "Оффлайн"}
              </span>
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Телефон:</span>
                <span className="dark:text-white">{driver.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Машина:</span>
                <span className="dark:text-white">{driver.car}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Номер:</span>
                <span className="dark:text-white">{driver.carNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Регион:</span>
                <span className="dark:text-white">{driver.region}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Вместимость:</span>
                <span className="text-xs dark:text-white">{driver.capacity}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Заказы</p>
                <p className="text-xl dark:text-white">{driver.totalOrders}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Рейтинг</p>
                <p className="text-xl dark:text-white">⭐ {driver.rating}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewModal(driver)}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  title="Просмотр"
                >
                  <Eye className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setEditModal(driver)}
                  className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                  title="Редактировать"
                >
                  <Edit className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCallModal({ name: driver.name, phone: driver.phone })}
                  className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                  title="Позвонить"
                >
                  <Phone className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setMapModal(driver.id)}
                  className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                  title="На карте"
                >
                  <MapPin className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setDeleteModal(driver.id)}
                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  title="Удалить"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* View Modal */}
      <Modal
        isOpen={viewModal !== null}
        onClose={() => setViewModal(null)}
        title="Детали водителя"
        size="lg"
      >
        {viewModal && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl">
                {viewModal.name[0]}
              </div>
              <div className="flex-1">
                <h3 className="text-xl dark:text-white">{viewModal.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{viewModal.id}</p>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs mt-2 ${
                    viewModal.online
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${viewModal.online ? "bg-green-600" : "bg-gray-400"}`} />
                  {viewModal.online ? "Онлайн" : "Оффлайн"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="font-semibold dark:text-white">Контактная информация</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-sm dark:text-gray-300">{viewModal.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-sm dark:text-gray-300">{viewModal.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-sm dark:text-gray-300">{viewModal.address}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold dark:text-white">Информация о машине</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CarIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm dark:text-gray-300">{viewModal.car}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Номер:</span>
                    <span className="text-sm dark:text-white">{viewModal.carNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Вместимость:</span>
                    <span className="text-sm dark:text-white">{viewModal.capacity}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Регион</p>
                <p className="text-lg dark:text-white mt-1">{viewModal.region}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Всего заказов</p>
                <p className="text-lg dark:text-white mt-1">{viewModal.totalOrders}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Рейтинг</p>
                <p className="text-lg dark:text-white mt-1">⭐ {viewModal.rating}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Водительское удостоверение</p>
              <p className="dark:text-white">{viewModal.licenseNumber}</p>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button 
                onClick={() => {
                  setMapModal(viewModal.id);
                  setViewModal(null);
                }}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
              >
                Посмотреть на карте
              </button>
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

      {/* Edit Modal */}
      <Modal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        title="Редактировать водителя"
        size="lg"
      >
        {editModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Имя</label>
                <input
                  type="text"
                  defaultValue={editModal.name}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Телефон</label>
                <input
                  type="tel"
                  defaultValue={editModal.phone}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Email</label>
                <input
                  type="email"
                  defaultValue={editModal.email}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Регион</label>
                <select
                  defaultValue={editModal.region}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                >
                  <option>Алматы</option>
                  <option>Нур-Султан</option>
                  <option>Шымкент</option>
                  <option>Караганда</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Машина</label>
                <input
                  type="text"
                  defaultValue={editModal.car}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Гос. номер</label>
                <input
                  type="text"
                  defaultValue={editModal.carNumber}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Вместимость</label>
              <select
                defaultValue={editModal.capacity}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              >
                <option>Инвалидная коляска</option>
                <option>Инвалидная коляска + сопровождение</option>
                <option>Инвалидная коляска + кислород</option>
              </select>
            </div>

            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <input
                type="checkbox"
                id="online-status"
                defaultChecked={editModal.online}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <label htmlFor="online-status" className="text-sm dark:text-gray-300">
                Водитель онлайн
              </label>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
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

      {/* Add Driver Modal */}
      <Modal
        isOpen={addModal}
        onClose={() => setAddModal(false)}
        title="Добавить водителя"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Имя *</label>
              <input
                type="text"
                placeholder="Иванов Иван Иванович"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Телефон *</label>
              <input
                type="tel"
                placeholder="+7 777 123 4567"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Email *</label>
              <input
                type="email"
                placeholder="driver@invotaxi.kz"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Регион *</label>
              <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
                <option value="">Выберите регион</option>
                <option>Алматы</option>
                <option>Нур-Султан</option>
                <option>Шымкент</option>
                <option>Караганда</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Адрес</label>
            <input
              type="text"
              placeholder="ул. Абая 123, кв. 45"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Машина *</label>
              <input
                type="text"
                placeholder="Toyota Camry"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Гос. номер *</label>
              <input
                type="text"
                placeholder="A 123 BC 02"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">В/У номер *</label>
              <input
                type="text"
                placeholder="AB 1234567"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Вместимость *</label>
            <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white">
              <option value="">Выберите вместимость</option>
              <option>Инвалидная коляска</option>
              <option>Инвалидная коляска + сопровождение</option>
              <option>Инвалидная коляска + кислород</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2">
              <Check className="w-5 h-5" />
              Добавить водителя
            </button>
            <button
              onClick={() => setAddModal(false)}
              className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" />
              Отмена
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModal !== null}
        onClose={() => setDeleteModal(null)}
        title="Удалить водителя"
        size="sm"
        footer={
          deleteModal ? (
            <>
              <button
                onClick={() => setDeleteModal(null)}
                className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleDeleteDriver}
                className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 shadow-lg shadow-red-500/30"
              >
                <Trash2 className="w-5 h-5" />
                Удалить
              </button>
            </>
          ) : undefined
        }
      >
        {deleteModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 rounded-xl border border-red-200 dark:border-red-800">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center ring-4 ring-red-50 dark:ring-red-900/50">
                <Trash2 className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <p className="dark:text-white mb-1">Вы уверены, что хотите удалить этого водителя?</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">Это действие необратимо.</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  🚗 Водитель
                </p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                💡 <strong>Совет:</strong> Убедитесь, что вы действительно хотите удалить этого водителя.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Call Modal */}
      <Modal
        isOpen={callModal !== null}
        onClose={() => setCallModal(null)}
        title="Позвонить водителю"
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
                  🚗 Водитель
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

      {/* Map Modal */}
      <Modal
        isOpen={mapModal !== null}
        onClose={() => setMapModal(null)}
        title="Карта водителя"
        size="lg"
      >
        {mapDriver && (
          <div className="h-96">
            <MapView
              center={[43.238949, 76.945833]}
              zoom={13}
              markerPosition={[43.238949, 76.945833]}
              popupContent={`${mapDriver.name}<br />${mapDriver.address}`}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}