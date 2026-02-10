import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { dispatchApi } from "../services/dispatch";
import { Loader2 } from "lucide-react";

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Создаем кастомные иконки для точек маршрута
const createPickupIcon = () => {
  return L.divIcon({
    className: "custom-pickup-marker",
    html: `<div style="
      width: 28px;
      height: 28px;
      background-color: #10b981;
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        transform: rotate(45deg);
        color: white;
        font-weight: bold;
        font-size: 12px;
      ">A</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
};

const createDropoffIcon = () => {
  return L.divIcon({
    className: "custom-dropoff-marker",
    html: `<div style="
      width: 28px;
      height: 28px;
      background-color: #ef4444;
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        transform: rotate(45deg);
        color: white;
        font-weight: bold;
        font-size: 12px;
      ">B</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
};

interface RouteMapViewProps {
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
  pickupTitle?: string;
  dropoffTitle?: string;
  distanceKm?: number;
  height?: string;
  orderId?: string; // Опциональный ID заказа для использования getOrderRoute
}

// Функция расчета расстояния по формуле Haversine
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Радиус Земли в километрах
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export function RouteMapView({
  pickupLat,
  pickupLon,
  dropoffLat,
  dropoffLon,
  pickupTitle,
  dropoffTitle,
  distanceKm,
  height = "300px",
  orderId,
}: RouteMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ pickup: L.Marker | null; dropoff: L.Marker | null }>({
    pickup: null,
    dropoff: null,
  });
  const routeLineRef = useRef<L.Polyline | null>(null);
  const [routeData, setRouteData] = useState<{ distance_km: number; duration_minutes?: number } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Функция обновления маршрута на карте
  const updateRouteOnMap = (routeCoordinates: Array<[number, number]>) => {
    if (!mapInstanceRef.current) {
      return;
    }
    const map = mapInstanceRef.current;

    // Удаляем старую линию маршрута
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    // Проверяем, что есть координаты для отображения
    if (!routeCoordinates || routeCoordinates.length === 0) {
      return;
    }

    // Добавляем новую линию маршрута по дорогам
    try {
      const routeLine = L.polyline(routeCoordinates, {
        color: "#3b82f6",
        weight: 4,
        opacity: 0.8,
      }).addTo(map);

      routeLineRef.current = routeLine;

      // Подгоняем карту под маршрут
      if (routeCoordinates.length > 0) {
        const bounds = L.latLngBounds(routeCoordinates);
        map.fitBounds(bounds.pad(0.1));
      }
    } catch (error) {
      console.error("Ошибка при добавлении маршрута на карту:", error);
    }
  };

  // Загрузка маршрута по дорогам (после инициализации карты)
  useEffect(() => {
    let isMounted = true;

    const loadRoute = async () => {
      // Ждем инициализации карты
      if (!mapInstanceRef.current) {
        // Пробуем еще раз через небольшую задержку
        setTimeout(() => {
          if (isMounted && mapInstanceRef.current) {
            loadRoute();
          }
        }, 200);
        return;
      }

      setLoadingRoute(true);
      setRouteError(null);
      
      try {
        let routeResponse;
        
        // Если есть orderId, используем getOrderRoute, иначе getRoute
        if (orderId) {
          routeResponse = await dispatchApi.getOrderRoute(orderId);
        } else {
          routeResponse = await dispatchApi.getRoute(pickupLat, pickupLon, dropoffLat, dropoffLon);
        }
        
        if (!isMounted) return;
        
        // Проверяем формат данных маршрута
        if (!routeResponse.route || !Array.isArray(routeResponse.route) || routeResponse.route.length === 0) {
          // Используем прямую линию как fallback
          const fallbackRoute = [[pickupLat, pickupLon], [dropoffLat, dropoffLon]];
          updateRouteOnMap(fallbackRoute);
        } else {
          setRouteData({
            distance_km: routeResponse.distance_km,
            duration_minutes: routeResponse.duration_minutes,
          });
          
          // Обновляем маршрут на карте
          updateRouteOnMap(routeResponse.route);
        }
      } catch (error: any) {
        console.error("Ошибка загрузки маршрута:", error);
        if (!isMounted) return;
        
        const errorMessage = error.response?.data?.error || error.message || "Не удалось загрузить маршрут по дорогам";
        setRouteError(errorMessage);
        
        // В случае ошибки показываем прямую линию как fallback
        if (mapInstanceRef.current) {
          const fallbackRoute = [[pickupLat, pickupLon], [dropoffLat, dropoffLon]];
          updateRouteOnMap(fallbackRoute);
          
          // Используем расчетное расстояние по прямой
          const fallbackDistance = calculateDistance(pickupLat, pickupLon, dropoffLat, dropoffLon);
          setRouteData({
            distance_km: fallbackDistance,
            duration_minutes: Math.ceil(fallbackDistance / 40 * 60), // Примерное время при скорости 40 км/ч
          });
        }
      } finally {
        if (isMounted) {
          setLoadingRoute(false);
        }
      }
    };

    loadRoute();

    return () => {
      isMounted = false;
    };
  }, [pickupLat, pickupLon, dropoffLat, dropoffLon, orderId]);

  // Инициализация карты и маркеров
  useEffect(() => {
    if (!mapRef.current) return;

    // Инициализация карты
    if (!mapInstanceRef.current) {
      // Вычисляем центр между двумя точками
      const centerLat = (pickupLat + dropoffLat) / 2;
      const centerLon = (pickupLon + dropoffLon) / 2;

      mapInstanceRef.current = L.map(mapRef.current).setView([centerLat, centerLon], 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapInstanceRef.current);

      // Ждем полной загрузки карты перед добавлением маркеров
      mapInstanceRef.current.whenReady(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // Удаляем старые маркеры
        if (markersRef.current.pickup) {
          map.removeLayer(markersRef.current.pickup);
        }
        if (markersRef.current.dropoff) {
          map.removeLayer(markersRef.current.dropoff);
        }

        // Добавляем маркер отправления
        const pickupMarker = L.marker([pickupLat, pickupLon], {
          icon: createPickupIcon(),
        }).addTo(map);

        if (pickupTitle) {
          pickupMarker.bindPopup(`<strong>Откуда:</strong><br>${pickupTitle}`);
        }

        // Добавляем маркер назначения
        const dropoffMarker = L.marker([dropoffLat, dropoffLon], {
          icon: createDropoffIcon(),
        }).addTo(map);

        if (dropoffTitle) {
          dropoffMarker.bindPopup(`<strong>Куда:</strong><br>${dropoffTitle}`);
        }

        // Сохраняем ссылки
        markersRef.current.pickup = pickupMarker;
        markersRef.current.dropoff = dropoffMarker;

        // Подгоняем карту под маркеры (если маршрут еще не загружен)
        if (!routeLineRef.current) {
          const group = new L.FeatureGroup([pickupMarker, dropoffMarker]);
          map.fitBounds(group.getBounds().pad(0.1));
        }
      });
    } else {
      // Если карта уже инициализирована, обновляем маркеры
      const map = mapInstanceRef.current;

      // Удаляем старые маркеры
      if (markersRef.current.pickup) {
        map.removeLayer(markersRef.current.pickup);
      }
      if (markersRef.current.dropoff) {
        map.removeLayer(markersRef.current.dropoff);
      }

      // Добавляем маркер отправления
      const pickupMarker = L.marker([pickupLat, pickupLon], {
        icon: createPickupIcon(),
      }).addTo(map);

      if (pickupTitle) {
        pickupMarker.bindPopup(`<strong>Откуда:</strong><br>${pickupTitle}`);
      }

      // Добавляем маркер назначения
      const dropoffMarker = L.marker([dropoffLat, dropoffLon], {
        icon: createDropoffIcon(),
      }).addTo(map);

      if (dropoffTitle) {
        dropoffMarker.bindPopup(`<strong>Куда:</strong><br>${dropoffTitle}`);
      }

      // Сохраняем ссылки
      markersRef.current.pickup = pickupMarker;
      markersRef.current.dropoff = dropoffMarker;

      // Подгоняем карту под маркеры (если маршрут еще не загружен)
      if (!routeLineRef.current) {
        const group = new L.FeatureGroup([pickupMarker, dropoffMarker]);
        map.fitBounds(group.getBounds().pad(0.1));
      }
    }

    // Cleanup
    return () => {
      const map = mapInstanceRef.current;
      if (map && markersRef.current.pickup) {
        map.removeLayer(markersRef.current.pickup);
      }
      if (map && markersRef.current.dropoff) {
        map.removeLayer(markersRef.current.dropoff);
      }
    };
  }, [pickupLat, pickupLon, dropoffLat, dropoffLon, pickupTitle, dropoffTitle]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Определяем расстояние: приоритет у данных из API, затем переданное значение, затем расчетное
  const displayDistance = routeData?.distance_km ?? distanceKm ?? calculateDistance(pickupLat, pickupLon, dropoffLat, dropoffLon);

  return (
    <div className="space-y-2">
      <div className="relative">
        <div ref={mapRef} style={{ height }} className="w-full rounded-lg border border-gray-200 dark:border-gray-700" />
        {loadingRoute && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 rounded-lg">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Загрузка маршрута...</span>
            </div>
          </div>
        )}
      </div>
      
      {routeError && (
        <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            {routeError.includes("Нет прав") || routeError.includes("403") 
              ? "Маршрут по дорогам недоступен. Показана прямая линия."
              : routeError}
          </p>
        </div>
      )}
      
      {displayDistance > 0 && (
        <div className="flex items-center justify-center gap-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <svg
            className="w-5 h-5 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Расстояние: {displayDistance.toFixed(2)} км
          </span>
          {routeData?.duration_minutes && (
            <>
              <span className="text-blue-600 dark:text-blue-400">•</span>
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Время: ~{routeData.duration_minutes} мин
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
