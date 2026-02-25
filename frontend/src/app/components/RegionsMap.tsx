import { useEffect, useRef } from "react";
import { Region } from "../services/regions";

declare const ymaps: typeof window.ymaps;

interface RegionsMapProps {
  regions: Region[];
  selectedRegionId?: string | null;
  onRegionSelect?: (regionId: string) => void;
  defaultZoom?: number;
  serviceRadius?: number;
}

export function RegionsMap({
  regions,
  selectedRegionId,
  onRegionSelect,
  defaultZoom = 10,
  serviceRadius = 10000,
}: RegionsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<ymaps.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    let centerLat = 43.238949;
    let centerLon = 76.945833;

    if (regions.length > 0) {
      centerLat = regions.reduce((sum, r) => sum + r.center_lat, 0) / regions.length;
      centerLon = regions.reduce((sum, r) => sum + r.center_lon, 0) / regions.length;
    }

    const init = () => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      mapInstanceRef.current = new ymaps.Map(mapContainerRef.current, {
        center: [centerLat, centerLon],
        zoom: defaultZoom,
        controls: ['zoomControl', 'typeSelector'],
      });
    };

    ymaps.ready(init);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.geoObjects.removeAll();

    regions.forEach((region) => {
      const coords: [number, number] = [region.center_lat, region.center_lon];

      const popupContent = `
        <div style="min-width:150px;">
          <h3 style="margin:0 0 8px;font-weight:600;color:#1f2937;">${region.title}</h3>
          ${region.city ? `<p style="margin:4px 0;font-size:12px;color:#6b7280;">Город: ${region.city.title}</p>` : ''}
          <p style="margin:4px 0;font-size:12px;color:#6b7280;">ID: ${region.id}</p>
          <p style="margin:4px 0;font-size:12px;color:#6b7280;">
            Координаты: ${region.center_lat.toFixed(4)}, ${region.center_lon.toFixed(4)}
          </p>
        </div>`;

      const placemark = new ymaps.Placemark(
        coords,
        { balloonContent: popupContent },
        { preset: 'islands#blueCircleDotIcon' }
      );

      placemark.events.add('click', () => {
        if (onRegionSelect) {
          onRegionSelect(region.id);
        }
      });

      map.geoObjects.add(placemark);

      const circle = new ymaps.Circle(
        [coords, serviceRadius],
        {},
        {
          fillColor: '#3b82f633',
          strokeColor: '#3b82f6',
          strokeWidth: 2,
        }
      );

      map.geoObjects.add(circle);
    });
  }, [regions, serviceRadius, onRegionSelect]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedRegionId) return;

    const selectedRegion = regions.find((r) => r.id === selectedRegionId);
    if (selectedRegion) {
      map.setCenter(
        [selectedRegion.center_lat, selectedRegion.center_lon],
        defaultZoom + 2,
        { duration: 500 }
      );
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

  return <div ref={mapContainerRef} className="w-full h-full rounded-lg" />;
}
