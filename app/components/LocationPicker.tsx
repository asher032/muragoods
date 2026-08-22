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
  const [pending, setPending] = useState<{ lat: number; lng: number; address: string; placeName?: string } | null>(null);
  const [confirmed, setConfirmed] = useState<{ lat: number; lng: number; address: string; placeName?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapVisible, setMapVisible] = useState(true);

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
      const placeName = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setPending({ lat, lng, address: placeName, placeName });
    } catch {
      setPending({ lat, lng, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
      zoom: 15,
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 19,
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
          mapRef.current.setView([latitude, longitude], 17, { animate: true });
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

  const handleConfirmAddress = () => {
    if (!pending) return;
    setConfirmed(pending);
    setMapVisible(false);
    onLocationSelect?.(pending.lat, pending.lng, pending.placeName || pending.address);
  };

  const handleChange = () => {
    setConfirmed(null);
    setPending(null);
    setMapVisible(true);
    onLocationSelect?.(0, 0, '');
    if (mapRef.current && markerRef.current) {
      mapRef.current.setView([initialLat, initialLng], 15);
      markerRef.current.setLatLng([initialLat, initialLng]);
    }
    // Re-invalidate map size after showing
    setTimeout(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    }, 100);
  };

  // ─── Confirmed State — only show the card, no map ──────
  if (confirmed) {
    return (
      <div className="border-2 border-[var(--gold)] bg-[var(--charcoal-light)] p-5 rounded-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[var(--emerald-bright)] uppercase tracking-[0.15em] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
              ✓ Location Confirmed
            </p>
            <p className="text-sm text-[var(--cream)] leading-relaxed">{confirmed.placeName || confirmed.address}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="deco-badge deco-badge-gold rounded-lg" style={{ fontSize: '8px' }}>LAT: {confirmed.lat.toFixed(6)}</span>
              <span className="deco-badge deco-badge-gold rounded-lg" style={{ fontSize: '8px' }}>LNG: {confirmed.lng.toFixed(6)}</span>
            </div>
          </div>
          <button type="button" onClick={handleChange} className="deco-btn deco-btn-sm deco-btn-crimson shrink-0 rounded-xl" style={{ minHeight: '36px', padding: '8px 16px' }}>Change</button>
        </div>
      </div>
    );
  }

  // ─── Map + Confirmation Flow ────────────────────────────
  return (
    <div className="w-full relative">
      {/* Map Container — hidden when confirmed */}
      <div style={{ display: mapVisible ? 'block' : 'none' }}>
        <div
          ref={containerRef}
          className="w-full rounded-xl border-2 border-[var(--gold)] overflow-hidden"
          style={{ height: '380px', minHeight: '300px', background: '#1a1a1a' }}
        />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--charcoal)] rounded-xl border-2 border-[var(--gold)]" style={{ height: '380px', zIndex: 10 }}>
            <p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>LOADING MAP...</p>
          </div>
        )}
      </div>

      {/* Pending Address Preview — must confirm */}
      {pending && (
        <div className="mt-3 border-2 border-[var(--gold-bright)] bg-[rgba(212,175,55,0.08)] p-4 rounded-xl">
          <p className="text-[10px] text-[var(--gold)] uppercase mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
            📍 Confirm Your Address
          </p>
          {loading ? (
            <p className="text-sm text-[var(--cream)] animate-pulse">Finding address...</p>
          ) : (
            <>
              <p className="text-sm text-[var(--cream)] leading-relaxed">{pending.placeName || pending.address}</p>
              <div className="mt-3 flex gap-3">
                <button type="button" onClick={handleConfirmAddress} className="deco-btn deco-btn-sm deco-btn-gold rounded-xl flex-1">
                  ✓ Confirm Address
                </button>
                <button type="button" onClick={() => setPending(null)} className="deco-btn deco-btn-sm deco-btn-dark rounded-xl flex-1">
                  ✖ Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" onClick={handleUseMyLocation} disabled={geoLoading} className="deco-btn w-full rounded-xl disabled:opacity-50">
          {geoLoading ? '⏳ Getting location...' : '📍 Use my current location'}
        </button>
        {geoError && <p className="text-xs text-[var(--crimson)] border border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-2 rounded-lg">{geoError}</p>}
        <p className="text-xs text-[var(--pewter)] text-center">Tap the map or drag the pin to set your delivery location, then confirm the address.</p>
      </div>
    </div>
  );
}
