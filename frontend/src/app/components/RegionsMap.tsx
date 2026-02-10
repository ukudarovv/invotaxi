import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Region } from "../services/regions";

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface RegionsMapProps {
  regions: Region[];
  selectedRegionId?: string | null;
  onRegionSelect?: (regionId: string) => void;
  defaultZoom?: number;
  serviceRadius?: number; // радиус зоны обслуживания в метрах
}

export function RegionsMap({
  regions,
  selectedRegionId,
  onRegionSelect,
  defaultZoom = 10,
  serviceRadius = 10000, // 10 км по умолчанию
}: RegionsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const circlesRef = useRef<L.Circle[]>([]);

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Рассчитываем центр карты (среднее значение координат всех регионов или центр по умолчанию)
    let centerLat = 43.238949; // Алматы по умолчанию
    let centerLon = 76.945833;

    if (regions.length > 0) {
      const avgLat = regions.reduce((sum, r) => sum + r.center_lat, 0) / regions.length;
      const avgLon = regions.reduce((sum, r) => sum + r.center_lon, 0) / regions.length;
      centerLat = avgLat;
      centerLon = avgLon;
    }

    mapInstanceRef.current = L.map(mapRef.current).setView([centerLat, centerLon], defaultZoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);

    return () => {
      // Cleanup при размонтировании
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Только при монтировании

  // Обновление маркеров и кругов при изменении регионов
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Если регионов нет, просто очищаем маркеры и круги
    if (regions.length === 0) {
      markersRef.current.forEach((marker) => {
        mapInstanceRef.current?.removeLayer(marker);
      });
      circlesRef.current.forEach((circle) => {
        mapInstanceRef.current?.removeLayer(circle);
      });
      markersRef.current = [];
      circlesRef.current = [];
      return;
    }

    // Удаляем старые маркеры и круги
    markersRef.current.forEach((marker) => {
      mapInstanceRef.current?.removeLayer(marker);
    });
    circlesRef.current.forEach((circle) => {
      mapInstanceRef.current?.removeLayer(circle);
    });
    markersRef.current = [];
    circlesRef.current = [];

    // Создаем новые маркеры и круги для каждого региона
    regions.forEach((region) => {
      if (!mapInstanceRef.current) return;

      const position: [number, number] = [region.center_lat, region.center_lon];

      // Создаем маркер
      const marker = L.marker(position).addTo(mapInstanceRef.current);

      // Создаем popup с информацией о регионе
      const popupContent = `
        <div style="min-width: 150px;">
          <h3 style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">${region.title}</h3>
          ${region.city ? `<p style="margin: 4px 0; font-size: 12px; color: #6b7280;">Город: ${region.city.title}</p>` : ''}
          <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">ID: ${region.id}</p>
          <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">
            Координаты: ${region.center_lat.toFixed(4)}, ${region.center_lon.toFixed(4)}
          </p>
        </div>
      `;

      marker.bindPopup(popupContent);

      // Обработчик клика на маркер
      marker.on("click", () => {
        if (onRegionSelect) {
          onRegionSelect(region.id);
        }
      });

      markersRef.current.push(marker);

      // Создаем круг зоны обслуживания
      const circle = L.circle(position, {
        radius: serviceRadius,
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(mapInstanceRef.current);

      circlesRef.current.push(circle);
    });
  }, [regions, serviceRadius, onRegionSelect]);

  // Центрирование карты на выбранном регионе
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedRegionId) return;

    const selectedRegion = regions.find((r) => r.id === selectedRegionId);
    if (selectedRegion) {
      const position: [number, number] = [selectedRegion.center_lat, selectedRegion.center_lon];
      // Используем flyTo для плавной анимации перехода
      mapInstanceRef.current.flyTo(position, defaultZoom + 2, {
        duration: 1.0,
      });

      // Открываем popup выбранного региона
      const marker = markersRef.current.find((_, index) => regions[index]?.id === selectedRegionId);
      if (marker) {
        marker.openPopup();
      }
    }
  }, [selectedRegionId, regions, defaultZoom]);

  if (regions.length === 0) {
    return (
      <div className="w-full h-full rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p>Нет регионов для отображения</p>
        </div>
      </div>
    );
  }

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}

