import { useEffect, useRef, useState } from "react";
import { dispatchApi } from "../services/dispatch";
import { Loader2 } from "lucide-react";

interface RouteMapViewProps {
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
  pickupTitle?: string;
  dropoffTitle?: string;
  distanceKm?: number;
  height?: string;
  orderId?: string;
}

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ymaps.Map | null>(null);
  const [routeData, setRouteData] = useState<{ distance_km: number; duration_minutes?: number } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    ymaps.ready(() => {
      if (destroyed || !containerRef.current) return;

      const centerLat = (pickupLat + dropoffLat) / 2;
      const centerLon = (pickupLon + dropoffLon) / 2;

      const map = new ymaps.Map(containerRef.current, {
        center: [centerLat, centerLon],
        zoom: 13,
        controls: ["zoomControl"],
      });
      mapRef.current = map;

      const pickupPlacemark = new ymaps.Placemark(
        [pickupLat, pickupLon],
        {
          balloonContent: pickupTitle
            ? `<strong>Откуда:</strong><br>${pickupTitle}`
            : "",
          iconContent: "A",
        },
        { preset: "islands#greenDotIcon" }
      );

      const dropoffPlacemark = new ymaps.Placemark(
        [dropoffLat, dropoffLon],
        {
          balloonContent: dropoffTitle
            ? `<strong>Куда:</strong><br>${dropoffTitle}`
            : "",
          iconContent: "B",
        },
        { preset: "islands#redDotIcon" }
      );

      map.geoObjects.add(pickupPlacemark);
      map.geoObjects.add(dropoffPlacemark);

      const bounds = map.geoObjects.getBounds();
      if (bounds) {
        map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
      }

      loadRoute(map, destroyed);
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [pickupLat, pickupLon, dropoffLat, dropoffLon, pickupTitle, dropoffTitle, orderId]);

  const loadRoute = async (map: ymaps.Map, destroyed: boolean) => {
    setLoadingRoute(true);
    setRouteError(null);

    try {
      let routeResponse;
      if (orderId) {
        routeResponse = await dispatchApi.getOrderRoute(orderId);
      } else {
        routeResponse = await dispatchApi.getRoute(pickupLat, pickupLon, dropoffLat, dropoffLon);
      }

      if (destroyed) return;

      if (!routeResponse.route || !Array.isArray(routeResponse.route) || routeResponse.route.length === 0) {
        addPolyline(map, [[pickupLat, pickupLon], [dropoffLat, dropoffLon]]);
      } else {
        setRouteData({
          distance_km: routeResponse.distance_km,
          duration_minutes: routeResponse.duration_minutes,
        });
        addPolyline(map, routeResponse.route);
      }
    } catch (error: any) {
      console.error("Ошибка загрузки маршрута:", error);
      if (destroyed) return;

      const errorMessage =
        error.response?.data?.error || error.message || "Не удалось загрузить маршрут по дорогам";
      setRouteError(errorMessage);

      addPolyline(map, [[pickupLat, pickupLon], [dropoffLat, dropoffLon]]);

      const fallbackDistance = calculateDistance(pickupLat, pickupLon, dropoffLat, dropoffLon);
      setRouteData({
        distance_km: fallbackDistance,
        duration_minutes: Math.ceil((fallbackDistance / 40) * 60),
      });
    } finally {
      if (!destroyed) {
        setLoadingRoute(false);
      }
    }
  };

  const addPolyline = (map: ymaps.Map, coords: Array<[number, number]>) => {
    const polyline = new ymaps.Polyline(
      coords,
      {},
      {
        strokeColor: "#3b82f6",
        strokeWidth: 4,
        strokeOpacity: 0.8,
      }
    );
    map.geoObjects.add(polyline);

    const bounds = map.geoObjects.getBounds();
    if (bounds) {
      map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
    }
  };

  const displayDistance =
    routeData?.distance_km ?? distanceKm ?? calculateDistance(pickupLat, pickupLon, dropoffLat, dropoffLon);

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={containerRef}
          style={{ height }}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
        />
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
