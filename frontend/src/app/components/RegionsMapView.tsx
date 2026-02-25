import { useEffect, useRef, useState } from "react";
import { Region } from "../services/regions";
import { MapPin, Loader2 } from "lucide-react";

declare const ymaps: typeof window.ymaps;

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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<ymaps.Map | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  useEffect(() => {
    if (mapInstanceRef.current) return;

    const initMap = () => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      let centerLat = 47.10869114222083;
      let centerLon = 51.9049072265625;

      if (regions.length > 0) {
        centerLat = regions.reduce((sum, r) => sum + r.center_lat, 0) / regions.length;
        centerLon = regions.reduce((sum, r) => sum + r.center_lon, 0) / regions.length;
      }

      try {
        mapInstanceRef.current = new ymaps.Map(mapContainerRef.current, {
          center: [centerLat, centerLon],
          zoom: defaultZoom,
          controls: ['zoomControl', 'typeSelector'],
        });

        setTimeout(() => setMapInitialized(true), 200);
      } catch (error) {
        console.error('Ошибка инициализации карты:', error);
        setMapInitialized(true);
      }
    };

    if (mapContainerRef.current) {
      ymaps.ready(initMap);
    } else {
      const timer = setTimeout(() => ymaps.ready(initMap), 100);
      return () => clearTimeout(timer);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
        setMapInitialized(false);
      }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapInitialized || regions.length === 0) return;

    const avgLat = regions.reduce((sum, r) => sum + r.center_lat, 0) / regions.length;
    const avgLon = regions.reduce((sum, r) => sum + r.center_lon, 0) / regions.length;
    map.setCenter([avgLat, avgLon], defaultZoom);
  }, [regions.length, mapInitialized, defaultZoom]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapInitialized) return;

    map.geoObjects.removeAll();

    regions.forEach((region) => {
      const coords: [number, number] = [region.center_lat, region.center_lon];

      const popupContent = `
        <div style="min-width:200px;">
          <h3 style="margin:0 0 8px;font-weight:600;color:#1f2937;">${region.title}</h3>
          <p style="margin:4px 0;font-size:12px;color:#6b7280;">Город: ${region.city.title}</p>
          <p style="margin:4px 0;font-size:12px;color:#6b7280;">ID: ${region.id}</p>
          <p style="margin:4px 0;font-size:12px;color:#6b7280;">
            Координаты: ${region.center_lat.toFixed(4)}, ${region.center_lon.toFixed(4)}
          </p>
          ${region.service_radius_meters ? `<p style="margin:4px 0;font-size:12px;color:#6b7280;">Радиус: ${region.service_radius_meters} м</p>` : ''}
          ${region.polygon_coordinates && region.polygon_coordinates.length > 0 ? `<p style="margin:4px 0;font-size:12px;color:#6b7280;">Полигон: ${region.polygon_coordinates.length} точек</p>` : ''}
        </div>`;

      const placemark = new ymaps.Placemark(
        coords,
        { balloonContent: popupContent },
        { preset: 'islands#blueCircleDotIcon' }
      );

      placemark.events.add('click', () => {
        if (onRegionClick) onRegionClick(region);
      });

      map.geoObjects.add(placemark);

      if (region.polygon_coordinates && region.polygon_coordinates.length >= 3) {
        const ring = region.polygon_coordinates.map((p) => [p[0], p[1]]);
        const polygon = new ymaps.Polygon(
          [ring],
          { balloonContent: popupContent },
          {
            fillColor: '#3b82f633',
            strokeColor: '#3b82f6',
            strokeWidth: 2,
          }
        );

        polygon.events.add('click', () => {
          if (onRegionClick) onRegionClick(region);
        });

        map.geoObjects.add(polygon);
      } else if (region.service_radius_meters && region.service_radius_meters > 0) {
        const circle = new ymaps.Circle(
          [coords, region.service_radius_meters],
          { balloonContent: popupContent },
          {
            fillColor: '#3b82f633',
            strokeColor: '#3b82f6',
            strokeWidth: 2,
          }
        );

        circle.events.add('click', () => {
          if (onRegionClick) onRegionClick(region);
        });

        map.geoObjects.add(circle);
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
          <div ref={mapContainerRef} className="w-full h-full rounded-lg" />
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
