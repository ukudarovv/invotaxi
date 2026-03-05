import { useState, useEffect, useRef } from "react";
import {
  Calendar, MapPin, Clock, Car, User, Loader2, RefreshCw, CheckCircle, AlertCircle, Route, Users, Navigation, Brain, BarChart3, Download,
} from "lucide-react";
import { dispatchApi, DailyRoutesResponse, DailyRoute, MLScoreDetails } from "../services/dispatch";
import { toast } from "sonner";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: string): string {
  const m: Record<string, string> = {
    submitted: "Новый",
    active_queue: "В очереди",
    awaiting_dispatcher_decision: "Ожидает",
    assigned: "Назначен",
    driver_en_route: "В пути",
    ride_ongoing: "Поездка",
    completed: "Завершён",
    cancelled: "Отменён",
  };
  return m[status] || status;
}

function statusColor(status: string): string {
  if (["assigned", "driver_en_route", "ride_ongoing"].includes(status))
    return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (["submitted", "active_queue", "awaiting_dispatcher_decision"].includes(status))
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
}

function ScoreBar({ label, value, color, extra }: { label: string; value: number; color: string; extra?: string }) {
  const pct = Math.round(value * 100);
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    orange: "bg-orange-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
  };
  const bgColor = colorMap[color] || "bg-gray-500";
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="font-mono text-gray-800 dark:text-gray-200">{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${bgColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {extra && <p className="text-gray-400 dark:text-gray-500 mt-0.5">{extra}</p>}
    </div>
  );
}

export function DailyRoutes() {
  const [data, setData] = useState<DailyRoutesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [expandedDriver, setExpandedDriver] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<ymaps.Map | null>(null);
  const [ymapsReady, setYmapsReady] = useState(false);
  const geoObjectsRef = useRef<any[]>([]);

  useEffect(() => {
    ymaps.ready(() => setYmapsReady(true));
  }, []);

  const loadRoutes = async () => {
    setLoading(true);
    try {
      const result = await dispatchApi.getDailyRoutes(selectedDate);
      setData(result);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Ошибка загрузки маршрутов");
    } finally {
      setLoading(false);
    }
  };

  const applyRoutes = async () => {
    setApplying(true);
    try {
      const result = await dispatchApi.applyDailyRoutes(selectedDate);
      setData(result);
      toast.success(`Назначено заказов: ${result.distributed_count}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Ошибка применения маршрутов");
    } finally {
      setApplying(false);
    }
  };

  const exportRoutes = async () => {
    setIsExporting(true);
    try {
      const blob = await dispatchApi.exportDailyRoutes(selectedDate);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily_routes_${selectedDate}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Маршруты экспортированы");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Ошибка экспорта маршрутов");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    loadRoutes();
  }, [selectedDate]);

  // Draw map for selected driver
  useEffect(() => {
    if (!ymapsReady || !mapRef.current || !data) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy();
      mapInstanceRef.current = null;
    }
    geoObjectsRef.current = [];

    const selectedRoute = expandedDriver !== null
      ? data.routes.find((r) => r.driver.id === expandedDriver)
      : null;

    const allOrders = selectedRoute
      ? selectedRoute.orders
      : data.routes.flatMap((r) => r.orders);

    if (allOrders.length === 0) return;

    const centerLat = allOrders.reduce((s, o) => s + o.pickup_lat, 0) / allOrders.length;
    const centerLon = allOrders.reduce((s, o) => s + o.pickup_lon, 0) / allOrders.length;

    mapInstanceRef.current = new ymaps.Map(mapRef.current, {
      center: [centerLat, centerLon],
      zoom: 12,
      controls: ["zoomControl"],
    });

    const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

    const drawAll = async () => {
      if (selectedRoute) {
        await drawRoute(selectedRoute, colors[0]);
      } else {
        for (let i = 0; i < data.routes.length; i++) {
          await drawRoute(data.routes[i], colors[i % colors.length]);
        }
      }

      if (allOrders.length > 1 && mapInstanceRef.current) {
        const lats = allOrders.flatMap((o) => [o.pickup_lat, o.dropoff_lat]);
        const lons = allOrders.flatMap((o) => [o.pickup_lon, o.dropoff_lon]);
        mapInstanceRef.current.setBounds(
          [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
          { checkZoomRange: true, zoomMargin: 40 }
        );
      }
    };
    drawAll();
  }, [ymapsReady, data, expandedDriver]);

  const drawRoute = async (route: DailyRoute, color: string) => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    for (let idx = 0; idx < route.orders.length; idx++) {
      const order = route.orders[idx];

      const pickupPm = new ymaps.Placemark(
        [order.pickup_lat, order.pickup_lon],
        {
          iconCaption: `${idx + 1}. ${order.pickup_title}`,
          balloonContentHeader: `<strong>${route.driver.name} — Заказ ${idx + 1}</strong>`,
          balloonContentBody: `<b>Откуда:</b> ${order.pickup_title}<br/><b>Куда:</b> ${order.dropoff_title}<br/><b>Время:</b> ${formatTime(order.desired_pickup_time)}<br/><b>Пассажир:</b> ${order.passenger_name || "—"}`,
        },
        { preset: "islands#greenCircleDotIconWithCaption", iconCaptionMaxWidth: "200" }
      );
      map.geoObjects.add(pickupPm);
      geoObjectsRef.current.push(pickupPm);

      const dropoffPm = new ymaps.Placemark(
        [order.dropoff_lat, order.dropoff_lon],
        {
          iconCaption: `${idx + 1}→`,
          balloonContentBody: `<b>Высадка:</b> ${order.dropoff_title}`,
        },
        { preset: "islands#redCircleDotIcon" }
      );
      map.geoObjects.add(dropoffPm);
      geoObjectsRef.current.push(dropoffPm);

      // Маршрут по дорогам (pickup → dropoff)
      try {
        const multiRoute = await ymaps.route(
          [[order.pickup_lat, order.pickup_lon], [order.dropoff_lat, order.dropoff_lon]],
          { mapStateAutoApply: false }
        ) as any;
        const paths = multiRoute.getPaths();
        for (let p = 0; p < paths.getLength(); p++) {
          const path = paths.get(p);
          path.options.set({ strokeColor: color, strokeWidth: 4, opacity: 0.85 });
        }
        map.geoObjects.add(multiRoute);
        geoObjectsRef.current.push(multiRoute);
      } catch {
        const line = new ymaps.Polyline(
          [[order.pickup_lat, order.pickup_lon], [order.dropoff_lat, order.dropoff_lon]],
          {},
          { strokeColor: color, strokeWidth: 3, opacity: 0.8 }
        );
        map.geoObjects.add(line);
        geoObjectsRef.current.push(line);
      }

      // Холостой пробег по дорогам (предыдущий dropoff → текущий pickup)
      if (idx > 0) {
        const prev = route.orders[idx - 1];
        try {
          const deadheadRoute = await ymaps.route(
            [[prev.dropoff_lat, prev.dropoff_lon], [order.pickup_lat, order.pickup_lon]],
            { mapStateAutoApply: false }
          ) as any;
          const dPaths = deadheadRoute.getPaths();
          for (let p = 0; p < dPaths.getLength(); p++) {
            const path = dPaths.get(p);
            path.options.set({ strokeColor: color, strokeWidth: 2, strokeStyle: "dash", opacity: 0.4 });
          }
          map.geoObjects.add(deadheadRoute);
          geoObjectsRef.current.push(deadheadRoute);
        } catch {
          const deadhead = new ymaps.Polyline(
            [[prev.dropoff_lat, prev.dropoff_lon], [order.pickup_lat, order.pickup_lon]],
            {},
            { strokeColor: color, strokeWidth: 2, strokeStyle: "dash", opacity: 0.4 }
          );
          map.geoObjects.add(deadhead);
          geoObjectsRef.current.push(deadhead);
        }
      }
    }
  };

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold dark:text-white">Распределение заказов на день</h1>
          <p className="text-gray-600 dark:text-gray-400">Маршруты водителей с расписанием заказов</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
          />
          <button onClick={loadRoutes} disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Рассчитать
          </button>
          {data && data.routes?.length > 0 && (
            <button onClick={exportRoutes} disabled={isExporting}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Экспорт ZIP
            </button>
          )}
          {data && data.distributed_count > 0 && !data.auto_assigned && (
            <button onClick={applyRoutes} disabled={applying}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Применить назначения
            </button>
          )}
        </div>
      </div>

      {/* Algorithm info */}
      {data && data.algorithm && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-medium text-indigo-800 dark:text-indigo-200">ML-алгоритм распределения</span>
          </div>
          <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-2">
            cost = w<sub>eta</sub>·gap + w<sub>deadhead</sub>·deadhead + w<sub>reject</sub>·(1-AR) + w<sub>cancel</sub>·CR + w<sub>fairness</sub>·fairness + w<sub>quality</sub>·quality
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-indigo-600 dark:text-indigo-400">
            <span>Конфиг: <strong>{data.config.name}</strong></span>
            <span>|</span>
            <span>Окно: <strong>{(data.config.w_eta * 100).toFixed(0)}%</strong></span>
            <span>Пробег: <strong>{(data.config.w_deadhead * 100).toFixed(0)}%</strong></span>
            <span>Отказ: <strong>{(data.config.w_reject * 100).toFixed(0)}%</strong></span>
            <span>Отмена: <strong>{(data.config.w_cancel * 100).toFixed(0)}%</strong></span>
            <span>Баланс: <strong>{(data.config.w_fairness * 100).toFixed(0)}%</strong></span>
            <span>Качество: <strong>{(data.config.w_quality * 100).toFixed(0)}%</strong></span>
          </div>
        </div>
      )}

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <Calendar className="w-4 h-4" /> Дата
            </div>
            <p className="text-lg font-semibold dark:text-white">{data.date}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <Navigation className="w-4 h-4" /> Всего заказов
            </div>
            <p className="text-lg font-semibold dark:text-white">{data.total_orders}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm mb-1">
              <CheckCircle className="w-4 h-4" /> Распределено
            </div>
            <p className="text-lg font-semibold text-green-700 dark:text-green-300">{data.distributed_count}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm mb-1">
              <AlertCircle className="w-4 h-4" /> Не распределено
            </div>
            <p className="text-lg font-semibold text-red-700 dark:text-red-300">{data.failed_count}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm mb-1">
              <Users className="w-4 h-4" /> Водителей
            </div>
            <p className="text-lg font-semibold text-blue-700 dark:text-blue-300">{data.drivers_count}</p>
          </div>
        </div>
      )}

      {/* Map */}
      {data && data.routes?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium dark:text-white flex items-center gap-2">
              <Route className="w-5 h-5" />
              {expandedDriver !== null
                ? `Маршрут: ${data.routes.find((r) => r.driver.id === expandedDriver)?.driver.name}`
                : "Все маршруты на карте"}
            </h2>
          </div>
          <div ref={mapRef} style={{ height: "400px" }} className="w-full" />
        </div>
      )}

      {/* Driver routes */}
      {data && data.routes?.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold dark:text-white">Маршруты водителей</h2>
          {data.routes.map((route) => (
            <div key={route.driver.id}
              className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border transition-all ${
                expandedDriver === route.driver.id
                  ? "border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800"
                  : "border-gray-200 dark:border-gray-700"
              }`}>
              <button
                onClick={() => setExpandedDriver(expandedDriver === route.driver.id ? null : route.driver.id)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-lg font-semibold">
                    {route.driver.name[0]}
                  </div>
                  <div>
                    <p className="font-medium dark:text-white">{route.driver.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {route.driver.car_model} · {route.driver.plate_number}
                      {route.driver.region && ` · ${route.driver.region}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="font-semibold text-indigo-600 dark:text-indigo-400">{route.total_orders}</p>
                    <p className="text-gray-500 dark:text-gray-400">заказов</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-blue-600 dark:text-blue-400">{route.total_distance_km} км</p>
                    <p className="text-gray-500 dark:text-gray-400">пробег</p>
                  </div>
                  <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedDriver === route.driver.id ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expandedDriver === route.driver.id && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                  <div className="space-y-3">
                    {route.orders.map((order, idx) => (
                      <div key={order.id} className="flex items-start gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-sm font-medium dark:text-white">
                              {formatTime(order.desired_pickup_time)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(order.status)}`}>
                              {statusLabel(order.status)}
                            </span>
                            {order.has_companion && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                +сопр.
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm">
                            <p className="text-gray-700 dark:text-gray-300 truncate">
                              <MapPin className="w-3 h-3 inline text-green-500 mr-1" />
                              {order.pickup_title}
                            </p>
                            <p className="text-gray-700 dark:text-gray-300 truncate">
                              <MapPin className="w-3 h-3 inline text-red-500 mr-1" />
                              {order.dropoff_title}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {order.passenger_name && (
                              <span><User className="w-3 h-3 inline mr-1" />{order.passenger_name}</span>
                            )}
                            {order.distance_km && (
                              <span><Navigation className="w-3 h-3 inline mr-1" />{order.distance_km.toFixed(1)} км</span>
                            )}
                            {order.estimated_price && (
                              <span>₸{order.estimated_price}</span>
                            )}
                          </div>
                          {/* ML Score details */}
                          {(() => {
                            const scoreData = route.scores?.find((s) => s.order_id === order.id);
                            if (!scoreData) return null;
                            return (
                              <div className="mt-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-md border border-indigo-100 dark:border-indigo-800">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <Brain className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                  <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                                    ML Score: {scoreData.cost.toFixed(4)}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-1 text-[10px]">
                                  <ScoreBar label="Окно" value={scoreData.gap_norm} color="blue" extra={`${scoreData.gap_min} мин`} />
                                  <ScoreBar label="Пробег" value={scoreData.deadhead_norm} color="amber" extra={`${scoreData.deadhead_km} км`} />
                                  <ScoreBar label="Отказ" value={scoreData.reject_norm} color="red" extra={`AR: ${(scoreData.acceptance_rate * 100).toFixed(0)}%`} />
                                  <ScoreBar label="Отмена" value={scoreData.cancel_norm} color="orange" extra={`CR: ${(scoreData.cancel_rate * 100).toFixed(0)}%`} />
                                  <ScoreBar label="Баланс" value={scoreData.fairness_norm} color="green" extra={`${scoreData.orders_so_far} зак.`} />
                                  <ScoreBar label="Качество" value={scoreData.quality_norm} color="purple" extra={`★${scoreData.rating}`} />
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {data && data.routes.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-12 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <Calendar className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-lg text-gray-500 dark:text-gray-400">Нет заказов на {data.date}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Создайте заказы с желаемым временем подачи на эту дату</p>
        </div>
      )}

      {/* Unassigned orders */}
      {data && data.unassigned_orders.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
            <AlertCircle className="w-4 h-4 inline mr-1" />
            Нераспределённые заказы ({data.unassigned_orders.length})
          </h3>
          <div className="space-y-1">
            {data.unassigned_orders.map((o) => (
              <p key={o.id} className="text-xs text-red-700 dark:text-red-300">
                Заказ {o.id}: {o.reason}
              </p>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      )}
    </div>
  );
}
