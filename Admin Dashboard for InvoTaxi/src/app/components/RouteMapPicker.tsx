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

// Создаем кастомные иконки для точек маршрута
const createPickupIcon = () => {
  return L.divIcon({
    className: "custom-pickup-marker",
    html: `<div style="
      width: 32px;
      height: 32px;
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
        font-size: 14px;
      ">A</div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
};

const createDropoffIcon = () => {
  return L.divIcon({
    className: "custom-dropoff-marker",
    html: `<div style="
      width: 32px;
      height: 32px;
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
        font-size: 14px;
      ">B</div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
};

interface RouteMapPickerProps {
  /** Начальная широта центра карты */
  initialLat?: number;
  /** Начальная долгота центра карты */
  initialLon?: number;
  /** Начальный зум */
  initialZoom?: number;
  /** Высота карты */
  height?: string;
  /** Callback при изменении точки "Откуда" */
  onPickupChange?: (lat: number, lon: number, address?: string) => void;
  /** Callback при изменении точки "Куда" */
  onDropoffChange?: (lat: number, lon: number, address?: string) => void;
  /** Начальные координаты точки "Откуда" */
  initialPickup?: { lat: number; lon: number; address?: string };
  /** Начальные координаты точки "Куда" */
  initialDropoff?: { lat: number; lon: number; address?: string };
  /** Режим выбора (pickup или dropoff) */
  selectionMode?: "pickup" | "dropoff" | "both";
}

export function RouteMapPicker({
  initialLat = 47.1171, // Атырау по умолчанию
  initialLon = 51.8833,
  initialZoom = 13,
  height = "400px",
  onPickupChange,
  onDropoffChange,
  initialPickup,
  initialDropoff,
  selectionMode = "both",
}: RouteMapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropoffMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lon: number } | null>(
    initialPickup ? { lat: initialPickup.lat, lon: initialPickup.lon } : null
  );
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lon: number } | null>(
    initialDropoff ? { lat: initialDropoff.lat, lon: initialDropoff.lon } : null
  );
  const [currentMode, setCurrentMode] = useState<"pickup" | "dropoff">("pickup");

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Определяем центр карты
    let centerLat = initialLat;
    let centerLon = initialLon;
    
    if (pickupCoords) {
      centerLat = pickupCoords.lat;
      centerLon = pickupCoords.lon;
    } else if (dropoffCoords) {
      centerLat = dropoffCoords.lat;
      centerLon = dropoffCoords.lon;
    }

    mapInstanceRef.current = L.map(mapRef.current).setView([centerLat, centerLon], initialZoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);

    // Добавляем начальные маркеры
    if (pickupCoords) {
      pickupMarkerRef.current = L.marker([pickupCoords.lat, pickupCoords.lon], {
        icon: createPickupIcon(),
        draggable: true,
      }).addTo(mapInstanceRef.current);

      pickupMarkerRef.current.on("dragend", (e) => {
        const latlng = e.target.getLatLng();
        setPickupCoords({ lat: latlng.lat, lon: latlng.lng });
        onPickupChange?.(latlng.lat, latlng.lng);
        updateRoute();
      });
    }

    if (dropoffCoords) {
      dropoffMarkerRef.current = L.marker([dropoffCoords.lat, dropoffCoords.lon], {
        icon: createDropoffIcon(),
        draggable: true,
      }).addTo(mapInstanceRef.current);

      dropoffMarkerRef.current.on("dragend", (e) => {
        const latlng = e.target.getLatLng();
        setDropoffCoords({ lat: latlng.lat, lon: latlng.lng });
        onDropoffChange?.(latlng.lat, latlng.lng);
        updateRoute();
      });
    }

    // Обработчик клика на карту
    mapInstanceRef.current.on("click", (e: L.LeafletMouseEvent) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      if (selectionMode === "both") {
        // Переключаемся между режимами или устанавливаем точку
        if (!pickupCoords) {
          setPickupCoords({ lat, lon });
          addPickupMarker(lat, lon);
          setCurrentMode("dropoff");
        } else if (!dropoffCoords) {
          setDropoffCoords({ lat, lon });
          addDropoffMarker(lat, lon);
          setCurrentMode("pickup");
        } else {
          // Если обе точки установлены, обновляем текущую выбранную
          if (currentMode === "pickup") {
            setPickupCoords({ lat, lon });
            updatePickupMarker(lat, lon);
            setCurrentMode("dropoff");
          } else {
            setDropoffCoords({ lat, lon });
            updateDropoffMarker(lat, lon);
            setCurrentMode("pickup");
          }
        }
      } else if (selectionMode === "pickup") {
        setPickupCoords({ lat, lon });
        updatePickupMarker(lat, lon);
        onPickupChange?.(lat, lon);
      } else if (selectionMode === "dropoff") {
        setDropoffCoords({ lat, lon });
        updateDropoffMarker(lat, lon);
        onDropoffChange?.(lat, lon);
      }

      updateRoute();
    });

    updateRoute();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Обновление маршрута между точками
  const updateRoute = () => {
    if (!mapInstanceRef.current) return;

    // Удаляем старую линию
    if (routeLineRef.current) {
      mapInstanceRef.current.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    // Добавляем новую линию, если обе точки установлены
    if (pickupCoords && dropoffCoords) {
      routeLineRef.current = L.polyline(
        [[pickupCoords.lat, pickupCoords.lon], [dropoffCoords.lat, dropoffCoords.lon]],
        {
          color: "#3b82f6",
          weight: 4,
          opacity: 0.7,
          dashArray: "10, 10",
        }
      ).addTo(mapInstanceRef.current);
    }
  };

  // Добавление маркера "Откуда"
  const addPickupMarker = (lat: number, lon: number) => {
    if (!mapInstanceRef.current) return;
    if (pickupMarkerRef.current) {
      mapInstanceRef.current.removeLayer(pickupMarkerRef.current);
    }
    pickupMarkerRef.current = L.marker([lat, lon], {
      icon: createPickupIcon(),
      draggable: true,
    }).addTo(mapInstanceRef.current);

    pickupMarkerRef.current.on("dragend", (e) => {
      const latlng = e.target.getLatLng();
      setPickupCoords({ lat: latlng.lat, lon: latlng.lng });
      onPickupChange?.(latlng.lat, latlng.lng);
      updateRoute();
    });

    onPickupChange?.(lat, lon);
  };

  // Обновление маркера "Откуда"
  const updatePickupMarker = (lat: number, lon: number) => {
    if (!mapInstanceRef.current) return;
    if (pickupMarkerRef.current) {
      pickupMarkerRef.current.setLatLng([lat, lon]);
    } else {
      addPickupMarker(lat, lon);
    }
    onPickupChange?.(lat, lon);
  };

  // Добавление маркера "Куда"
  const addDropoffMarker = (lat: number, lon: number) => {
    if (!mapInstanceRef.current) return;
    if (dropoffMarkerRef.current) {
      mapInstanceRef.current.removeLayer(dropoffMarkerRef.current);
    }
    dropoffMarkerRef.current = L.marker([lat, lon], {
      icon: createDropoffIcon(),
      draggable: true,
    }).addTo(mapInstanceRef.current);

    dropoffMarkerRef.current.on("dragend", (e) => {
      const latlng = e.target.getLatLng();
      setDropoffCoords({ lat: latlng.lat, lon: latlng.lng });
      onDropoffChange?.(latlng.lat, latlng.lng);
      updateRoute();
    });

    onDropoffChange?.(lat, lon);
  };

  // Обновление маркера "Куда"
  const updateDropoffMarker = (lat: number, lon: number) => {
    if (!mapInstanceRef.current) return;
    if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.setLatLng([lat, lon]);
    } else {
      addDropoffMarker(lat, lon);
    }
    onDropoffChange?.(lat, lon);
  };

  // Обновление маршрута при изменении координат
  useEffect(() => {
    updateRoute();
  }, [pickupCoords, dropoffCoords]);

  return (
    <div className="space-y-3">
      {/* Переключатель режима выбора */}
      {selectionMode === "both" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCurrentMode("pickup")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentMode === "pickup"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
            }`}
          >
            Выбрать "Откуда"
          </button>
          <button
            type="button"
            onClick={() => setCurrentMode("dropoff")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentMode === "dropoff"
                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
            }`}
          >
            Выбрать "Куда"
          </button>
        </div>
      )}

      {/* Карта */}
      <div
        ref={mapRef}
        style={{ height }}
        className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
      />

      {/* Информация о координатах */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Откуда (A)</p>
          {pickupCoords ? (
            <p className="text-gray-900 dark:text-white font-mono text-xs">
              {pickupCoords.lat.toFixed(6)}, {pickupCoords.lon.toFixed(6)}
            </p>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 italic">Не выбрано</p>
          )}
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Куда (B)</p>
          {dropoffCoords ? (
            <p className="text-gray-900 dark:text-white font-mono text-xs">
              {dropoffCoords.lat.toFixed(6)}, {dropoffCoords.lon.toFixed(6)}
            </p>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 italic">Не выбрано</p>
          )}
        </div>
      </div>

      {/* Инструкция */}
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {selectionMode === "both" ? (
          <>
            Кликните на карте, чтобы выбрать точку "{currentMode === "pickup" ? "Откуда" : "Куда"}".
            Вы можете перетаскивать маркеры для точной настройки.
          </>
        ) : (
          `Кликните на карте, чтобы выбрать точку "${selectionMode === "pickup" ? "Откуда" : "Куда"}". Вы можете перетаскивать маркер для точной настройки.`
        )}
      </div>
    </div>
  );
}

