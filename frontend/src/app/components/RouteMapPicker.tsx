import { useEffect, useRef, useState, useCallback } from "react";

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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<ymaps.Map | null>(null);
  const pickupMarkerRef = useRef<ymaps.Placemark | null>(null);
  const dropoffMarkerRef = useRef<ymaps.Placemark | null>(null);
  const routeLineRef = useRef<ymaps.Polyline | null>(null);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lon: number } | null>(
    initialPickup ? { lat: initialPickup.lat, lon: initialPickup.lon } : null
  );
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lon: number } | null>(
    initialDropoff ? { lat: initialDropoff.lat, lon: initialDropoff.lon } : null
  );
  const [currentMode, setCurrentMode] = useState<"pickup" | "dropoff">("pickup");
  const [ready, setReady] = useState(false);
  const [pickupSearch, setPickupSearch] = useState("");
  const [dropoffSearch, setDropoffSearch] = useState("");

  const pickupCoordsRef = useRef(pickupCoords);
  const dropoffCoordsRef = useRef(dropoffCoords);
  const currentModeRef = useRef(currentMode);

  useEffect(() => { pickupCoordsRef.current = pickupCoords; }, [pickupCoords]);
  useEffect(() => { dropoffCoordsRef.current = dropoffCoords; }, [dropoffCoords]);
  useEffect(() => { currentModeRef.current = currentMode; }, [currentMode]);

  useEffect(() => { ymaps.ready(() => setReady(true)); }, []);

  const updateRoute = useCallback(() => {
    if (!mapInstanceRef.current) return;
    if (routeLineRef.current) {
      mapInstanceRef.current.geoObjects.remove(routeLineRef.current);
      routeLineRef.current = null;
    }
    const pickup = pickupCoordsRef.current;
    const dropoff = dropoffCoordsRef.current;
    if (pickup && dropoff) {
      routeLineRef.current = new ymaps.Polyline(
        [[pickup.lat, pickup.lon], [dropoff.lat, dropoff.lon]],
        {},
        { strokeColor: "#3b82f6", strokeWidth: 4, strokeStyle: "dash", opacity: 0.7 }
      );
      mapInstanceRef.current.geoObjects.add(routeLineRef.current);
    }
  }, []);

  const addPickupMarker = useCallback((lat: number, lon: number) => {
    if (!mapInstanceRef.current) return;
    if (pickupMarkerRef.current) {
      mapInstanceRef.current.geoObjects.remove(pickupMarkerRef.current);
    }
    pickupMarkerRef.current = new ymaps.Placemark(
      [lat, lon],
      { iconCaption: "A - Откуда" },
      { preset: "islands#greenDotIcon", draggable: true }
    );
    pickupMarkerRef.current.events.add("dragend", () => {
      const coords = pickupMarkerRef.current!.geometry.getCoordinates();
      const newCoords = { lat: coords[0], lon: coords[1] };
      setPickupCoords(newCoords);
      pickupCoordsRef.current = newCoords;
      onPickupChange?.(coords[0], coords[1]);
      updateRoute();
    });
    mapInstanceRef.current.geoObjects.add(pickupMarkerRef.current);
    onPickupChange?.(lat, lon);
  }, [onPickupChange, updateRoute]);

  const updatePickupMarker = useCallback((lat: number, lon: number) => {
    if (!mapInstanceRef.current) return;
    if (pickupMarkerRef.current) {
      pickupMarkerRef.current.geometry.setCoordinates([lat, lon]);
    } else {
      addPickupMarker(lat, lon);
    }
    onPickupChange?.(lat, lon);
  }, [addPickupMarker, onPickupChange]);

  const addDropoffMarker = useCallback((lat: number, lon: number) => {
    if (!mapInstanceRef.current) return;
    if (dropoffMarkerRef.current) {
      mapInstanceRef.current.geoObjects.remove(dropoffMarkerRef.current);
    }
    dropoffMarkerRef.current = new ymaps.Placemark(
      [lat, lon],
      { iconCaption: "B - Куда" },
      { preset: "islands#redDotIcon", draggable: true }
    );
    dropoffMarkerRef.current.events.add("dragend", () => {
      const coords = dropoffMarkerRef.current!.geometry.getCoordinates();
      const newCoords = { lat: coords[0], lon: coords[1] };
      setDropoffCoords(newCoords);
      dropoffCoordsRef.current = newCoords;
      onDropoffChange?.(coords[0], coords[1]);
      updateRoute();
    });
    mapInstanceRef.current.geoObjects.add(dropoffMarkerRef.current);
    onDropoffChange?.(lat, lon);
  }, [onDropoffChange, updateRoute]);

  const updateDropoffMarker = useCallback((lat: number, lon: number) => {
    if (!mapInstanceRef.current) return;
    if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.geometry.setCoordinates([lat, lon]);
    } else {
      addDropoffMarker(lat, lon);
    }
    onDropoffChange?.(lat, lon);
  }, [addDropoffMarker, onDropoffChange]);

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstanceRef.current) return;

    let centerLat = initialLat;
    let centerLon = initialLon;
    if (pickupCoords) { centerLat = pickupCoords.lat; centerLon = pickupCoords.lon; }
    else if (dropoffCoords) { centerLat = dropoffCoords.lat; centerLon = dropoffCoords.lon; }

    mapInstanceRef.current = new ymaps.Map(mapRef.current, {
      center: [centerLat, centerLon],
      zoom: initialZoom,
      controls: ["zoomControl"],
    });

    if (pickupCoords) addPickupMarker(pickupCoords.lat, pickupCoords.lon);
    if (dropoffCoords) addDropoffMarker(dropoffCoords.lat, dropoffCoords.lon);

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
      } else if (selectionMode === "dropoff") {
        const newCoords = { lat, lon };
        setDropoffCoords(newCoords);
        dropoffCoordsRef.current = newCoords;
        updateDropoffMarker(lat, lon);
      }
      updateRoute();
    });

    updateRoute();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { updateRoute(); }, [pickupCoords, dropoffCoords, updateRoute]);

  useEffect(() => {
    if (initialPickup && mapInstanceRef.current) {
      const newCoords = { lat: initialPickup.lat, lon: initialPickup.lon };
      const currentCoords = pickupCoordsRef.current;
      if (!currentCoords || Math.abs(currentCoords.lat - newCoords.lat) > 0.0001 || Math.abs(currentCoords.lon - newCoords.lon) > 0.0001) {
        setPickupCoords(newCoords);
        pickupCoordsRef.current = newCoords;
        updatePickupMarker(initialPickup.lat, initialPickup.lon);
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
      if (!currentCoords || Math.abs(currentCoords.lat - newCoords.lat) > 0.0001 || Math.abs(currentCoords.lon - newCoords.lon) > 0.0001) {
        setDropoffCoords(newCoords);
        dropoffCoordsRef.current = newCoords;
        updateDropoffMarker(initialDropoff.lat, initialDropoff.lon);
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

  const handleGeocode = async (query: string, type: "pickup" | "dropoff") => {
    if (!query.trim() || !mapInstanceRef.current) return;
    try {
      const result = await ymaps.geocode(query, { results: 1 });
      const firstGeoObject = result.geoObjects.get(0);
      if (firstGeoObject) {
        const coords = firstGeoObject.geometry.getCoordinates();
        const address = firstGeoObject.getAddressLine?.() || query;
        mapInstanceRef.current.setCenter(coords, 16);
        if (type === "pickup") {
          const newCoords = { lat: coords[0], lon: coords[1] };
          setPickupCoords(newCoords);
          pickupCoordsRef.current = newCoords;
          updatePickupMarker(coords[0], coords[1]);
          onPickupChange?.(coords[0], coords[1], address);
        } else {
          const newCoords = { lat: coords[0], lon: coords[1] };
          setDropoffCoords(newCoords);
          dropoffCoordsRef.current = newCoords;
          updateDropoffMarker(coords[0], coords[1]);
          onDropoffChange?.(coords[0], coords[1], address);
        }
        updateRoute();
      }
    } catch (err) {
      console.error("Ошибка геокодирования:", err);
    }
  };

  return (
    <div className="space-y-3">
      {/* Поиск адресов */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={pickupSearch}
            onChange={(e) => setPickupSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGeocode(pickupSearch, "pickup")}
            placeholder='Адрес "Откуда"...'
            className="flex-1 px-3 py-2 text-sm border border-green-300 dark:border-green-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
          />
          <button type="button" onClick={() => handleGeocode(pickupSearch, "pickup")}
            className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap">
            A
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={dropoffSearch}
            onChange={(e) => setDropoffSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGeocode(dropoffSearch, "dropoff")}
            placeholder='Адрес "Куда"...'
            className="flex-1 px-3 py-2 text-sm border border-red-300 dark:border-red-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
          />
          <button type="button" onClick={() => handleGeocode(dropoffSearch, "dropoff")}
            className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap">
            B
          </button>
        </div>
      </div>

      {selectionMode === "both" && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setCurrentMode("pickup")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentMode === "pickup" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
            Выбрать "Откуда"
          </button>
          <button type="button" onClick={() => setCurrentMode("dropoff")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentMode === "dropoff" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
            Выбрать "Куда"
          </button>
        </div>
      )}

      <div ref={mapRef} style={{ height }} className="w-full rounded-lg border border-gray-200 dark:border-gray-700" />

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Откуда (A)</p>
          {pickupCoords ? (
            <p className="text-gray-900 dark:text-white font-mono text-xs">{pickupCoords.lat.toFixed(6)}, {pickupCoords.lon.toFixed(6)}</p>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 italic">Не выбрано</p>
          )}
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Куда (B)</p>
          {dropoffCoords ? (
            <p className="text-gray-900 dark:text-white font-mono text-xs">{dropoffCoords.lat.toFixed(6)}, {dropoffCoords.lon.toFixed(6)}</p>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 italic">Не выбрано</p>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        {selectionMode === "both"
          ? `Введите адрес или кликните на карте, чтобы выбрать точку "${currentMode === "pickup" ? "Откуда" : "Куда"}". Маркеры можно перетаскивать.`
          : `Введите адрес или кликните на карте, чтобы выбрать точку "${selectionMode === "pickup" ? "Откуда" : "Куда"}".`}
      </div>
    </div>
  );
}
