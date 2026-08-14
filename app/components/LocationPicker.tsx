'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationPickerProps {
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
  initialLat?: number;
  initialLng?: number;
}

export default function LocationPicker({ onLocationSelect, initialLat = 13.1370, initialLng = 123.7340 }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([initialLat, initialLng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
    markerRef.current = marker;

    const updateMarker = (lat: number, lng: number) => {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], 16);
      if (onLocationSelect) {
        onLocationSelect(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    };

    map.on('click', (e: L.LeafletMouseEvent) => {
      updateMarker(e.latlng.lat, e.latlng.lng);
    });

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      updateMarker(pos.lat, pos.lng);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [initialLat, initialLng, onLocationSelect]);

  return (
    <div
      ref={mapRef}
      style={{ height: '400px', width: '100%', borderRadius: '12px', border: '4px solid #000', zIndex: 1 }}
    />
  );
}
