'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  const [selected, setSelected] = useState<{ lat: number; lng: number; address: string; placeName?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [mapReady, setMapReady] = useState(false);

  const createPinIcon = useCallback(() => {
    return L.divIcon({
      className: 'muragoods-pin',
      html: `<div style="width:40px;height:40px;background:#E52521;border:3px solid #D4AF37;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(212,175,55,0.5);transform:translate(-50%,-100%)">
        <div style="width:16px;height:16px;background:#D4AF37;border:2px solid #B8960F;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;color:#0A0A0A;font-weight:bold">M</div>
      </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });
  }, []);

  const fetchPlaceName = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`, {
        headers: { 'User-Agent': 'Muragoods/1.0' },
      });
      if (!res.ok) throw new Error('Geocoding failed');
      const data = await res.json();
      const placeName = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      const address = `DELIVERY PIN: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setSelected({ lat, lng, address, placeName });
      onLocationSelect?.(lat, lng, placeName);
    } catch {
      const address = `DELIVERY PIN: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setSelected({ lat, lng, address });
      onLocationSelect?.(lat, lng, address);
    } finally {
      setLoading(false);
    }
  }, [onLocationSelect]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
      zoom: 15,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([initialLat, initialLng], {
      icon: createPinIcon(),
      draggable: true,
      autoPan: true,
    }).addTo(map);

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      fetchPlaceName(e.latlng.lat, e.latlng.lng);
    };

    const handleMarkerDrag = () => {
      const pos = marker.getLatLng();
      fetchPlaceName(pos.lat, pos.lng);
    };

    map.on('click', handleMapClick);
    marker.on('dragend', handleMarkerDrag);

    mapRef.current = map;
    markerRef.current = marker;

    // Force a resize after a short delay to fix rendering
    setTimeout(() => {
      map.invalidateSize();
      setMapReady(true);
    }, 300);

    return () => {
      map.off('click', handleMapClick);
      marker.off('dragend', handleMarkerDrag);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [initialLat, initialLng, createPinIcon, fetchPlaceName]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation not supported by your browser');
      return;
    }
    setGeoLoading(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        if (markerRef.current && mapRef.current) {
          markerRef.current.setLatLng([latitude, longitude]);
          mapRef.current.setView([latitude, longitude], 16, { animate: true });
        }
        await fetchPlaceName(latitude, longitude);
        setGeoLoading(false);
      },
      () => {
        setGeoError('Location permission denied. Tap the map to place a pin.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleReset = () => {
    setSelected(null);
    setGeoError('');
    onLocationSelect?.(initialLat, initialLng, '');
    if (mapRef.current && markerRef.current) {
      mapRef.current.setView([initialLat, initialLng], 15);
      markerRef.current.setLatLng([initialLat, initialLng]);
    }
  };

  return (
    <div className="w-full">
      {!selected ? (
        <div className="w-full">
          {/* Map Container */}
          <div
            ref={containerRef}
            className="w-full rounded-xl border-2 border-[var(--gold)] overflow-hidden"
            style={{ height: '350px', minHeight: '280px', background: '#1a1a1a' }}
          />
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--charcoal)] rounded-xl border-2 border-[var(--gold)]" style={{ height: '350px' }}>
              <p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>LOADING MAP...</p>
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <button type="button" onClick={handleUseMyLocation} disabled={geoLoading} className="deco-btn w-full rounded-xl disabled:opacity-50">
              {geoLoading ? '⏳ Getting location...' : '📍 Use my current location'}
            </button>
            {geoError && <p className="text-xs text-[var(--crimson)] border border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-2 rounded-lg">{geoError}</p>}
            <p className="text-xs text-[var(--pewter)] text-center">Tap the map or drag the pin to set your delivery location</p>
          </div>
        </div>
      ) : (
        <div className="border-2 border-[var(--gold)] bg-[var(--charcoal-light)] p-4 rounded-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Selected Location</p>
              {loading ? (
                <p className="text-sm text-[var(--cream)]">Finding place name...</p>
              ) : (
                <>
                  <p className="text-sm text-[var(--cream)] break-all leading-relaxed">{selected.placeName || selected.address}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="deco-badge deco-badge-gold rounded-md" style={{ fontSize: '7px' }}>LAT: {selected.lat.toFixed(4)}</span>
                    <span className="deco-badge deco-badge-gold rounded-md" style={{ fontSize: '7px' }}>LNG: {selected.lng.toFixed(4)}</span>
                  </div>
                </>
              )}
            </div>
            <button type="button" onClick={handleReset} className="deco-btn deco-btn-sm deco-btn-crimson shrink-0 rounded-lg" style={{ minHeight: '32px', padding: '6px 12px' }}>Change</button>
          </div>
        </div>
      )}
    </div>
  );
}
