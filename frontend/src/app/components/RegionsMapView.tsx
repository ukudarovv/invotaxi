import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Region } from "../services/regions";
import { MapPin, Loader2 } from "lucide-react";

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface RegionsMapViewProps {
  regions: Region[];
  onRegionClick?: (region: Region) => void;
  defaultZoom?: number;
}

export function RegionsMapView({
  regions,
  onRegionClick,
  defaultZoom = 10,
}: RegionsMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const circlesRef = useRef<L.Circle[]>([]);
  const polygonsRef = useRef<L.Polygon[]>([]);
  const [mapInitialized, setMapInitialized] = useState(false);

  // Инициализация карты
  useEffect(() => {
    if (mapInstanceRef.current) return;

    const initializeMap = () => {
      if (!mapRef.current || mapInstanceRef.current) return;

      // Рассчитываем центр карты
      let centerLat = 47.10869114222083; // Атырау по умолчанию
      let centerLon = 51.9049072265625;

      if (regions.length > 0) {
        const avgLat = regions.reduce((sum, r) => sum + r.center_lat, 0) / regions.length;
        const avgLon = regions.reduce((sum, r) => sum + r.center_lon, 0) / regions.length;
        centerLat = avgLat;
        centerLon = avgLon;
      }

      try {
        mapInstanceRef.current = L.map(mapRef.current).setView([centerLat, centerLon], defaultZoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(mapInstanceRef.current);

        // Устанавливаем флаг инициализации после небольшой задержки для гарантии готовности карты
        setTimeout(() => {
          setMapInitialized(true);
        }, 200);
      } catch (error) {
        console.error('Ошибка инициализации карты:', error);
        setMapInitialized(true);
      }
    };

    // Пробуем инициализировать сразу
    if (mapRef.current) {
      initializeMap();
    } else {
      // Если ref еще не готов, пробуем через небольшую задержку
      const timer = setTimeout(() => {
        initializeMap();
      }, 100);
      return () => clearTimeout(timer);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setMapInitialized(false);
      }
    };
  }, []); // Только при монтировании

  // Обновление центра карты при изменении регионов
  useEffect(() => {
    if (!mapInstanceRef.current || !mapInitialized || regions.length === 0) return;

    // Обновляем центр карты на среднее значение координат регионов
    const avgLat = regions.reduce((sum, r) => sum + r.center_lat, 0) / regions.length;
    const avgLon = regions.reduce((sum, r) => sum + r.center_lon, 0) / regions.length;
    mapInstanceRef.current.setView([avgLat, avgLon], defaultZoom);
  }, [regions.length, mapInitialized, defaultZoom]);

  // Обновление маркеров, кругов и полигонов при изменении регионов
  useEffect(() => {
    if (!mapInstanceRef.current || !mapInitialized) return;

    // Удаляем старые элементы
    markersRef.current.forEach((marker) => {
      mapInstanceRef.current?.removeLayer(marker);
    });
    circlesRef.current.forEach((circle) => {
      mapInstanceRef.current?.removeLayer(circle);
    });
    polygonsRef.current.forEach((polygon) => {
      mapInstanceRef.current?.removeLayer(polygon);
    });
    markersRef.current = [];
    circlesRef.current = [];
    polygonsRef.current = [];

    // Создаем новые элементы для каждого региона
    regions.forEach((region) => {
      if (!mapInstanceRef.current) return;

      const position: [number, number] = [region.center_lat, region.center_lon];

      // Создаем маркер для центра региона
      const marker = L.marker(position, {
        icon: L.icon({
          iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
          iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        }),
      }).addTo(mapInstanceRef.current);

      // Создаем popup с информацией о регионе
      const popupContent = `
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">${region.title}</h3>
          <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">Город: ${region.city.title}</p>
          <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">ID: ${region.id}</p>
          <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">
            Координаты: ${region.center_lat.toFixed(4)}, ${region.center_lon.toFixed(4)}
          </p>
          ${region.service_radius_meters ? `<p style="margin: 4px 0; font-size: 12px; color: #6b7280;">Радиус: ${region.service_radius_meters} м</p>` : ''}
          ${region.polygon_coordinates && region.polygon_coordinates.length > 0 ? `<p style="margin: 4px 0; font-size: 12px; color: #6b7280;">Полигон: ${region.polygon_coordinates.length} точек</p>` : ''}
        </div>
      `;

      marker.bindPopup(popupContent);

      // Обработчик клика на маркер
      marker.on("click", () => {
        if (onRegionClick) {
          onRegionClick(region);
        }
      });

      markersRef.current.push(marker);

      // Создаем полигон, если он задан
      if (region.polygon_coordinates && region.polygon_coordinates.length >= 3) {
        const latlngs = region.polygon_coordinates.map(
          (p) => [p[0], p[1]] as [number, number]
        );
        const polygon = L.polygon(latlngs, {
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.2,
          weight: 2,
        }).addTo(mapInstanceRef.current);

        polygon.bindPopup(popupContent);
        polygon.on("click", () => {
          if (onRegionClick) {
            onRegionClick(region);
          }
        });

        polygonsRef.current.push(polygon);
      }

      // Создаем круг радиуса обслуживания, если он задан и нет полигона
      if (region.service_radius_meters && region.service_radius_meters > 0) {
        // Показываем круг только если нет полигона
        if (!region.polygon_coordinates || region.polygon_coordinates.length < 3) {
          const circle = L.circle(position, {
            radius: region.service_radius_meters,
            color: "#3b82f6",
            fillColor: "#3b82f6",
            fillOpacity: 0.2,
            weight: 2,
          }).addTo(mapInstanceRef.current);

          circle.bindPopup(popupContent);
          circle.on("click", () => {
            if (onRegionClick) {
              onRegionClick(region);
            }
          });

          circlesRef.current.push(circle);
        }
      }
    });
  }, [regions, onRegionClick, mapInitialized]);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl mb-4 text-gray-900 dark:text-white">
          Карта регионов
        </h2>
        {regions.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              <strong>Легенда:</strong>
            </p>
            <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                <span>Маркер центра региона</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-500 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}></div>
                <span>Круг радиуса обслуживания</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-500" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}></div>
                <span>Полигон границ региона</span>
              </div>
            </div>
          </div>
        )}
        <div className="relative w-full h-[600px] rounded-lg">
          {!mapInitialized && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg z-10">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
                <p className="text-gray-600 dark:text-gray-400">Загрузка карты...</p>
              </div>
            </div>
          )}
          {regions.length === 0 && mapInitialized && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg z-10 pointer-events-none">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <MapPin className="w-16 h-16 mx-auto mb-2 opacity-50" />
                <p>Нет регионов для отображения</p>
              </div>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full rounded-lg" />
        </div>
        {regions.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Кликните на маркер, круг или полигон региона для просмотра информации и редактирования
          </p>
        )}
      </div>
    </div>
  );
}
