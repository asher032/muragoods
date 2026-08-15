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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'custom-pin',
      html: `<div style="
        width: 44px;
        height: 44px;
        background: #E60012;
        border: 4px solid #000;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      ">
        <div style="
          width: 18px;
          height: 18px;
          background: #FFD700;
          border: 2px solid #000;
          border-radius: 50%;
        "></div>
      </div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 44],
    });

    const marker = L.marker([initialLat, initialLng], {
      icon: pinIcon,
      draggable: true,
      autoPan: false,
    }).addTo(map);

    const updateMarker = (lat: number, lng: number) => {
      if (!marker || !map) return;
      marker.setLatLng([lat, lng]);
      if (onLocationSelect) {
        onLocationSelect(lat, lng, `DELIVERY PIN: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    };

    map.on('click', (e: L.LeafletMouseEvent) => {
      updateMarker(e.latlng.lat, e.latlng.lng);
    });

    marker.on('dragend', () => {
      if (!marker) return;
      const pos = marker.getLatLng();
      updateMarker(pos.lat, pos.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.off('click');
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [initialLat, initialLng, onLocationSelect]);

  return (
    <div
      ref={containerRef}
      style={{ height: '400px', width: '100%', borderRadius: '12px', border: '4px solid #000' }}
    />
  );
}
