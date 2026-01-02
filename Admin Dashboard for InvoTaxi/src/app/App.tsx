import { useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Login } from "./components/Login";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { Orders } from "./components/Orders";
import { Drivers } from "./components/Drivers";
import { Passengers } from "./components/Passengers";
import { Dispatch } from "./components/Dispatch";
import { Regions } from "./components/Regions";
import { Map } from "./components/Map";
import { Analytics } from "./components/Analytics";
import { Calls } from "./components/Calls";
import { Logs } from "./components/Logs";
import { Settings } from "./components/Settings";
import { Toaster } from "./components/ui/sonner";

type PageType =
  | "dashboard"
  | "orders"
  | "drivers"
  | "passengers"
  | "dispatch"
  | "regions"
  | "map"
  | "analytics"
  | "calls"
  | "logs"
  | "settings";

function MainApp() {
  const { user, login } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageType>("dashboard");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const navigateToOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setCurrentPage("orders");
  };

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard />;
      case "orders":
        return <Orders selectedOrderId={selectedOrderId} onOrderClose={() => setSelectedOrderId(null)} />;
      case "drivers":
        return <Drivers />;
      case "passengers":
        return <Passengers />;
      case "dispatch":
        return <Dispatch />;
      case "regions":
        return <Regions />;
      case "map":
        return <Map />;
      case "analytics":
        return <Analytics />;
      case "calls":
        return <Calls onNavigateToOrder={navigateToOrder} />;
      case "logs":
        return <Logs />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  if (!user) {
    return <Login onLogin={login} />;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="flex-1 overflow-auto">
        <div className="p-8">{renderPage()}</div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <MainApp />
        <Toaster />
      </ThemeProvider>
    </AuthProvider>
  );
}