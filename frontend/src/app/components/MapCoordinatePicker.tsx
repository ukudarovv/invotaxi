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
  initialLat = 47.10869114222083, // Атырау по умолчанию
  initialLon = 51.9049072265625,
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
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Небольшая задержка для правильной инициализации внутри модального окна
    const timer = setTimeout(() => {
      if (!mapRef.current || mapInstanceRef.current) return;
      
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
      }).setView([initialLat, initialLon], initialZoom);

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

    // Устанавливаем начальные координаты в состояние
    setCurrentLat(initialLat);
    setCurrentLon(initialLon);

    // Обработчик клика на карту
    if (!disabled) {
      mapInstanceRef.current.on("click", (e: L.LeafletMouseEvent) => {
        if (polygonMode) {
          // Режим рисования полигона
          const newPoint: [number, number] = [e.latlng.lat, e.latlng.lng];
          const newPoints = [...polygonPoints, [e.latlng.lat, e.latlng.lng]];
          setPolygonPoints(newPoints);
          onPolygonChange?.(newPoints);

          // Добавляем маркер для точки с возможностью перетаскивания
          const pointMarker = L.marker(newPoint, {
            icon: L.divIcon({
              className: "polygon-point-marker",
              html: `<div style="width: 16px; height: 16px; border-radius: 50%; background: #ef4444; border: 3px solid white; cursor: move; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
            draggable: true,
          }).addTo(mapInstanceRef.current!);

          const pointIndex = newPoints.length - 1;

          // Обновление позиции точки при перетаскивании
          pointMarker.on("drag", (e) => {
            const latlng = e.target.getLatLng();
            const updatedPoints = [...polygonPoints];
            updatedPoints[pointIndex] = [latlng.lat, latlng.lng];
            setPolygonPoints(updatedPoints);
            updatePolygon(updatedPoints);
          });

          // Обновление после завершения перетаскивания
          pointMarker.on("dragend", (e) => {
            const latlng = e.target.getLatLng();
            const updatedPoints = [...polygonPoints];
            updatedPoints[pointIndex] = [latlng.lat, latlng.lng];
            setPolygonPoints(updatedPoints);
            onPolygonChange?.(updatedPoints);
            updatePolygon(updatedPoints);
          });

          // Выделение точки при клике
          pointMarker.on("click", (e) => {
            e.originalEvent?.stopPropagation();
            setSelectedPointIndex(pointIndex);
            // Подсветка выбранной точки
            pointMarker.setIcon(L.divIcon({
              className: "polygon-point-marker selected",
              html: `<div style="width: 20px; height: 20px; border-radius: 50%; background: #3b82f6; border: 3px solid white; cursor: move; box-shadow: 0 2px 8px rgba(59,130,246,0.6);"></div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }));
          });

          // Удаление точки при двойном клике
          pointMarker.on("dblclick", (e) => {
            e.originalEvent?.stopPropagation();
            if (polygonPoints.length > 3) {
              const index = polygonPointsRef.current.indexOf(pointMarker);
              if (index > -1) {
                const updatedPoints = polygonPoints.filter((_, i) => i !== index);
                setPolygonPoints(updatedPoints);
                onPolygonChange?.(updatedPoints);
                mapInstanceRef.current?.removeLayer(pointMarker);
                polygonPointsRef.current.splice(index, 1);
                updatePolygon(updatedPoints);
                setSelectedPointIndex(null);
              }
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

      // Принудительно обновляем размер карты после инициализации
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 100);
    }, 50);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Обновление позиции карты и маркера при изменении initialLat/initialLon
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Обновляем состояние координат
    setCurrentLat(initialLat);
    setCurrentLon(initialLon);

    // Обновляем центр карты
    mapInstanceRef.current.setView([initialLat, initialLon], mapInstanceRef.current.getZoom());

    // Обновляем позицию маркера, если он существует
    if (markerRef.current && !polygonMode) {
      markerRef.current.setLatLng([initialLat, initialLon]);
    }

    // Обновляем позицию круга, если он существует
    if (circleRef.current) {
      mapInstanceRef.current.removeLayer(circleRef.current);
      if (serviceRadius && serviceRadius > 0) {
        circleRef.current = L.circle([initialLat, initialLon], {
          radius: serviceRadius,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.2,
          weight: 2,
        }).addTo(mapInstanceRef.current);
      } else {
        circleRef.current = null;
      }
    } else if (serviceRadius && serviceRadius > 0) {
      // Создаем круг, если его еще нет
      circleRef.current = L.circle([initialLat, initialLon], {
        radius: serviceRadius,
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        weight: 2,
      }).addTo(mapInstanceRef.current);
    }
  }, [initialLat, initialLon, polygonMode, serviceRadius]);

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

  // Очистка полигона
  const clearPolygon = () => {
    // Удаляем все маркеры точек
    polygonPointsRef.current.forEach((marker) => {
      mapInstanceRef.current?.removeLayer(marker);
    });
    polygonPointsRef.current = [];
    
    // Удаляем полигон
    if (polygonRef.current) {
      mapInstanceRef.current?.removeLayer(polygonRef.current);
      polygonRef.current = null;
    }

    // Очищаем состояние
    setPolygonPoints([]);
    setSelectedPointIndex(null);
    onPolygonChange?.([]);
  };

  // Восстановление маркеров при изменении initialPolygon
  const recreatePolygonMarkers = (points: number[][]) => {
    // Удаляем старые маркеры
    polygonPointsRef.current.forEach((marker) => {
      mapInstanceRef.current?.removeLayer(marker);
    });
    polygonPointsRef.current = [];

    // Создаем новые маркеры для каждой точки
    points.forEach((point, index) => {
      const pointMarker = L.marker([point[0], point[1]], {
        icon: L.divIcon({
          className: "polygon-point-marker",
          html: `<div style="width: 16px; height: 16px; border-radius: 50%; background: #ef4444; border: 3px solid white; cursor: move; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        draggable: true,
      }).addTo(mapInstanceRef.current!);

      // Обновление позиции точки при перетаскивании
      pointMarker.on("drag", (e) => {
        const latlng = e.target.getLatLng();
        const updatedPoints = [...points];
        updatedPoints[index] = [latlng.lat, latlng.lng];
        setPolygonPoints(updatedPoints);
        updatePolygon(updatedPoints);
      });

      // Обновление после завершения перетаскивания
      pointMarker.on("dragend", (e) => {
        const latlng = e.target.getLatLng();
        const updatedPoints = [...points];
        updatedPoints[index] = [latlng.lat, latlng.lng];
        setPolygonPoints(updatedPoints);
        onPolygonChange?.(updatedPoints);
        updatePolygon(updatedPoints);
      });

      // Выделение точки при клике
      pointMarker.on("click", (e) => {
        e.originalEvent?.stopPropagation();
        setSelectedPointIndex(index);
        // Сбрасываем стиль других точек
        polygonPointsRef.current.forEach((m, i) => {
          if (i !== index) {
            m.setIcon(L.divIcon({
              className: "polygon-point-marker",
              html: `<div style="width: 16px; height: 16px; border-radius: 50%; background: #ef4444; border: 3px solid white; cursor: move; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }));
          }
        });
        // Подсветка выбранной точки
        pointMarker.setIcon(L.divIcon({
          className: "polygon-point-marker selected",
          html: `<div style="width: 20px; height: 20px; border-radius: 50%; background: #3b82f6; border: 3px solid white; cursor: move; box-shadow: 0 2px 8px rgba(59,130,246,0.6);"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }));
      });

      // Удаление точки при двойном клике
      pointMarker.on("dblclick", (e) => {
        e.originalEvent?.stopPropagation();
        if (points.length > 3) {
          const markerIndex = polygonPointsRef.current.indexOf(pointMarker);
          if (markerIndex > -1) {
            const updatedPoints = points.filter((_, i) => i !== markerIndex);
            setPolygonPoints(updatedPoints);
            onPolygonChange?.(updatedPoints);
            mapInstanceRef.current?.removeLayer(pointMarker);
            polygonPointsRef.current.splice(markerIndex, 1);
            updatePolygon(updatedPoints);
            setSelectedPointIndex(null);
            // Пересоздаем маркеры для обновления индексов
            recreatePolygonMarkers(updatedPoints);
          }
        }
      });

      polygonPointsRef.current.push(pointMarker);
    });
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
    if (!polygonMode || !mapInstanceRef.current) return;
    
    if (initialPolygon && initialPolygon.length > 0) {
      setPolygonPoints(initialPolygon);
      recreatePolygonMarkers(initialPolygon);
      updatePolygon(initialPolygon);
    } else {
      setPolygonPoints([]);
      clearPolygon();
    }
  }, [initialPolygon, polygonMode]);

  // Обновление размера карты при изменении видимости (для модальных окон)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    // Обновляем размер карты с небольшой задержкой для корректной работы в модальных окнах
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);

    return () => clearTimeout(timer);
  }, [height]);

  return (
    <div className="space-y-2">
      <div
        ref={mapRef}
        style={{ height, position: 'relative', zIndex: 'auto' }}
        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 leaflet-map-container"
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
            ? "Кликните на карте, чтобы добавить точку. Перетащите точку, чтобы переместить. Двойной клик по точке удалит её."
            : "Кликните на карте или перетащите маркер, чтобы выбрать координаты."}
        </div>
      )}
    </div>
  );
}
