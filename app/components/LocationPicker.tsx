'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationPickerProps {
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
  initialLat?: number;
  initialLng?: number;
}

export default function LocationPicker({ onLocationSelect, initialLat = 13.1550, initialLng = 123.7450 }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const daragaLegazpiBounds = [
      [13.1400, 123.7200],
      [13.1800, 123.7800],
    ] as [[number, number], [number, number]];

    const map = L.map(mapRef.current, {
      center: [initialLat, initialLng],
      zoom: 14,
      maxBounds: daragaLegazpiBounds,
      minZoom: 13,
      maxZoom: 18,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'custom-pin',
      html: `<div style="
        width: 40px;
        height: 40px;
        background: #E60012;
        border: 4px solid #000;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 8px rgba(0,0,0,0.4);
      ">
        <div style="
          width: 16px;
          height: 16px;
          background: #FFD700;
          border: 2px solid #000;
          border-radius: 50%;
        "></div>
      </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    const marker = L.marker([initialLat, initialLng], { icon: pinIcon, draggable: true }).addTo(map);
    markerRef.current = marker;

    const updateMarker = (lat: number, lng: number) => {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], 16);
      if (onLocationSelect) {
        onLocationSelect(lat, lng, `DELIVERY PIN: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
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
