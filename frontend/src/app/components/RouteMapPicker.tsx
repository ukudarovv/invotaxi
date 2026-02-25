import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    ymaps: any;
  }
}

interface RouteMapPickerProps {
  initialLat?: number;
  initialLon?: number;
  initialZoom?: number;
  height?: string;
  onPickupChange?: (lat: number, lon: number, address?: string) => void;
  onDropoffChange?: (lat: number, lon: number, address?: string) => void;
  initialPickup?: { lat: number; lon: number; address?: string };
  initialDropoff?: { lat: number; lon: number; address?: string };
  selectionMode?: "pickup" | "dropoff" | "both";
}

export function RouteMapPicker({
  initialLat = 47.1171,
  initialLon = 51.8833,
  initialZoom = 13,
  height = "400px",
  onPickupChange,
  onDropoffChange,
  initialPickup,
  initialDropoff,
  selectionMode = "both",
}: RouteMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const dropoffMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const ymapsReadyRef = useRef(false);

  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lon: number } | null>(
    initialPickup ? { lat: initialPickup.lat, lon: initialPickup.lon } : null
  );
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lon: number } | null>(
    initialDropoff ? { lat: initialDropoff.lat, lon: initialDropoff.lon } : null
  );
  const [currentMode, setCurrentMode] = useState<"pickup" | "dropoff">("pickup");

  const [pickupQuery, setPickupQuery] = useState(initialPickup?.address ?? "");
  const [dropoffQuery, setDropoffQuery] = useState(initialDropoff?.address ?? "");
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([]);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDropoffSuggestions, setShowDropoffSuggestions] = useState(false);

  const pickupCoordsRef = useRef(pickupCoords);
  const dropoffCoordsRef = useRef(dropoffCoords);
  const currentModeRef = useRef(currentMode);

  useEffect(() => {
    pickupCoordsRef.current = pickupCoords;
  }, [pickupCoords]);

  useEffect(() => {
    dropoffCoordsRef.current = dropoffCoords;
  }, [dropoffCoords]);

  useEffect(() => {
    currentModeRef.current = currentMode;
  }, [currentMode]);

  const updateRoute = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLineRef.current) {
      map.geoObjects.remove(routeLineRef.current);
      routeLineRef.current = null;
    }

    const pickup = pickupCoordsRef.current;
    const dropoff = dropoffCoordsRef.current;
    if (pickup && dropoff) {
      const ymaps = window.ymaps;
      routeLineRef.current = new ymaps.Polyline(
        [
          [pickup.lat, pickup.lon],
          [dropoff.lat, dropoff.lon],
        ],
        {},
        {
          strokeColor: "#3b82f6",
          strokeWidth: 4,
          strokeOpacity: 0.7,
          strokeStyle: "dash",
        }
      );
      map.geoObjects.add(routeLineRef.current);
    }
  }, []);

  const addPickupMarker = useCallback(
    (lat: number, lon: number, address?: string) => {
      const map = mapInstanceRef.current;
      if (!map) return;
      const ymaps = window.ymaps;

      if (pickupMarkerRef.current) {
        map.geoObjects.remove(pickupMarkerRef.current);
      }

      pickupMarkerRef.current = new ymaps.Placemark(
        [lat, lon],
        { iconContent: "A" },
        { preset: "islands#greenDotIcon", draggable: true }
      );

      pickupMarkerRef.current.events.add("dragend", () => {
        const coords = pickupMarkerRef.current.geometry.getCoordinates();
        const newCoords = { lat: coords[0], lon: coords[1] };
        setPickupCoords(newCoords);
        pickupCoordsRef.current = newCoords;
        onPickupChange?.(coords[0], coords[1]);
        updateRoute();
      });

      map.geoObjects.add(pickupMarkerRef.current);
      onPickupChange?.(lat, lon, address);
    },
    [onPickupChange, updateRoute]
  );

  const updatePickupMarker = useCallback(
    (lat: number, lon: number, address?: string) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.geometry.setCoordinates([lat, lon]);
      } else {
        addPickupMarker(lat, lon, address);
      }
      onPickupChange?.(lat, lon, address);
    },
    [addPickupMarker, onPickupChange]
  );

  const addDropoffMarker = useCallback(
    (lat: number, lon: number, address?: string) => {
      const map = mapInstanceRef.current;
      if (!map) return;
      const ymaps = window.ymaps;

      if (dropoffMarkerRef.current) {
        map.geoObjects.remove(dropoffMarkerRef.current);
      }

      dropoffMarkerRef.current = new ymaps.Placemark(
        [lat, lon],
        { iconContent: "B" },
        { preset: "islands#redDotIcon", draggable: true }
      );

      dropoffMarkerRef.current.events.add("dragend", () => {
        const coords = dropoffMarkerRef.current.geometry.getCoordinates();
        const newCoords = { lat: coords[0], lon: coords[1] };
        setDropoffCoords(newCoords);
        dropoffCoordsRef.current = newCoords;
        onDropoffChange?.(coords[0], coords[1]);
        updateRoute();
      });

      map.geoObjects.add(dropoffMarkerRef.current);
      onDropoffChange?.(lat, lon, address);
    },
    [onDropoffChange, updateRoute]
  );

  const updateDropoffMarker = useCallback(
    (lat: number, lon: number, address?: string) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (dropoffMarkerRef.current) {
        dropoffMarkerRef.current.geometry.setCoordinates([lat, lon]);
      } else {
        addDropoffMarker(lat, lon, address);
      }
      onDropoffChange?.(lat, lon, address);
    },
    [addDropoffMarker, onDropoffChange]
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const ymaps = window.ymaps;
    if (!ymaps) return;

    ymaps.ready(() => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;
      ymapsReadyRef.current = true;

      let centerLat = initialLat;
      let centerLon = initialLon;

      if (pickupCoordsRef.current) {
        centerLat = pickupCoordsRef.current.lat;
        centerLon = pickupCoordsRef.current.lon;
      } else if (dropoffCoordsRef.current) {
        centerLat = dropoffCoordsRef.current.lat;
        centerLon = dropoffCoordsRef.current.lon;
      }

      mapInstanceRef.current = new ymaps.Map(mapContainerRef.current, {
        center: [centerLat, centerLon],
        zoom: initialZoom,
        controls: ["zoomControl", "geolocationControl"],
      });

      if (pickupCoordsRef.current) {
        addPickupMarker(pickupCoordsRef.current.lat, pickupCoordsRef.current.lon);
      }
      if (dropoffCoordsRef.current) {
        addDropoffMarker(dropoffCoordsRef.current.lat, dropoffCoordsRef.current.lon);
      }

      mapInstanceRef.current.events.add("click", (e: any) => {
        const coords = e.get("coords");
        const lat = coords[0];
        const lon = coords[1];

        const currentPickup = pickupCoordsRef.current;
        const currentDropoff = dropoffCoordsRef.current;
        const mode = currentModeRef.current;

        if (selectionMode === "both") {
          if (!currentPickup) {
            const newCoords = { lat, lon };
            setPickupCoords(newCoords);
            pickupCoordsRef.current = newCoords;
            addPickupMarker(lat, lon);
            setCurrentMode("dropoff");
            currentModeRef.current = "dropoff";
          } else if (!currentDropoff) {
            const newCoords = { lat, lon };
            setDropoffCoords(newCoords);
            dropoffCoordsRef.current = newCoords;
            addDropoffMarker(lat, lon);
            setCurrentMode("pickup");
            currentModeRef.current = "pickup";
          } else {
            if (mode === "pickup") {
              const newCoords = { lat, lon };
              setPickupCoords(newCoords);
              pickupCoordsRef.current = newCoords;
              updatePickupMarker(lat, lon);
              setCurrentMode("dropoff");
              currentModeRef.current = "dropoff";
            } else {
              const newCoords = { lat, lon };
              setDropoffCoords(newCoords);
              dropoffCoordsRef.current = newCoords;
              updateDropoffMarker(lat, lon);
              setCurrentMode("pickup");
              currentModeRef.current = "pickup";
            }
          }
        } else if (selectionMode === "pickup") {
          const newCoords = { lat, lon };
          setPickupCoords(newCoords);
          pickupCoordsRef.current = newCoords;
          updatePickupMarker(lat, lon);
          onPickupChange?.(lat, lon);
        } else if (selectionMode === "dropoff") {
          const newCoords = { lat, lon };
          setDropoffCoords(newCoords);
          dropoffCoordsRef.current = newCoords;
          updateDropoffMarker(lat, lon);
          onDropoffChange?.(lat, lon);
        }

        updateRoute();
      });

      updateRoute();
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    updateRoute();
  }, [pickupCoords, dropoffCoords, updateRoute]);

  useEffect(() => {
    if (initialPickup && mapInstanceRef.current) {
      const newCoords = { lat: initialPickup.lat, lon: initialPickup.lon };
      const currentCoords = pickupCoordsRef.current;
      if (
        !currentCoords ||
        Math.abs(currentCoords.lat - newCoords.lat) > 0.0001 ||
        Math.abs(currentCoords.lon - newCoords.lon) > 0.0001
      ) {
        setPickupCoords(newCoords);
        pickupCoordsRef.current = newCoords;
        updatePickupMarker(initialPickup.lat, initialPickup.lon, initialPickup.address);
        updateRoute();
      }
    } else if (!initialPickup && pickupCoordsRef.current && mapInstanceRef.current) {
      if (pickupMarkerRef.current) {
        mapInstanceRef.current.geoObjects.remove(pickupMarkerRef.current);
        pickupMarkerRef.current = null;
      }
      setPickupCoords(null);
      pickupCoordsRef.current = null;
      updateRoute();
    }
  }, [initialPickup?.lat, initialPickup?.lon, updatePickupMarker, updateRoute]);

  useEffect(() => {
    if (initialDropoff && mapInstanceRef.current) {
      const newCoords = { lat: initialDropoff.lat, lon: initialDropoff.lon };
      const currentCoords = dropoffCoordsRef.current;
      if (
        !currentCoords ||
        Math.abs(currentCoords.lat - newCoords.lat) > 0.0001 ||
        Math.abs(currentCoords.lon - newCoords.lon) > 0.0001
      ) {
        setDropoffCoords(newCoords);
        dropoffCoordsRef.current = newCoords;
        updateDropoffMarker(initialDropoff.lat, initialDropoff.lon, initialDropoff.address);
        updateRoute();
      }
    } else if (!initialDropoff && dropoffCoordsRef.current && mapInstanceRef.current) {
      if (dropoffMarkerRef.current) {
        mapInstanceRef.current.geoObjects.remove(dropoffMarkerRef.current);
        dropoffMarkerRef.current = null;
      }
      setDropoffCoords(null);
      dropoffCoordsRef.current = null;
      updateRoute();
    }
  }, [initialDropoff?.lat, initialDropoff?.lon, updateDropoffMarker, updateRoute]);

  // Address suggestion handlers
  const handlePickupInput = useCallback(async (value: string) => {
    setPickupQuery(value);
    if (!ymapsReadyRef.current || value.length < 2) {
      setPickupSuggestions([]);
      setShowPickupSuggestions(false);
      return;
    }
    try {
      const results = await window.ymaps.suggest(value);
      setPickupSuggestions(results);
      setShowPickupSuggestions(results.length > 0);
    } catch {
      setPickupSuggestions([]);
      setShowPickupSuggestions(false);
    }
  }, []);

  const handleDropoffInput = useCallback(async (value: string) => {
    setDropoffQuery(value);
    if (!ymapsReadyRef.current || value.length < 2) {
      setDropoffSuggestions([]);
      setShowDropoffSuggestions(false);
      return;
    }
    try {
      const results = await window.ymaps.suggest(value);
      setDropoffSuggestions(results);
      setShowDropoffSuggestions(results.length > 0);
    } catch {
      setDropoffSuggestions([]);
      setShowDropoffSuggestions(false);
    }
  }, []);

  const selectPickupSuggestion = useCallback(
    async (item: any) => {
      setPickupQuery(item.displayName);
      setShowPickupSuggestions(false);
      setPickupSuggestions([]);
      try {
        const res = await window.ymaps.geocode(item.displayName);
        const firstGeoObject = res.geoObjects.get(0);
        if (firstGeoObject) {
          const coords = firstGeoObject.geometry.getCoordinates();
          const address = firstGeoObject.getAddressLine();
          const newCoords = { lat: coords[0], lon: coords[1] };
          setPickupCoords(newCoords);
          pickupCoordsRef.current = newCoords;
          updatePickupMarker(coords[0], coords[1], address);
          updateRoute();
          mapInstanceRef.current?.setCenter(coords, mapInstanceRef.current.getZoom());
        }
      } catch {
        // geocode failed silently
      }
    },
    [updatePickupMarker, updateRoute]
  );

  const selectDropoffSuggestion = useCallback(
    async (item: any) => {
      setDropoffQuery(item.displayName);
      setShowDropoffSuggestions(false);
      setDropoffSuggestions([]);
      try {
        const res = await window.ymaps.geocode(item.displayName);
        const firstGeoObject = res.geoObjects.get(0);
        if (firstGeoObject) {
          const coords = firstGeoObject.geometry.getCoordinates();
          const address = firstGeoObject.getAddressLine();
          const newCoords = { lat: coords[0], lon: coords[1] };
          setDropoffCoords(newCoords);
          dropoffCoordsRef.current = newCoords;
          updateDropoffMarker(coords[0], coords[1], address);
          updateRoute();
          mapInstanceRef.current?.setCenter(coords, mapInstanceRef.current.getZoom());
        }
      } catch {
        // geocode failed silently
      }
    },
    [updateDropoffMarker, updateRoute]
  );

  return (
    <div className="space-y-3">
      {/* Address search inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Откуда
          </label>
          <input
            type="text"
            value={pickupQuery}
            onChange={(e) => handlePickupInput(e.target.value)}
            onFocus={() => pickupSuggestions.length > 0 && setShowPickupSuggestions(true)}
            onBlur={() => setTimeout(() => setShowPickupSuggestions(false), 200)}
            placeholder="Введите адрес отправления..."
            className="w-full px-3 py-2 text-sm border border-green-300 dark:border-green-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {showPickupSuggestions && pickupSuggestions.length > 0 && (
            <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {pickupSuggestions.map((item: any, idx: number) => (
                <li
                  key={idx}
                  onMouseDown={() => selectPickupSuggestion(item)}
                  className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-green-50 dark:hover:bg-green-900/30 cursor-pointer"
                >
                  {item.displayName}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="relative">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Куда
          </label>
          <input
            type="text"
            value={dropoffQuery}
            onChange={(e) => handleDropoffInput(e.target.value)}
            onFocus={() => dropoffSuggestions.length > 0 && setShowDropoffSuggestions(true)}
            onBlur={() => setTimeout(() => setShowDropoffSuggestions(false), 200)}
            placeholder="Введите адрес назначения..."
            className="w-full px-3 py-2 text-sm border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {showDropoffSuggestions && dropoffSuggestions.length > 0 && (
            <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {dropoffSuggestions.map((item: any, idx: number) => (
                <li
                  key={idx}
                  onMouseDown={() => selectDropoffSuggestion(item)}
                  className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer"
                >
                  {item.displayName}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Mode toggle buttons */}
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

      {/* Map */}
      <div
        ref={mapContainerRef}
        style={{ height }}
        className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
      />

      {/* Coordinate display */}
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

      {/* Instructions */}
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
