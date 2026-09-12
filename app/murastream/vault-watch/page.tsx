'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VAULT_ITEMS } from '../data/vault';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';

type Level = { height: number; bitrate: number };

export default function VaultWatchPage() {
  const router = useRouter();
  const { addToHistory } = useMuraStreamStore();

  const item = VAULT_ITEMS.find(v => v.id === new URLSearchParams(window.location.search).get('id'));

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<import('hls.js').default | null>(null);
  const savedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = Auto
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Dynamic import of hls.js (client-only)
  useEffect(() => {
    if (!item || !item.hlsUrl || !videoRef.current) return;
    let cancelled = false;

    (async () => {
      const { default: Hls } = await import('hls.js');
      if (cancelled || !videoRef.current) return;

      const video = videoRef.current;
      if (Hls.isSupported()) {
        const hls = new Hls({ capLevelToPlayerSize: true });
        hlsRef.current = hls;
        hls.loadSource(item.hlsUrl!);
        hls.attachMedia(video);
        hls.on('MANIFEST_PARSED', () => {
          setLoading(false);
          setLevels(
            (hls.levels || [])
              .map((l: { height?: number; bitrate: number }) => ({
                height: l.height || 0,
                bitrate: l.bitrate,
              }))
              .sort((a: Level, b: Level) => b.height - a.height)
          );
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            setError('Stream failed to load. Try the download instead — it always works.');
            setLoading(false);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = item.hlsUrl!;
        setLoading(false);
      } else if (item.mp4Url) {
        video.src = item.mp4Url;
        setLoading(false);
      } else {
        setError('This browser cannot play this stream.');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [item]);

  // Fallback: no HLS → straight MP4
  useEffect(() => {
    if (item && !item.hlsUrl && videoRef.current && item.mp4Url) {
      videoRef.current.src = item.mp4Url;
      setLoading(false);
    }
  }, [item]);

  // Resume saved position
  useEffect(() => {
    if (!item || !videoRef.current) return;
    try {
      const saved = localStorage.getItem(`ms-vault-pos:${item.id}`);
      if (saved && videoRef.current) videoRef.current.currentTime = parseFloat(saved);
    } catch { /* ignore */ }
  }, [item]);

  // Save progress (throttled to every ~5s)
  useEffect(() => {
    if (!item || !duration) return;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.ended) return;
      try {
        localStorage.setItem(`ms-vault-pos:${item.id}`, String(v.currentTime));
        const pct = Math.round((v.currentTime / (v.duration || duration)) * 100);
        if (!savedRef.current && pct > 2) {
          addToHistory({
            id: item.tmdbId,
            mediaType: 'movie',
            title: item.title,
            posterPath: null,
            progress: pct,
          });
          savedRef.current = true;
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(t);
  }, [item, duration, addToHistory]);

  if (!item) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: '#A0A0A0' }}>Film not found.</p>
      </div>
    );
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const pickLevel = (idx: number) => {
    setCurrentLevel(idx);
    if (hlsRef.current) hlsRef.current.currentLevel = idx;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#050505' }}>
      {/* Player area */}
      <div style={{ position: 'relative', background: '#000' }}>
        <video
          ref={videoRef}
          controls
          playsInline
          style={{ width: '100%', maxHeight: '72vh', background: '#000', display: 'block' }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={e => {
            setProgress(e.currentTarget.currentTime);
            setDuration(e.currentTarget.duration || 0);
          }}
        />
        {loading && !error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(0,0,0,0.6)', color: '#fff',
            fontSize: 14, fontFamily: 'var(--font-arcade)',
          }}>
            LOADING STREAM…
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 14, background: 'rgba(0,0,0,0.85)',
            padding: 24, textAlign: 'center',
          }}>
            <p style={{ color: '#E5E5E5', fontSize: 14, margin: 0 }}>{error}</p>
            {item.mp4Url && (
              <a href={item.mp4Url} download target="_blank" rel="noreferrer"
                style={{ background: '#B85CFF', color: '#fff', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
                ⬇ Download instead
              </a>
            )}
          </div>
        )}
        {/* Back */}
        <button
          onClick={() => router.back()}
          style={{
            position: 'absolute', top: 14, left: 14, background: 'rgba(0,0,0,0.55)',
            color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
            padding: '8px 14px', cursor: 'pointer', fontSize: 13,
          }}
        >
          ← Back
        </button>
      </div>

      {/* Controls / info */}
      <div style={{ padding: '20px 32px', maxWidth: 1000 }}>
        <h1 style={{ color: '#fff', fontSize: 22, margin: '0 0 6px', fontWeight: 700 }}>{item.title}</h1>
        <div style={{ color: '#A0A0A0', fontSize: 13, marginBottom: 18 }}>
          {item.year} · {item.runtime} · {playing ? '▶ Playing' : progress > 0 ? `⏸ ${fmt(progress)} / ${fmt(duration)}` : 'Ready'}
        </div>

        {/* Quality selector (HLS adaptive) */}
        {levels.length > 1 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: '#888', fontSize: 11, letterSpacing: '0.1em', marginBottom: 8, fontWeight: 700 }}>
              QUALITY
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => pickLevel(-1)}
                style={{
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                  background: currentLevel === -1 ? '#B85CFF' : '#171717',
                  color: currentLevel === -1 ? '#fff' : '#A0A0A0',
                  border: '1px solid ' + (currentLevel === -1 ? '#B85CFF' : '#2A2A2A'),
                }}
              >
                Auto
              </button>
              {levels.map((l, i) => (
                <button
                  key={l.bitrate}
                  onClick={() => pickLevel(levels.indexOf(l))}
                  style={{
                    padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                    background: currentLevel === levels.indexOf(l) ? '#B85CFF' : '#171717',
                    color: currentLevel === levels.indexOf(l) ? '#fff' : '#A0A0A0',
                    border: '1px solid ' + (currentLevel === levels.indexOf(l) ? '#B85CFF' : '#2A2A2A'),
                  }}
                >
                  {l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`}
                </button>
              ))}
            </div>
          </div>
        )}

        {item.mp4Url && (
          <a href={item.mp4Url} download target="_blank" rel="noreferrer"
            style={{
              display: 'inline-block', background: 'transparent', color: '#fff',
              border: '1px solid #3A3A3A', borderRadius: 10, padding: '11px 22px',
              fontSize: 14, textDecoration: 'none', marginBottom: 14,
            }}>
            ⬇ Download {item.downloadSize}
          </a>
        )}
        <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
          {item.license} licensed — stream it, download it, share it. Yours.
        </p>
      </div>
    </div>
  );
}
