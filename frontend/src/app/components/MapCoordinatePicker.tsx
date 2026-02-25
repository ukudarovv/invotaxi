import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    ymaps: any;
  }
  const ymaps: any;
}

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
  initialLat = 47.10869114222083,
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
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const polygonObjRef = useRef<any>(null);
  const polygonPointMarkersRef = useRef<any[]>([]);

  const [currentLat, setCurrentLat] = useState(initialLat);
  const [currentLon, setCurrentLon] = useState(initialLon);
  const [polygonPoints, setPolygonPoints] = useState<number[][]>(initialPolygon || []);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  const polygonPointsStateRef = useRef<number[][]>(initialPolygon || []);
  polygonPointsStateRef.current = polygonPoints;

  const onCoordinateChangeRef = useRef(onCoordinateChange);
  onCoordinateChangeRef.current = onCoordinateChange;
  const onPolygonChangeRef = useRef(onPolygonChange);
  onPolygonChangeRef.current = onPolygonChange;

  const updatePolygonShape = useCallback((points: number[]) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (polygonObjRef.current) {
      map.geoObjects.remove(polygonObjRef.current);
      polygonObjRef.current = null;
    }

    if (points.length >= 3) {
      const coords = points.map((p: any) => [p[0], p[1]]);
      polygonObjRef.current = new ymaps.Polygon(
        [coords],
        {},
        {
          fillColor: "#3b82f633",
          strokeColor: "#3b82f6",
          strokeWidth: 2,
          fillOpacity: 0.2,
        }
      );
      map.geoObjects.add(polygonObjRef.current);
    }
  }, []);

  const createPointMarker = useCallback(
    (point: number[], index: number, allPoints: number[][]) => {
      const map = mapInstanceRef.current;
      if (!map) return null;

      const placemark = new ymaps.Placemark(
        [point[0], point[1]],
        {},
        {
          draggable: !disabled,
          preset: "islands#redCircleDotIcon",
          iconColor: "#ef4444",
        }
      );

      if (!disabled) {
        placemark.events.add("drag", () => {
          const coords = placemark.geometry.getCoordinates();
          const currentPts = [...polygonPointsStateRef.current];
          const markerIdx = polygonPointMarkersRef.current.indexOf(placemark);
          if (markerIdx > -1 && currentPts[markerIdx]) {
            currentPts[markerIdx] = [coords[0], coords[1]];
            setPolygonPoints(currentPts);
            updatePolygonShape(currentPts as any);
          }
        });

        placemark.events.add("dragend", () => {
          const coords = placemark.geometry.getCoordinates();
          const currentPts = [...polygonPointsStateRef.current];
          const markerIdx = polygonPointMarkersRef.current.indexOf(placemark);
          if (markerIdx > -1 && currentPts[markerIdx]) {
            currentPts[markerIdx] = [coords[0], coords[1]];
            setPolygonPoints(currentPts);
            onPolygonChangeRef.current?.(currentPts);
            updatePolygonShape(currentPts as any);
          }
        });

        placemark.events.add("click", (e: any) => {
          e.stopPropagation();
          const markerIdx = polygonPointMarkersRef.current.indexOf(placemark);
          setSelectedPointIndex(markerIdx);
          polygonPointMarkersRef.current.forEach((m, i) => {
            if (i === markerIdx) {
              m.options.set("iconColor", "#3b82f6");
              m.options.set("preset", "islands#blueCircleDotIcon");
            } else {
              m.options.set("iconColor", "#ef4444");
              m.options.set("preset", "islands#redCircleDotIcon");
            }
          });
        });

        placemark.events.add("dblclick", (e: any) => {
          e.stopPropagation();
          const currentPts = [...polygonPointsStateRef.current];
          if (currentPts.length > 3) {
            const markerIdx = polygonPointMarkersRef.current.indexOf(placemark);
            if (markerIdx > -1) {
              const updatedPoints = currentPts.filter((_, i) => i !== markerIdx);
              map.geoObjects.remove(placemark);
              polygonPointMarkersRef.current.splice(markerIdx, 1);
              setPolygonPoints(updatedPoints);
              onPolygonChangeRef.current?.(updatedPoints);
              updatePolygonShape(updatedPoints as any);
              setSelectedPointIndex(null);
            }
          }
        });
      }

      map.geoObjects.add(placemark);
      return placemark;
    },
    [disabled, updatePolygonShape]
  );

  const recreatePolygonMarkers = useCallback(
    (points: number[][]) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      polygonPointMarkersRef.current.forEach((m) => {
        map.geoObjects.remove(m);
      });
      polygonPointMarkersRef.current = [];

      points.forEach((point, index) => {
        const marker = createPointMarker(point, index, points);
        if (marker) {
          polygonPointMarkersRef.current.push(marker);
        }
      });
    },
    [createPointMarker]
  );

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    let destroyed = false;

    const initMap = () => {
      if (destroyed || !mapRef.current || mapInstanceRef.current) return;

      const map = new ymaps.Map(mapRef.current, {
        center: [initialLat, initialLon],
        zoom: initialZoom,
        controls: ["zoomControl"],
      });

      mapInstanceRef.current = map;

      if (!polygonMode) {
        const placemark = new ymaps.Placemark(
          [initialLat, initialLon],
          {},
          {
            draggable: !disabled,
            preset: "islands#redDotIcon",
          }
        );

        if (!disabled) {
          placemark.events.add("dragend", () => {
            const coords = placemark.geometry.getCoordinates();
            setCurrentLat(coords[0]);
            setCurrentLon(coords[1]);
            onCoordinateChangeRef.current?.(coords[0], coords[1]);

            if (circleRef.current) {
              circleRef.current.geometry.setCoordinates(coords);
            }
          });
        }

        map.geoObjects.add(placemark);
        markerRef.current = placemark;
      }

      if (serviceRadius && serviceRadius > 0) {
        const circle = new ymaps.Circle(
          [[initialLat, initialLon], serviceRadius],
          {},
          {
            fillColor: "#3b82f633",
            strokeColor: "#3b82f6",
            strokeWidth: 2,
            fillOpacity: 0.2,
          }
        );
        map.geoObjects.add(circle);
        circleRef.current = circle;
      }

      if (!disabled) {
        map.events.add("click", (e: any) => {
          const coords = e.get("coords");
          if (polygonMode) {
            const newPoint = [coords[0], coords[1]];
            const currentPts = [...polygonPointsStateRef.current, newPoint];
            setPolygonPoints(currentPts);
            onPolygonChangeRef.current?.(currentPts);

            const marker = createPointMarker(newPoint, currentPts.length - 1, currentPts);
            if (marker) {
              polygonPointMarkersRef.current.push(marker);
            }
            updatePolygonShape(currentPts as any);
          } else {
            const lat = coords[0];
            const lon = coords[1];
            setCurrentLat(lat);
            setCurrentLon(lon);

            if (markerRef.current) {
              markerRef.current.geometry.setCoordinates([lat, lon]);
            } else {
              const placemark = new ymaps.Placemark(
                [lat, lon],
                {},
                {
                  draggable: !disabled,
                  preset: "islands#redDotIcon",
                }
              );
              placemark.events.add("dragend", () => {
                const c = placemark.geometry.getCoordinates();
                setCurrentLat(c[0]);
                setCurrentLon(c[1]);
                onCoordinateChangeRef.current?.(c[0], c[1]);
                if (circleRef.current) {
                  circleRef.current.geometry.setCoordinates(c);
                }
              });
              map.geoObjects.add(placemark);
              markerRef.current = placemark;
            }

            if (circleRef.current) {
              circleRef.current.geometry.setCoordinates([lat, lon]);
            }

            onCoordinateChangeRef.current?.(lat, lon);
          }
        });
      }

      setCurrentLat(initialLat);
      setCurrentLon(initialLon);
    };

    const timer = setTimeout(() => {
      if (typeof ymaps !== "undefined" && ymaps.ready) {
        ymaps.ready(initMap);
      }
    }, 50);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
      markerRef.current = null;
      circleRef.current = null;
      polygonObjRef.current = null;
      polygonPointMarkersRef.current = [];
    };
  }, []);

  // Update map center and marker when initialLat/initialLon change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    setCurrentLat(initialLat);
    setCurrentLon(initialLon);

    map.setCenter([initialLat, initialLon], map.getZoom());

    if (markerRef.current && !polygonMode) {
      markerRef.current.geometry.setCoordinates([initialLat, initialLon]);
    }

    if (circleRef.current) {
      map.geoObjects.remove(circleRef.current);
      circleRef.current = null;
    }
    if (serviceRadius && serviceRadius > 0) {
      const circle = new ymaps.Circle(
        [[initialLat, initialLon], serviceRadius],
        {},
        {
          fillColor: "#3b82f633",
          strokeColor: "#3b82f6",
          strokeWidth: 2,
          fillOpacity: 0.2,
        }
      );
      map.geoObjects.add(circle);
      circleRef.current = circle;
    }
  }, [initialLat, initialLon, polygonMode, serviceRadius]);

  // Update marker position when currentLat/currentLon change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || polygonMode) return;

    if (markerRef.current) {
      markerRef.current.geometry.setCoordinates([currentLat, currentLon]);
    }

    if (circleRef.current && serviceRadius && serviceRadius > 0) {
      circleRef.current.geometry.setCoordinates([currentLat, currentLon]);
    }
  }, [currentLat, currentLon, polygonMode]);

  // Update service radius circle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || polygonMode) return;

    if (circleRef.current) {
      if (serviceRadius && serviceRadius > 0) {
        circleRef.current.geometry.setRadius(serviceRadius);
        circleRef.current.geometry.setCoordinates([currentLat, currentLon]);
      } else {
        map.geoObjects.remove(circleRef.current);
        circleRef.current = null;
      }
    } else if (serviceRadius && serviceRadius > 0) {
      const circle = new ymaps.Circle(
        [[currentLat, currentLon], serviceRadius],
        {},
        {
          fillColor: "#3b82f633",
          strokeColor: "#3b82f6",
          strokeWidth: 2,
          fillOpacity: 0.2,
        }
      );
      map.geoObjects.add(circle);
      circleRef.current = circle;
    }
  }, [serviceRadius, currentLat, currentLon, polygonMode]);

  // Restore polygon from initialPolygon
  useEffect(() => {
    if (!polygonMode || !mapInstanceRef.current) return;

    if (initialPolygon && initialPolygon.length > 0) {
      setPolygonPoints(initialPolygon);
      recreatePolygonMarkers(initialPolygon);
      updatePolygonShape(initialPolygon as any);
    } else {
      setPolygonPoints([]);
      clearPolygon();
    }
  }, [initialPolygon, polygonMode]);

  const clearPolygon = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    polygonPointMarkersRef.current.forEach((m) => {
      map.geoObjects.remove(m);
    });
    polygonPointMarkersRef.current = [];

    if (polygonObjRef.current) {
      map.geoObjects.remove(polygonObjRef.current);
      polygonObjRef.current = null;
    }

    setPolygonPoints([]);
    setSelectedPointIndex(null);
    onPolygonChange?.([]);
  };

  // Address search via ymaps.suggest
  const handleSearchInput = (value: string) => {
    setSearchQuery(value);

    if (suggestTimeoutRef.current) {
      clearTimeout(suggestTimeoutRef.current);
    }

    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    suggestTimeoutRef.current = setTimeout(() => {
      if (typeof ymaps !== "undefined" && ymaps.suggest) {
        ymaps
          .suggest(value)
          .then((items: any[]) => {
            setSuggestions(items || []);
            setShowSuggestions((items || []).length > 0);
          })
          .catch(() => {
            setSuggestions([]);
            setShowSuggestions(false);
          });
      }
    }, 300);
  };

  const handleSuggestionSelect = (suggestion: any) => {
    const address = suggestion.value || suggestion.displayName || "";
    setSearchQuery(address);
    setSuggestions([]);
    setShowSuggestions(false);

    if (typeof ymaps !== "undefined" && ymaps.geocode) {
      ymaps.geocode(address).then((result: any) => {
        const firstGeoObject = result.geoObjects.get(0);
        if (firstGeoObject) {
          const coords = firstGeoObject.geometry.getCoordinates();
          const lat = coords[0];
          const lon = coords[1];

          setCurrentLat(lat);
          setCurrentLon(lon);

          const map = mapInstanceRef.current;
          if (map) {
            map.setCenter([lat, lon], map.getZoom());
          }

          if (markerRef.current && !polygonMode) {
            markerRef.current.geometry.setCoordinates([lat, lon]);
          }

          if (circleRef.current) {
            circleRef.current.geometry.setCoordinates([lat, lon]);
          }

          onCoordinateChange?.(lat, lon);
        }
      });
    }
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-2">
      {/* Address search */}
      <div ref={searchWrapperRef} style={{ position: "relative" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          placeholder="Поиск адреса..."
          disabled={disabled}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white text-sm"
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 1000,
              maxHeight: "200px",
              overflowY: "auto",
            }}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg mt-1"
          >
            {suggestions.map((s: any, i: number) => (
              <li
                key={i}
                onClick={() => handleSuggestionSelect(s)}
                className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
              >
                {s.displayName || s.value}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map container */}
      <div
        ref={mapRef}
        style={{ height, position: "relative", zIndex: "auto" }}
        className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
      />

      {/* Coordinate / polygon info display */}
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
