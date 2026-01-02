import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface MapCoordinatePickerProps {
  /** Начальная широта */
  initialLat?: number;
  /** Начальная долгота */
  initialLon?: number;
  /** Начальный зум */
  initialZoom?: number;
  /** Высота карты */
  height?: string;
  /** Callback при изменении координат */
  onCoordinateChange?: (lat: number, lon: number) => void;
  /** Режим рисования полигона */
  polygonMode?: boolean;
  /** Callback при изменении полигона */
  onPolygonChange?: (coordinates: number[][]) => void;
  /** Начальные координаты полигона */
  initialPolygon?: number[][];
  /** Радиус обслуживания в метрах */
  serviceRadius?: number;
  /** Callback при изменении радиуса */
  onRadiusChange?: (radius: number) => void;
  /** Отключить интерактивность */
  disabled?: boolean;
}

export function MapCoordinatePicker({
  initialLat = 43.238949, // Алматы по умолчанию
  initialLon = 76.945833,
  initialZoom = 13,
  height = "400px",
  onCoordinateChange,
  polygonMode = false,
  onPolygonChange,
  initialPolygon,
  serviceRadius,
  onRadiusChange,
  disabled = false,
}: MapCoordinatePickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const polygonPointsRef = useRef<L.Marker[]>([]);
  const [currentLat, setCurrentLat] = useState(initialLat);
  const [currentLon, setCurrentLon] = useState(initialLon);
  const [polygonPoints, setPolygonPoints] = useState<number[][]>(initialPolygon || []);

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = L.map(mapRef.current).setView([initialLat, initialLon], initialZoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);

    // Добавляем начальный маркер
    if (!polygonMode) {
      markerRef.current = L.marker([initialLat, initialLon]).addTo(mapInstanceRef.current);
      markerRef.current.on("dragend", (e) => {
        const latlng = e.target.getLatLng();
        setCurrentLat(latlng.lat);
        setCurrentLon(latlng.lng);
        onCoordinateChange?.(latlng.lat, latlng.lng);
      });
    }

    // Добавляем круг радиуса, если указан
    if (serviceRadius && serviceRadius > 0) {
      circleRef.current = L.circle([initialLat, initialLon], {
        radius: serviceRadius,
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(mapInstanceRef.current);
    }

    // Обработчик клика на карту
    if (!disabled) {
      mapInstanceRef.current.on("click", (e: L.LeafletMouseEvent) => {
        if (polygonMode) {
          // Режим рисования полигона
          const newPoint: [number, number] = [e.latlng.lat, e.latlng.lng];
          const newPoints = [...polygonPoints, [e.latlng.lat, e.latlng.lng]];
          setPolygonPoints(newPoints);
          onPolygonChange?.(newPoints);

          // Добавляем маркер для точки
          const pointMarker = L.marker(newPoint, {
            icon: L.divIcon({
              className: "polygon-point-marker",
              html: `<div style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444; border: 2px solid white; cursor: pointer;"></div>`,
              iconSize: [12, 12],
            }),
          }).addTo(mapInstanceRef.current!);

          // Удаление точки при клике на маркер
          pointMarker.on("click", () => {
            const index = polygonPointsRef.current.indexOf(pointMarker);
            if (index > -1) {
              const updatedPoints = polygonPoints.filter((_, i) => i !== index);
              setPolygonPoints(updatedPoints);
              onPolygonChange?.(updatedPoints);
              mapInstanceRef.current?.removeLayer(pointMarker);
              polygonPointsRef.current.splice(index, 1);
              updatePolygon(updatedPoints);
            }
          });

          polygonPointsRef.current.push(pointMarker);
          updatePolygon(newPoints);
        } else {
          // Режим выбора точки
          const lat = e.latlng.lat;
          const lon = e.latlng.lng;
          setCurrentLat(lat);
          setCurrentLon(lon);

          // Перемещаем маркер
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lon]);
          } else {
            markerRef.current = L.marker([lat, lon]).addTo(mapInstanceRef.current!);
            markerRef.current.on("dragend", (e) => {
              const latlng = e.target.getLatLng();
              setCurrentLat(latlng.lat);
              setCurrentLon(latlng.lng);
              onCoordinateChange?.(latlng.lat, latlng.lng);
            });
          }

          // Обновляем круг радиуса
          if (circleRef.current && serviceRadius && serviceRadius > 0) {
            circleRef.current.setLatLng([lat, lon]);
          }

          onCoordinateChange?.(lat, lon);
        }
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Обновление полигона
  const updatePolygon = (points: number[][]) => {
    if (polygonRef.current) {
      mapInstanceRef.current?.removeLayer(polygonRef.current);
    }

    if (points.length >= 3) {
      const latlngs = points.map((p) => [p[0], p[1]] as [number, number]);
      polygonRef.current = L.polygon(latlngs, {
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(mapInstanceRef.current!);
    }
  };

  // Обновление маркера при изменении начальных координат
  useEffect(() => {
    if (!mapInstanceRef.current || polygonMode) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([currentLat, currentLon]);
    } else {
      markerRef.current = L.marker([currentLat, currentLon]).addTo(mapInstanceRef.current);
      markerRef.current.on("dragend", (e) => {
        const latlng = e.target.getLatLng();
        setCurrentLat(latlng.lat);
        setCurrentLon(latlng.lng);
        onCoordinateChange?.(latlng.lat, latlng.lng);
      });
    }

    if (circleRef.current && serviceRadius && serviceRadius > 0) {
      circleRef.current.setLatLng([currentLat, currentLon]);
    }
  }, [currentLat, currentLon, polygonMode]);

  // Обновление круга радиуса
  useEffect(() => {
    if (!mapInstanceRef.current || polygonMode) return;

    if (circleRef.current) {
      if (serviceRadius && serviceRadius > 0) {
        circleRef.current.setRadius(serviceRadius);
        circleRef.current.setLatLng([currentLat, currentLon]);
      } else {
        mapInstanceRef.current.removeLayer(circleRef.current);
        circleRef.current = null;
      }
    } else if (serviceRadius && serviceRadius > 0) {
      circleRef.current = L.circle([currentLat, currentLon], {
        radius: serviceRadius,
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(mapInstanceRef.current);
    }
  }, [serviceRadius, currentLat, currentLon, polygonMode]);

  // Обновление полигона при изменении initialPolygon
  useEffect(() => {
    if (!polygonMode || !initialPolygon) return;
    setPolygonPoints(initialPolygon);
    updatePolygon(initialPolygon);
  }, [initialPolygon, polygonMode]);

  return (
    <div className="space-y-2">
      <div
        ref={mapRef}
        style={{ height }}
        className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
      />
      {!polygonMode && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Координаты: {currentLat.toFixed(6)}, {currentLon.toFixed(6)}
        </div>
      )}
      {polygonMode && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Точек в полигоне: {polygonPoints.length}
          {polygonPoints.length < 3 && (
            <span className="text-orange-600 dark:text-orange-400 ml-2">
              (минимум 3 точки)
            </span>
          )}
        </div>
      )}
      {!disabled && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {polygonMode
            ? "Кликните на карте, чтобы добавить точку полигона. Кликните на точку, чтобы удалить её."
            : "Кликните на карте или перетащите маркер, чтобы выбрать координаты."}
        </div>
      )}
    </div>
  );
}

