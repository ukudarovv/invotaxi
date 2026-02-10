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
  onMarkerPositionChange
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(
    markerPosition || null
  );

  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map only once
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView(center, zoom);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapInstanceRef.current);
    }

    // Update map view if center changes
    if (mapInstanceRef.current && center) {
      mapInstanceRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const position = markerPosition || center;
    
    // Remove old marker if exists
    if (markerRef.current) {
      mapInstanceRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }

    // Add new marker
    if (position) {
      const marker = L.marker(position, {
        draggable: draggable
      }).addTo(mapInstanceRef.current);
      
      if (popupContent) {
        marker.bindPopup(popupContent);
      }

      // Handle marker drag
      if (draggable && onMarkerPositionChange) {
        marker.on('dragend', (e) => {
          const newPos = marker.getLatLng();
          const newPosition: [number, number] = [newPos.lat, newPos.lng];
          setCurrentPosition(newPosition);
          onMarkerPositionChange(newPos.lat, newPos.lng);
        });
      }

      markerRef.current = marker;
      setCurrentPosition(position);
    }

    // Clean up marker on unmount
    return () => {
      if (markerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    };
  }, [markerPosition, popupContent, draggable, onMarkerPositionChange, center]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}
