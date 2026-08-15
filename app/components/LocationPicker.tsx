'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let map: L.Map | null = null;
    let marker: L.Marker | null = null;

    try {
      const daragaLegazpiBounds = [
        [13.1400, 123.7200],
        [13.1800, 123.7800],
      ] as [[number, number], [number, number]];

      map = L.map(containerRef.current, {
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

      marker = L.marker([initialLat, initialLng], { icon: pinIcon, draggable: true }).addTo(map);

      const updateMarker = (lat: number, lng: number) => {
        if (!marker || !map) return;
        marker.setLatLng([lat, lng]);
        map.setView([lat, lng], 15, { animate: false });
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
      setReady(true);
    } catch (err) {
      console.error('Map initialization failed:', err);
      if (containerRef.current) {
        containerRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#fee;color:#900;font-weight:bold;padding:20px;text-align:center;">Map failed to load. Please refresh the page.</div>';
      }
    }

    return () => {
      if (map) {
        map.remove();
        mapRef.current = null;
      }
      setReady(false);
    };
  }, [initialLat, initialLng, onLocationSelect]);

  if (!ready) {
    return (
      <div
        ref={containerRef}
        style={{ height: '400px', width: '100%', borderRadius: '12px', border: '4px solid #000', background: '#f3f4f6' }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height: '400px', width: '100%', borderRadius: '12px', border: '4px solid #000' }}
    />
  );
}
