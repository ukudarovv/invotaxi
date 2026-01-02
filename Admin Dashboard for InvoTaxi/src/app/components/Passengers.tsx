import { useState } from "react";
import { Search, Plus, Eye, Edit, Phone, Trash2, Save, X } from "lucide-react";
import { Modal } from "./Modal";

interface Passenger {
  id: string;
  name: string;
  phone: string;
  email: string;
  region: string;
  disability: string;
  companion: boolean;
  totalOrders: number;
  registered: string;
  address?: string;
  notes?: string;
}

const initialPassengers: Passenger[] = [
  {
    id: "PS001",
    name: "Алия Карим",
    phone: "+7 777 111 2222",
    email: "aliya.k@mail.kz",
    region: "Алматы",
    disability: "Категория I",
    companion: true,
    totalOrders: 45,
    registered: "15.06.2025",
    address: "мкр. Самал-1, д. 45, кв. 12",
    notes: "Требуется помощь с коляской",
  },
  {
    id: "PS002",
    name: "Ержан Бектемиров",
    phone: "+7 777 222 3333",
    email: "yerzhan.b@mail.kz",
    region: "Алматы",
    disability: "Категория II",
    companion: false,
    totalOrders: 32,
    registered: "22.07.2025",
    address: "ул. Абая 123",
  },
  {
    id: "PS003",
    name: "Сауле Тулеуова",
    phone: "+7 777 333 4444",
    email: "saule.t@mail.kz",
    region: "Алматы",
    disability: "Категория I",
    companion: true,
    totalOrders: 67,
    registered: "03.05.2025",
    address: "пр. Достык 89, кв. 34",
    notes: "Постоянный клиент",
  },
  {
    id: "PS004",
    name: "Максим Петров",
    phone: "+7 777 444 5555",
    email: "maxim.p@mail.kz",
    region: "Нур-Султан",
    disability: "Категория III",
    companion: false,
    totalOrders: 28,
    registered: "11.08.2025",
    address: "ул. Кенесары 56",
  },
  {
    id: "PS005",
    name: "Динара Сагадиева",
    phone: "+7 777 555 6666",
    email: "dinara.s@mail.kz",
    region: "Нур-Султан",
    disability: "Категория II",
    companion: true,
    totalOrders: 53,
    registered: "19.04.2025",
    address: "мкр. Сарыарка, д. 12",
  },
  {
    id: "PS006",
    name: "Игорь Ли",
    phone: "+7 777 666 7777",
    email: "igor.l@mail.kz",
    region: "Шымкент",
    disability: "Категория I",
    companion: false,
    totalOrders: 19,
    registered: "02.09.2025",
    address: "ул. Байтурсынова 78",
  },
];

const categories = ["Все", "Категория I", "Категория II", "Категория III"];

export function Passengers() {
  const [passengers, setPassengers] = useState<Passenger[]>(initialPassengers);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Все");
  const [callModal, setCallModal] = useState<{ name: string; phone: string } | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [viewModal, setViewModal] = useState<Passenger | null>(null);
  const [editModal, setEditModal] = useState<Passenger | null>(null);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    region: "",
    disability: "",
    companion: false,
    address: "",
    notes: "",
  });

  const filteredPassengers = passengers.filter((passenger) => {
    const matchesSearch =
      passenger.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      passenger.phone.includes(searchTerm) ||
      passenger.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "Все" || passenger.disability === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAddPassenger = () => {
    setEditModal(null);
    setFormData({
      name: "",
      phone: "",
      email: "",
      region: "",
      disability: "",
      companion: false,
      address: "",
      notes: "",
    });
    setCreateModal(true);
  };

  const handleEditPassenger = (passenger: Passenger) => {
    setEditModal(passenger);
    setFormData({
      name: passenger.name,
      phone: passenger.phone,
      email: passenger.email,
      region: passenger.region,
      disability: passenger.disability,
      companion: passenger.companion,
      address: passenger.address || "",
      notes: passenger.notes || "",
    });
    setCreateModal(true);
  };

  const handleSavePassenger = () => {
    if (editModal) {
      // Update existing passenger
      setPassengers(
        passengers.map((p) =>
          p.id === editModal.id
            ? {
                ...p,
                name: formData.name,
                phone: formData.phone,
                email: formData.email,
                region: formData.region,
                disability: formData.disability,
                companion: formData.companion,
                address: formData.address,
                notes: formData.notes,
              }
            : p
        )
      );
    } else {
      // Add new passenger
      const newPassenger: Passenger = {
        id: `PS${String(passengers.length + 1).padStart(3, "0")}`,
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        region: formData.region,
        disability: formData.disability,
        companion: formData.companion,
        totalOrders: 0,
        registered: new Date().toLocaleDateString("ru-RU"),
        address: formData.address,
        notes: formData.notes,
      };
      setPassengers([...passengers, newPassenger]);
    }
    setCreateModal(false);
  };

  const handleDeletePassenger = () => {
    if (deleteModal) {
      setPassengers(passengers.filter((p) => p.id !== deleteModal));
      setDeleteModal(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl dark:text-white">Управление пассажирами</h1>
          <p className="text-gray-600 dark:text-gray-400">Просмотр и управление пассажирами</p>
        </div>
        <button
          onClick={handleAddPassenger}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          <Plus className="w-5 h-5" />
          Добавить пассажира
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Всего пассажиров</p>
          <p className="text-3xl dark:text-white mt-2">{passengers.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">С сопровождением</p>
          <p className="text-3xl dark:text-white mt-2">
            {passengers.filter((p) => p.companion).length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Всего поездок</p>
          <p className="text-3xl dark:text-white mt-2">
            {passengers.reduce((acc, p) => acc + p.totalOrders, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Категория I</p>
          <p className="text-3xl dark:text-white mt-2">
            {passengers.filter((p) => p.disability === "Категория I").length}
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
              placeholder="Поиск по имени, телефону или email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategory === category
                    ? "bg-indigo-600 text-white dark:bg-indigo-500"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Passengers Table */}
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
                  Контакты
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Регион
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Категория
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Сопровождение
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Поездки
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPassengers.map((passenger) => (
                <tr key={passenger.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap dark:text-white">
                    {passenger.id}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-600 dark:text-purple-400">
                        {passenger.name[0]}
                      </div>
                      <div>
                        <p className="dark:text-white">{passenger.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Рег.: {passenger.registered}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <p className="text-gray-900 dark:text-white">{passenger.phone}</p>
                      <p className="text-gray-500 dark:text-gray-400">{passenger.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap dark:text-white">
                    {passenger.region}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-block px-3 py-1 rounded-full text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      {passenger.disability}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {passenger.companion ? (
                      <span className="text-green-600 dark:text-green-400">Да</span>
                    ) : (
                      <span className="text-gray-400">Нет</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap dark:text-white">
                    {passenger.totalOrders}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        onClick={() => setViewModal(passenger)}
                        title="Просмотр"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                        onClick={() => handleEditPassenger(passenger)}
                        title="Редактировать"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                        onClick={() => setCallModal({ name: passenger.name, phone: passenger.phone })}
                        title="Позвонить"
                      >
                        <Phone className="w-5 h-5" />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        onClick={() => setDeleteModal(passenger.id)}
                        title="Удалить"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredPassengers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">Пассажиры не найдены</p>
          </div>
        )}
      </div>

      {/* View Modal */}
      <Modal
        isOpen={viewModal !== null}
        onClose={() => setViewModal(null)}
        title="Детали пассажира"
        size="lg"
      >
        {viewModal && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-600 dark:text-purple-400 text-2xl">
                {viewModal.name[0]}
              </div>
              <div className="flex-1">
                <h3 className="text-xl dark:text-white">{viewModal.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{viewModal.id}</p>
                <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  {viewModal.disability}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-semibold dark:text-white">Контактная информация</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Телефон:</span>
                    <span className="dark:text-white">{viewModal.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Email:</span>
                    <span className="dark:text-white">{viewModal.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Регион:</span>
                    <span className="dark:text-white">{viewModal.region}</span>
                  </div>
                  {viewModal.address && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="text-gray-500 dark:text-gray-400 block mb-1">Адрес:</span>
                      <span className="dark:text-white">{viewModal.address}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold dark:text-white">Информация о клиенте</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Сопровождение:</span>
                    <span className={viewModal.companion ? "text-green-600 dark:text-green-400" : "text-gray-400"}>
                      {viewModal.companion ? "Требуется" : "Не требуется"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Всего поездок:</span>
                    <span className="dark:text-white">{viewModal.totalOrders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Зарегистрирован:</span>
                    <span className="dark:text-white">{viewModal.registered}</span>
                  </div>
                </div>
              </div>
            </div>

            {viewModal.notes && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong className="dark:text-white">Примечания:</strong> {viewModal.notes}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setCallModal({ name: viewModal.name, phone: viewModal.phone });
                  setViewModal(null);
                }}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Phone className="w-5 h-5" />
                Позвонить
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

      {/* Create/Edit Passenger Modal */}
      <Modal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        title={editModal ? "Редактировать пассажира" : "Добавить нового пассажира"}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setCreateModal(false)}
              className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Отмена
            </button>
            <button
              onClick={handleSavePassenger}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              {editModal ? "Сохранить" : "Создать"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Имя *</label>
              <input
                type="text"
                placeholder="Введите имя"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Телефон *</label>
              <input
                type="tel"
                placeholder="+7 777 123 4567"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              placeholder="email@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Регион *</label>
              <select
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Выберите регион</option>
                <option value="Алматы">Алматы</option>
                <option value="Нур-Султан">Нур-Султан</option>
                <option value="Шымкент">Шымкент</option>
                <option value="Караганда">Караганда</option>
                <option value="Актобе">Актобе</option>
              </select>
            </div>
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Категория инвалидности *</label>
              <select
                value={formData.disability}
                onChange={(e) => setFormData({ ...formData, disability: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Выберите категорию</option>
                <option value="Категория I">Категория I</option>
                <option value="Категория II">Категория II</option>
                <option value="Категория III">Категория III</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Адрес</label>
            <input
              type="text"
              placeholder="ул. Абая 123, кв. 45"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">Примечания</label>
            <textarea
              placeholder="Дополнительная информация о пассажире..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <input
              type="checkbox"
              id="companion"
              checked={formData.companion}
              onChange={(e) => setFormData({ ...formData, companion: e.target.checked })}
              className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="companion" className="text-sm text-gray-700 dark:text-gray-300">
              Требуется сопровождение
            </label>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModal !== null}
        onClose={() => setDeleteModal(null)}
        title="Удалить пассажира"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setDeleteModal(null)}
              className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Отмена
            </button>
            <button
              onClick={handleDeletePassenger}
              className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              Удалить
            </button>
          </>
        }
      >
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-gray-900 dark:text-gray-100 mb-2">
            Вы уверены, что хотите удалить этого пассажира?
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Это действие нельзя отменить.
          </p>
        </div>
      </Modal>

      {/* Call Modal */}
      <Modal
        isOpen={callModal !== null}
        onClose={() => setCallModal(null)}
        title="Позвонить пассажиру"
        size="sm"
        footer={
          callModal ? (
            <>
              <button
                onClick={() => setCallModal(null)}
                className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Отмена
              </button>
              <button className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
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
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Phone className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <p className="dark:text-white mb-1">{callModal.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">{callModal.phone}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  👤 Пассажир
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
    </div>
  );
}
