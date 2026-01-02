import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type UserRole = "admin" | "dispatcher" | "operator";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  login: (role: UserRole, email: string, password: string) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Права доступа для разных ролей
const rolePermissions: Record<UserRole, string[]> = {
  admin: [
    "view_dashboard",
    "manage_orders",
    "view_drivers",
    "view_passengers",
    "manage_regions",
    "view_analytics",
    "manage_settings",
    "manage_users",
    "dispatch",
    "make_calls",
    "view_logs",
    "view_map",
  ],
  dispatcher: [
    "view_dashboard",
    "manage_orders",
    "view_drivers",
    "view_passengers",
    "dispatch",
    "view_analytics",
    "view_map",
  ],
  operator: [
    "view_dashboard",
    "manage_orders",
    "view_drivers",
    "view_passengers",
    "make_calls",
    "view_call_history",
    "view_map",
  ],
};

// Mock users database
const mockUsers: Record<string, { email: string; password: string; name: string; phone: string; role: UserRole }> = {
  "admin@invotaxi.kz": {
    email: "admin@invotaxi.kz",
    password: "admin123",
    name: "Администратор",
    phone: "+7 777 000 0000",
    role: "admin",
  },
  "dispatcher@invotaxi.kz": {
    email: "dispatcher@invotaxi.kz",
    password: "dispatcher123",
    name: "Диспетчер 1",
    phone: "+7 777 000 0001",
    role: "dispatcher",
  },
  "operator@invotaxi.kz": {
    email: "operator@invotaxi.kz",
    password: "operator123",
    name: "Оператор 1",
    phone: "+7 777 000 0002",
    role: "operator",
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = (role: UserRole, email: string, password: string) => {
    const mockUser = mockUsers[email];
    if (mockUser && mockUser.password === password && mockUser.role === role) {
      const newUser: User = {
        id: `USR${Date.now()}`,
        name: mockUser.name,
        email: mockUser.email,
        role: mockUser.role,
        phone: mockUser.phone,
      };
      setUser(newUser);
      // Save to localStorage
      localStorage.setItem("invotaxi_user", JSON.stringify(newUser));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("invotaxi_user");
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return rolePermissions[user.role].includes(permission);
  };

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem("invotaxi_user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}