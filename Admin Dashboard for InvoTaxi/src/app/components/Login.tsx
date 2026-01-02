import { useState } from "react";
import { User, Lock, LogIn } from "lucide-react";
import { UserRole } from "../context/AuthContext";

interface LoginProps {
  onLogin: (role: UserRole, email: string, password: string) => void;
}

const mockUsers = {
  admin: {
    email: "admin@invotaxi.kz",
    password: "admin123",
    name: "Администратор",
    phone: "+7 777 000 0000",
  },
  dispatcher: {
    email: "dispatcher@invotaxi.kz",
    password: "dispatcher123",
    name: "Диспетчер",
    phone: "+7 777 000 0001",
  },
  operator: {
    email: "operator@invotaxi.kz",
    password: "operator123",
    name: "Оператор",
    phone: "+7 777 000 0002",
  },
};

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("admin");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate credentials
    const mockUser = mockUsers[selectedRole];
    if (email === mockUser.email && password === mockUser.password) {
      onLogin(selectedRole, email, password);
    } else {
      setError("Неверный email или пароль");
    }
  };

  const handleQuickLogin = (role: UserRole) => {
    const mockUser = mockUsers[role];
    setEmail(mockUser.email);
    setPassword(mockUser.password);
    setSelectedRole(role);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-gray-900 dark:via-indigo-900 dark:to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block p-4 bg-white dark:bg-gray-800 rounded-full shadow-lg mb-4">
            <svg
              className="w-16 h-16 text-indigo-600 dark:text-indigo-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h1 className="text-4xl text-white mb-2">InvoTaxi</h1>
          <p className="text-indigo-100 dark:text-indigo-300">Админ-панель управления</p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl text-center mb-6 dark:text-white">Вход в систему</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role Selection */}
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
                Роль пользователя
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRole("admin")}
                  className={`py-2 px-3 rounded-lg text-sm transition-all ${
                    selectedRole === "admin"
                      ? "bg-indigo-600 text-white shadow-lg"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  Админ
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRole("dispatcher")}
                  className={`py-2 px-3 rounded-lg text-sm transition-all ${
                    selectedRole === "dispatcher"
                      ? "bg-indigo-600 text-white shadow-lg"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  Диспетчер
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRole("operator")}
                  className={`py-2 px-3 rounded-lg text-sm transition-all ${
                    selectedRole === "operator"
                      ? "bg-indigo-600 text-white shadow-lg"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  Оператор
                </button>
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
                Email
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Введите email"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
                Пароль
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              <LogIn className="w-5 h-5" />
              Войти
            </button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 text-center">
              Быстрый вход:
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("admin")}
                className="w-full text-left p-3 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors"
              >
                <p className="text-sm font-medium text-indigo-900 dark:text-indigo-300">
                  👑 Администратор
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400">
                  admin@invotaxi.kz / admin123
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin("dispatcher")}
                className="w-full text-left p-3 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
              >
                <p className="text-sm font-medium text-purple-900 dark:text-purple-300">
                  📡 Диспетчер
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  dispatcher@invotaxi.kz / dispatcher123
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin("operator")}
                className="w-full text-left p-3 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-lg transition-colors"
              >
                <p className="text-sm font-medium text-green-900 dark:text-green-300">
                  📞 Оператор
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  operator@invotaxi.kz / operator123
                </p>
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-indigo-100 dark:text-indigo-300 text-sm mt-6">
          © 2025 InvoTaxi. Все права защищены.
        </p>
      </div>
    </div>
  );
}
