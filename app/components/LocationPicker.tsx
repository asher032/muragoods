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
  const markerRef = useRef<L.Marker | null>(null);
  const [selected, setSelected] = useState<{ lat: number; lng: number; address: string; placeName?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');

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
        background: #E52521;
        border: 3px solid #D4AF37;
        border-radius: 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);
      ">
        <div style="
          width: 18px;
          height: 18px;
          background: #D4AF37;
          border: 2px solid #B8960F;
          border-radius: 0;
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

    const fetchPlaceName = async (lat: number, lng: number) => {
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
        if (onLocationSelect) {
          onLocationSelect(lat, lng, placeName);
        }
      } catch {
        const address = `DELIVERY PIN: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        setSelected({ lat, lng, address });
        if (onLocationSelect) {
          onLocationSelect(lat, lng, address);
        }
      } finally {
        setLoading(false);
      }
    };

    const updateSelection = (lat: number, lng: number) => {
      marker.setLatLng([lat, lng]);
      fetchPlaceName(lat, lng);
    };

    map.on('click', (e: L.LeafletMouseEvent) => {
      updateSelection(e.latlng.lat, e.latlng.lng);
    });

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      updateSelection(pos.lat, pos.lng);
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

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser');
      return;
    }

    setGeoLoading(true);
    setGeoError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        if (markerRef.current && mapRef.current) {
          markerRef.current.setLatLng([latitude, longitude]);
          mapRef.current.setView([latitude, longitude], 14);
        }
        const fetchPlaceName = async (lat: number, lng: number) => {
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
            if (onLocationSelect) {
              onLocationSelect(lat, lng, placeName);
            }
          } catch {
            const address = `DELIVERY PIN: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            setSelected({ lat, lng, address });
            if (onLocationSelect) {
              onLocationSelect(lat, lng, address);
            }
          } finally {
            setLoading(false);
          }
        };
        await fetchPlaceName(latitude, longitude);
        setGeoLoading(false);
      },
      () => {
        setGeoError('Unable to retrieve your location. Please tap the map instead.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleReset = () => {
    setSelected(null);
    setGeoError('');
    if (onLocationSelect) {
      onLocationSelect(initialLat, initialLng, '');
    }
    if (mapRef.current && markerRef.current) {
      mapRef.current.setView([initialLat, initialLng], 14);
      markerRef.current.setLatLng([initialLat, initialLng]);
    }
  };

  return (
    <div className="w-full">
      {!selected ? (
        <div className="w-full">
          <div
            ref={containerRef}
            className="w-full"
            style={{ height: 'clamp(260px, 50vh, 420px)', border: '2px solid var(--gold)' }}
          />
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={geoLoading}
              className="deco-btn w-full disabled:opacity-50"
            >
              {geoLoading ? 'Getting your location...' : '📍 Use my current location'}
            </button>
            {geoError && (
              <p className="text-xs text-[var(--crimson)] border border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-2">
                {geoError}
              </p>
            )}
            <p className="text-xs text-[var(--pewter)] text-center">Or tap the map to place a pin</p>
          </div>
        </div>
      ) : (
        <div className="border-2 border-[var(--gold)] bg-[var(--charcoal-light)] p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p
                className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-1"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Selected Location
              </p>
              {loading ? (
                <p className="text-base text-[var(--cream)]">Finding place name...</p>
              ) : (
                <>
                  <p className="text-base text-[var(--cream)] break-all">{selected.placeName || selected.address}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="deco-badge deco-badge-gold" style={{ fontSize: '7px' }}>
                      LAT: {selected.lat.toFixed(4)}
                    </span>
                    <span className="deco-badge deco-badge-gold" style={{ fontSize: '7px' }}>
                      LNG: {selected.lng.toFixed(4)}
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="deco-btn deco-btn-sm deco-btn-crimson shrink-0"
              style={{ minHeight: '36px', padding: '6px 12px' }}
            >
              Change
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
