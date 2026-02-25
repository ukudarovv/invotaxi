import { useEffect, useRef, useState, useCallback } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";

// Границы Атырауской области для ограничения поиска
const ATYRAU_BOUNDS: [number[], number[]] = [
  [46.0, 50.5], // юго-запад
  [48.0, 53.5], // северо-восток
];
const ATYRAU_CENTER: [number, number] = [47.1171, 51.8833];

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

interface SuggestItem {
  displayName: string;
  value: string;
}

export function RouteMapPicker({
  initialLat = ATYRAU_CENTER[0],
  initialLon = ATYRAU_CENTER[1],
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
  const [pickupAddress, setPickupAddress] = useState(initialPickup?.address || "");
  const [dropoffAddress, setDropoffAddress] = useState(initialDropoff?.address || "");

  const [pickupSuggestions, setPickupSuggestions] = useState<SuggestItem[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<SuggestItem[]>([]);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDropoffSuggestions, setShowDropoffSuggestions] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const pickupCoordsRef = useRef(pickupCoords);
  const dropoffCoordsRef = useRef(dropoffCoords);
  const currentModeRef = useRef(currentMode);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickupInputRef = useRef<HTMLDivElement>(null);
  const dropoffInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => { pickupCoordsRef.current = pickupCoords; }, [pickupCoords]);
  useEffect(() => { dropoffCoordsRef.current = dropoffCoords; }, [dropoffCoords]);
  useEffect(() => { currentModeRef.current = currentMode; }, [currentMode]);

  useEffect(() => { ymaps.ready(() => setReady(true)); }, []);

  // Закрытие подсказок при клике вне
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickupInputRef.current && !pickupInputRef.current.contains(e.target as Node)) {
        setShowPickupSuggestions(false);
      }
      if (dropoffInputRef.current && !dropoffInputRef.current.contains(e.target as Node)) {
        setShowDropoffSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

  // Reverse geocode: получить адрес по координатам
  const reverseGeocode = useCallback(async (lat: number, lon: number): Promise<string> => {
    try {
      const result = await ymaps.geocode([lat, lon], { results: 1 });
      const firstGeoObject = result.geoObjects.get(0);
      if (firstGeoObject) {
        return firstGeoObject.getAddressLine?.() ||
          firstGeoObject.properties.get("text") ||
          `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      }
    } catch (err) {
      console.error("Ошибка обратного геокодирования:", err);
    }
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }, []);

  const addPickupMarker = useCallback((lat: number, lon: number, address?: string) => {
    if (!mapInstanceRef.current) return;
    if (pickupMarkerRef.current) {
      mapInstanceRef.current.geoObjects.remove(pickupMarkerRef.current);
    }
    const caption = address || "A - Откуда";
    pickupMarkerRef.current = new ymaps.Placemark(
      [lat, lon],
      {
        iconCaption: caption,
        balloonContentHeader: "<strong>Откуда (A)</strong>",
        balloonContentBody: address || "Адрес не определён",
      },
      { preset: "islands#greenDotIcon", draggable: true }
    );
    pickupMarkerRef.current.events.add("dragend", async () => {
      const coords = pickupMarkerRef.current!.geometry.getCoordinates();
      const newCoords = { lat: coords[0], lon: coords[1] };
      setPickupCoords(newCoords);
      pickupCoordsRef.current = newCoords;
      const addr = await reverseGeocode(coords[0], coords[1]);
      setPickupAddress(addr);
      setPickupSearch(addr);
      pickupMarkerRef.current!.properties.set({
        iconCaption: addr,
        balloonContentBody: addr,
      });
      onPickupChange?.(coords[0], coords[1], addr);
      updateRoute();
    });
    mapInstanceRef.current.geoObjects.add(pickupMarkerRef.current);
  }, [onPickupChange, updateRoute, reverseGeocode]);

  const addDropoffMarker = useCallback((lat: number, lon: number, address?: string) => {
    if (!mapInstanceRef.current) return;
    if (dropoffMarkerRef.current) {
      mapInstanceRef.current.geoObjects.remove(dropoffMarkerRef.current);
    }
    const caption = address || "B - Куда";
    dropoffMarkerRef.current = new ymaps.Placemark(
      [lat, lon],
      {
        iconCaption: caption,
        balloonContentHeader: "<strong>Куда (B)</strong>",
        balloonContentBody: address || "Адрес не определён",
      },
      { preset: "islands#redDotIcon", draggable: true }
    );
    dropoffMarkerRef.current.events.add("dragend", async () => {
      const coords = dropoffMarkerRef.current!.geometry.getCoordinates();
      const newCoords = { lat: coords[0], lon: coords[1] };
      setDropoffCoords(newCoords);
      dropoffCoordsRef.current = newCoords;
      const addr = await reverseGeocode(coords[0], coords[1]);
      setDropoffAddress(addr);
      setDropoffSearch(addr);
      dropoffMarkerRef.current!.properties.set({
        iconCaption: addr,
        balloonContentBody: addr,
      });
      onDropoffChange?.(coords[0], coords[1], addr);
      updateRoute();
    });
    mapInstanceRef.current.geoObjects.add(dropoffMarkerRef.current);
  }, [onDropoffChange, updateRoute, reverseGeocode]);

  const updatePickupMarker = useCallback((lat: number, lon: number, address?: string) => {
    if (!mapInstanceRef.current) return;
    if (pickupMarkerRef.current) {
      pickupMarkerRef.current.geometry.setCoordinates([lat, lon]);
      if (address) {
        pickupMarkerRef.current.properties.set({
          iconCaption: address,
          balloonContentBody: address,
        });
      }
    } else {
      addPickupMarker(lat, lon, address);
    }
  }, [addPickupMarker]);

  const updateDropoffMarker = useCallback((lat: number, lon: number, address?: string) => {
    if (!mapInstanceRef.current) return;
    if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.geometry.setCoordinates([lat, lon]);
      if (address) {
        dropoffMarkerRef.current.properties.set({
          iconCaption: address,
          balloonContentBody: address,
        });
      }
    } else {
      addDropoffMarker(lat, lon, address);
    }
  }, [addDropoffMarker]);

  // Подсказки адресов (suggest)
  const fetchSuggestions = useCallback(async (query: string, type: "pickup" | "dropoff") => {
    if (!query.trim() || query.trim().length < 2) {
      if (type === "pickup") setPickupSuggestions([]);
      else setDropoffSuggestions([]);
      return;
    }
    try {
      const items = await ymaps.suggest("Атырау, " + query, {
        boundedBy: ATYRAU_BOUNDS,
        results: 7,
      });
      const suggestions = items.map((item: any) => ({
        displayName: item.displayName,
        value: item.value,
      }));
      if (type === "pickup") {
        setPickupSuggestions(suggestions);
        setShowPickupSuggestions(suggestions.length > 0);
      } else {
        setDropoffSuggestions(suggestions);
        setShowDropoffSuggestions(suggestions.length > 0);
      }
    } catch (err) {
      console.error("Ошибка получения подсказок:", err);
    }
  }, []);

  const handleSearchInput = useCallback((value: string, type: "pickup" | "dropoff") => {
    if (type === "pickup") setPickupSearch(value);
    else setDropoffSearch(value);

    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = setTimeout(() => fetchSuggestions(value, type), 300);
  }, [fetchSuggestions]);

  // Геокодирование адреса
  const geocodeAddress = useCallback(async (query: string, type: "pickup" | "dropoff") => {
    if (!query.trim() || !mapInstanceRef.current) return;
    setGeocoding(true);
    setShowPickupSuggestions(false);
    setShowDropoffSuggestions(false);
    try {
      const result = await ymaps.geocode(query, {
        results: 1,
        boundedBy: ATYRAU_BOUNDS,
        strictBounds: true,
      } as any);
      const firstGeoObject = result.geoObjects.get(0);
      if (firstGeoObject) {
        const coords = firstGeoObject.geometry.getCoordinates();
        const address: string =
          firstGeoObject.getAddressLine?.() ||
          firstGeoObject.properties.get("text") ||
          query;

        mapInstanceRef.current!.setCenter(coords, 16);

        if (type === "pickup") {
          const newCoords = { lat: coords[0], lon: coords[1] };
          setPickupCoords(newCoords);
          pickupCoordsRef.current = newCoords;
          setPickupAddress(address);
          setPickupSearch(address);
          addPickupMarker(coords[0], coords[1], address);
          onPickupChange?.(coords[0], coords[1], address);
        } else {
          const newCoords = { lat: coords[0], lon: coords[1] };
          setDropoffCoords(newCoords);
          dropoffCoordsRef.current = newCoords;
          setDropoffAddress(address);
          setDropoffSearch(address);
          addDropoffMarker(coords[0], coords[1], address);
          onDropoffChange?.(coords[0], coords[1], address);
        }
        updateRoute();
      }
    } catch (err) {
      console.error("Ошибка геокодирования:", err);
    } finally {
      setGeocoding(false);
    }
  }, [addPickupMarker, addDropoffMarker, onPickupChange, onDropoffChange, updateRoute]);

  const handleSuggestionSelect = useCallback((suggestion: SuggestItem, type: "pickup" | "dropoff") => {
    if (type === "pickup") {
      setPickupSearch(suggestion.value);
      setShowPickupSuggestions(false);
    } else {
      setDropoffSearch(suggestion.value);
      setShowDropoffSuggestions(false);
    }
    geocodeAddress(suggestion.value, type);
  }, [geocodeAddress]);

  // Инициализация карты
  useEffect(() => {
    if (!ready || !mapRef.current || mapInstanceRef.current) return;

    let centerLat = initialLat;
    let centerLon = initialLon;
    if (pickupCoords) { centerLat = pickupCoords.lat; centerLon = pickupCoords.lon; }
    else if (dropoffCoords) { centerLat = dropoffCoords.lat; centerLon = dropoffCoords.lon; }

    mapInstanceRef.current = new ymaps.Map(mapRef.current, {
      center: [centerLat, centerLon],
      zoom: initialZoom,
      controls: ["zoomControl", "geolocationControl"],
    });

    if (pickupCoords) addPickupMarker(pickupCoords.lat, pickupCoords.lon, pickupAddress);
    if (dropoffCoords) addDropoffMarker(dropoffCoords.lat, dropoffCoords.lon, dropoffAddress);

    // Клик по карте — ставим маркер + обратное геокодирование
    mapInstanceRef.current.events.add("click", async (e: any) => {
      const coords = e.get("coords");
      const lat = coords[0];
      const lon = coords[1];
      const addr = await reverseGeocode(lat, lon);
      const currentPickup = pickupCoordsRef.current;
      const currentDropoff = dropoffCoordsRef.current;
      const mode = currentModeRef.current;

      if (selectionMode === "both") {
        if (!currentPickup) {
          const newCoords = { lat, lon };
          setPickupCoords(newCoords);
          pickupCoordsRef.current = newCoords;
          setPickupAddress(addr);
          setPickupSearch(addr);
          addPickupMarker(lat, lon, addr);
          onPickupChange?.(lat, lon, addr);
          setCurrentMode("dropoff");
          currentModeRef.current = "dropoff";
        } else if (!currentDropoff) {
          const newCoords = { lat, lon };
          setDropoffCoords(newCoords);
          dropoffCoordsRef.current = newCoords;
          setDropoffAddress(addr);
          setDropoffSearch(addr);
          addDropoffMarker(lat, lon, addr);
          onDropoffChange?.(lat, lon, addr);
          setCurrentMode("pickup");
          currentModeRef.current = "pickup";
        } else {
          if (mode === "pickup") {
            const newCoords = { lat, lon };
            setPickupCoords(newCoords);
            pickupCoordsRef.current = newCoords;
            setPickupAddress(addr);
            setPickupSearch(addr);
            updatePickupMarker(lat, lon, addr);
            onPickupChange?.(lat, lon, addr);
            setCurrentMode("dropoff");
            currentModeRef.current = "dropoff";
          } else {
            const newCoords = { lat, lon };
            setDropoffCoords(newCoords);
            dropoffCoordsRef.current = newCoords;
            setDropoffAddress(addr);
            setDropoffSearch(addr);
            updateDropoffMarker(lat, lon, addr);
            onDropoffChange?.(lat, lon, addr);
            setCurrentMode("pickup");
            currentModeRef.current = "pickup";
          }
        }
      } else if (selectionMode === "pickup") {
        const newCoords = { lat, lon };
        setPickupCoords(newCoords);
        pickupCoordsRef.current = newCoords;
        setPickupAddress(addr);
        setPickupSearch(addr);
        updatePickupMarker(lat, lon, addr);
        onPickupChange?.(lat, lon, addr);
      } else {
        const newCoords = { lat, lon };
        setDropoffCoords(newCoords);
        dropoffCoordsRef.current = newCoords;
        setDropoffAddress(addr);
        setDropoffSearch(addr);
        updateDropoffMarker(lat, lon, addr);
        onDropoffChange?.(lat, lon, addr);
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

  // Sync from parent
  useEffect(() => {
    if (initialPickup && mapInstanceRef.current) {
      const newCoords = { lat: initialPickup.lat, lon: initialPickup.lon };
      const cur = pickupCoordsRef.current;
      if (!cur || Math.abs(cur.lat - newCoords.lat) > 0.0001 || Math.abs(cur.lon - newCoords.lon) > 0.0001) {
        setPickupCoords(newCoords);
        pickupCoordsRef.current = newCoords;
        updatePickupMarker(initialPickup.lat, initialPickup.lon, initialPickup.address);
        updateRoute();
      }
    } else if (!initialPickup && pickupCoordsRef.current && mapInstanceRef.current) {
      if (pickupMarkerRef.current) { mapInstanceRef.current.geoObjects.remove(pickupMarkerRef.current); pickupMarkerRef.current = null; }
      setPickupCoords(null); pickupCoordsRef.current = null;
      setPickupAddress(""); setPickupSearch("");
      updateRoute();
    }
  }, [initialPickup?.lat, initialPickup?.lon, updatePickupMarker, updateRoute]);

  useEffect(() => {
    if (initialDropoff && mapInstanceRef.current) {
      const newCoords = { lat: initialDropoff.lat, lon: initialDropoff.lon };
      const cur = dropoffCoordsRef.current;
      if (!cur || Math.abs(cur.lat - newCoords.lat) > 0.0001 || Math.abs(cur.lon - newCoords.lon) > 0.0001) {
        setDropoffCoords(newCoords);
        dropoffCoordsRef.current = newCoords;
        updateDropoffMarker(initialDropoff.lat, initialDropoff.lon, initialDropoff.address);
        updateRoute();
      }
    } else if (!initialDropoff && dropoffCoordsRef.current && mapInstanceRef.current) {
      if (dropoffMarkerRef.current) { mapInstanceRef.current.geoObjects.remove(dropoffMarkerRef.current); dropoffMarkerRef.current = null; }
      setDropoffCoords(null); dropoffCoordsRef.current = null;
      setDropoffAddress(""); setDropoffSearch("");
      updateRoute();
    }
  }, [initialDropoff?.lat, initialDropoff?.lon, updateDropoffMarker, updateRoute]);

  return (
    <div className="space-y-3">
      {/* Поисковые поля с подсказками */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Поиск "Откуда" */}
        <div ref={pickupInputRef} className="relative">
          <label className="block text-xs font-medium text-green-700 dark:text-green-400 mb-1">
            <MapPin className="w-3 h-3 inline mr-1" />
            Откуда (A)
          </label>
          <div className="flex gap-1">
            <div className="relative flex-1">
              <input
                type="text"
                value={pickupSearch}
                onChange={(e) => handleSearchInput(e.target.value, "pickup")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    geocodeAddress(pickupSearch, "pickup");
                  }
                }}
                onFocus={() => pickupSuggestions.length > 0 && setShowPickupSuggestions(true)}
                placeholder="Введите адрес в Атырау..."
                className="w-full px-3 py-2 pr-8 text-sm border border-green-300 dark:border-green-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
              />
              {geocoding && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-green-600" />
              )}
            </div>
            <button
              type="button"
              onClick={() => geocodeAddress(pickupSearch, "pickup")}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              title="Найти адрес"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          {/* Подсказки */}
          {showPickupSuggestions && pickupSuggestions.length > 0 && (
            <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {pickupSuggestions.map((s, i) => (
                <li
                  key={i}
                  onClick={() => handleSuggestionSelect(s, "pickup")}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/30 text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                >
                  <MapPin className="w-3 h-3 inline mr-2 text-green-500" />
                  {s.displayName}
                </li>
              ))}
            </ul>
          )}
          {pickupAddress && (
            <p className="mt-1 text-xs text-green-700 dark:text-green-400 truncate" title={pickupAddress}>
              ✓ {pickupAddress}
            </p>
          )}
        </div>

        {/* Поиск "Куда" */}
        <div ref={dropoffInputRef} className="relative">
          <label className="block text-xs font-medium text-red-700 dark:text-red-400 mb-1">
            <MapPin className="w-3 h-3 inline mr-1" />
            Куда (B)
          </label>
          <div className="flex gap-1">
            <div className="relative flex-1">
              <input
                type="text"
                value={dropoffSearch}
                onChange={(e) => handleSearchInput(e.target.value, "dropoff")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    geocodeAddress(dropoffSearch, "dropoff");
                  }
                }}
                onFocus={() => dropoffSuggestions.length > 0 && setShowDropoffSuggestions(true)}
                placeholder="Введите адрес в Атырау..."
                className="w-full px-3 py-2 pr-8 text-sm border border-red-300 dark:border-red-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
              />
              {geocoding && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-red-600" />
              )}
            </div>
            <button
              type="button"
              onClick={() => geocodeAddress(dropoffSearch, "dropoff")}
              className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              title="Найти адрес"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          {/* Подсказки */}
          {showDropoffSuggestions && dropoffSuggestions.length > 0 && (
            <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {dropoffSuggestions.map((s, i) => (
                <li
                  key={i}
                  onClick={() => handleSuggestionSelect(s, "dropoff")}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                >
                  <MapPin className="w-3 h-3 inline mr-2 text-red-500" />
                  {s.displayName}
                </li>
              ))}
            </ul>
          )}
          {dropoffAddress && (
            <p className="mt-1 text-xs text-red-700 dark:text-red-400 truncate" title={dropoffAddress}>
              ✓ {dropoffAddress}
            </p>
          )}
        </div>
      </div>

      {/* Кнопки выбора режима */}
      {selectionMode === "both" && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setCurrentMode("pickup")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentMode === "pickup" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 ring-2 ring-green-400" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
            <MapPin className="w-3 h-3 inline mr-1" /> Выбрать "Откуда"
          </button>
          <button type="button" onClick={() => setCurrentMode("dropoff")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentMode === "dropoff" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 ring-2 ring-red-400" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
            <MapPin className="w-3 h-3 inline mr-1" /> Выбрать "Куда"
          </button>
        </div>
      )}

      {/* Карта */}
      <div ref={mapRef} style={{ height }} className="w-full rounded-lg border border-gray-200 dark:border-gray-700" />

      {/* Координаты и адреса */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">Откуда (A)</p>
          {pickupCoords ? (
            <>
              <p className="text-gray-900 dark:text-white font-mono text-xs">
                {pickupCoords.lat.toFixed(6)}, {pickupCoords.lon.toFixed(6)}
              </p>
              {pickupAddress && (
                <p className="text-xs text-green-700 dark:text-green-400 mt-1 truncate" title={pickupAddress}>
                  {pickupAddress}
                </p>
              )}
            </>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 italic text-xs">Не выбрано</p>
          )}
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-xs font-medium text-red-800 dark:text-red-300 mb-1">Куда (B)</p>
          {dropoffCoords ? (
            <>
              <p className="text-gray-900 dark:text-white font-mono text-xs">
                {dropoffCoords.lat.toFixed(6)}, {dropoffCoords.lon.toFixed(6)}
              </p>
              {dropoffAddress && (
                <p className="text-xs text-red-700 dark:text-red-400 mt-1 truncate" title={dropoffAddress}>
                  {dropoffAddress}
                </p>
              )}
            </>
          ) : (
            <p className="text-gray-400 dark:text-gray-500 italic text-xs">Не выбрано</p>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        Введите адрес в Атырауской области или кликните на карте. При клике адрес определяется автоматически.
      </div>
    </div>
  );
}
