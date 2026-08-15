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
  const [selected, setSelected] = useState<{ lat: number; lng: number; address: string } | null>(null);

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

    const updateSelection = (lat: number, lng: number) => {
      marker.setLatLng([lat, lng]);
      const address = `DELIVERY PIN: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setSelected({ lat, lng, address });
      if (onLocationSelect) {
        onLocationSelect(lat, lng, address);
      }
    };

    map.on('click', (e: L.LeafletMouseEvent) => {
      updateSelection(e.latlng.lat, e.latlng.lng);
    });

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      updateSelection(pos.lat, pos.lng);
    });

    mapRef.current = map;

    return () => {
      map.off('click');
      map.remove();
      mapRef.current = null;
    };
  }, [initialLat, initialLng, onLocationSelect]);

  const handleReset = () => {
    setSelected(null);
    if (onLocationSelect) {
      onLocationSelect(initialLat, initialLng, '');
    }
    if (mapRef.current) {
      mapRef.current.setView([initialLat, initialLng], 14);
    }
  };

  return (
    <div className="w-full">
      {!selected ? (
        <div
          ref={containerRef}
          className="w-full"
          style={{ height: 'clamp(260px, 50vh, 420px)', borderRadius: '12px', border: '4px solid #000' }}
        />
      ) : (
        <div className="rounded-lg border-4 border-black bg-white p-4 sm:p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-rose-500 mb-1">Selected Location</p>
              <p className="text-base sm:text-lg font-black text-black break-all">{selected.address}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
                <span className="rounded border-2 border-black bg-yellow-100 px-2 py-1">LAT: {selected.lat.toFixed(4)}</span>
                <span className="rounded border-2 border-black bg-yellow-100 px-2 py-1">LNG: {selected.lng.toFixed(4)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="shrink-0 rounded-lg border-4 border-black bg-rose-400 px-3 py-2 text-xs font-black text-white hover:bg-rose-500 active:scale-95 transition-transform"
            >
              Change
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
