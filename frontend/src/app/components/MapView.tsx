import { useEffect, useRef } from "react";

interface MapViewProps {
  center: [number, number];
  zoom?: number;
  markerPosition?: [number, number];
  popupContent?: string;
  draggable?: boolean;
  onMarkerPositionChange?: (lat: number, lon: number) => void;
}

export function MapView({
  center,
  zoom = 13,
  markerPosition,
  popupContent,
  draggable = false,
  onMarkerPositionChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ymaps.Map | null>(null);
  const placemarkRef = useRef<ymaps.Placemark | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    ymaps.ready(() => {
      if (destroyed || !containerRef.current) return;

      const map = new ymaps.Map(containerRef.current, {
        center,
        zoom,
        controls: ["zoomControl"],
      });
      mapRef.current = map;

      const position = markerPosition || center;

      const placemark = new ymaps.Placemark(
        position,
        {
          balloonContent: popupContent || "",
        },
        {
          draggable,
          preset: "islands#blueDotIcon",
        }
      );

      if (draggable && onMarkerPositionChange) {
        placemark.events.add("dragend", () => {
          const coords = placemark.geometry.getCoordinates();
          onMarkerPositionChange(coords[0], coords[1]);
        });
      }

      map.geoObjects.add(placemark);
      placemarkRef.current = placemark;
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
      placemarkRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setCenter(center, zoom);
  }, [center, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const placemark = placemarkRef.current;
    if (!map || !placemark) return;

    const position = markerPosition || center;
    placemark.geometry.setCoordinates(position);

    placemark.properties.set("balloonContent", popupContent || "");
    placemark.options.set("draggable", draggable);
  }, [markerPosition, popupContent, draggable, center]);

  return <div ref={containerRef} className="w-full h-full rounded-lg" />;
}
