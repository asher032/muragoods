'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// AES-GCM key from Flickv4's StreamflixService (must match server)
const STREAM_KEY_HEX = '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f';

interface ResolvedSource {
  id: string;
  name: string;
  language?: string;
  kind: 'hls' | 'file';
  uri: string;
  subtitles: { label: string; file: string }[];
}

// ─── Client-side AES-GCM decryption ───────────────────────

function base64ToBytes(payload: string, urlSafe = false): Uint8Array {
  const normalized = urlSafe ? payload.replace(/-/g, '+').replace(/_/g, '/') : payload;
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

async function decryptAesGcm(payload: string): Promise<string | null> {
  try {
    const packed = base64ToBytes(payload, true);
    if (packed.length < 28) return null;
    const nonce = packed.slice(0, 12);
    const ciphertextAndTag = packed.slice(12);
    const keyBytes = hexToBytes(STREAM_KEY_HEX);
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, ciphertextAndTag.buffer as ArrayBuffer);
    const url = new TextDecoder().decode(plain).trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

function slugId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);

  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const id = Number(searchParams.get('id'));
  const season = Number(searchParams.get('season')) || 1;
  const episode = Number(searchParams.get('episode')) || 1;

  const [sources, setSources] = useState<ResolvedSource[]>([]);
  const [activeSource, setActiveSource] = useState<ResolvedSource | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [decrypting, setDecrypting] = useState(false);
  const [error, setError] = useState('');
  const [showSources, setShowSources] = useState(false);

  // Fetch title from TMDB
  useEffect(() => {
    if (!id) return;
    const action = type === 'tv' ? 'tv_details' : 'movie_details';
    fetch(`/api/murastream/tmdb?action=${action}&id=${id}`)
      .then(r => r.json())
      .then(data => setTitle(type === 'tv' ? data.name : data.title))
      .catch(() => setTitle(type === 'tv' ? 'TV Show' : 'Movie'));
  }, [id, type]);

  // Resolve and decrypt streams
  const fetchSources = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    setDecrypting(true);
    try {
      const params = new URLSearchParams({ tmdbId: String(id), type });
      if (type === 'tv') { params.set('season', String(season)); params.set('episode', String(episode)); }
      const res = await fetch(`/api/murastream/stream?${params}`);
      const data = await res.json();

      if (!data.encrypted || typeof data.encrypted !== 'object' || Object.keys(data.encrypted).length === 0) {
        setError(data.error || 'No streams found for this title.');
        setDecrypting(false);
        setLoading(false);
        return;
      }

      // Decrypt all sources in parallel
      const entries = Object.entries(data.encrypted) as [string, { url?: string | null; language?: string | null; flag?: string | null }][];
      const decrypted: ResolvedSource[] = [];

      await Promise.all(entries.map(async ([name, info]) => {
        const packed = (info?.url || '').trim();
        if (!packed) return;
        const url = await decryptAesGcm(packed);
        if (!url) return;
        const kind = url.includes('.m3u8') ? 'hls' : 'file';
        decrypted.push({
          id: `vidrock-${slugId(name)}`,
          name: `${name} (VidRock)`,
          language: info.language || undefined,
          kind,
          uri: url,
          subtitles: [],
        });
      }));

      if (decrypted.length === 0) {
        setError('Could not decrypt any streams. Try another title.');
      } else {
        // Sort English first
        decrypted.sort((a, b) => {
          const aEn = a.language?.toLowerCase() === 'english' ? 1 : 0;
          const bEn = b.language?.toLowerCase() === 'english' ? 1 : 0;
          return bEn - aEn;
        });
        setSources(decrypted);
        setActiveSource(decrypted[0]);
      }
    } catch {
      setError('Failed to load streams.');
    } finally {
      setLoading(false);
      setDecrypting(false);
    }
  }, [id, type, season, episode]);

  useEffect(() => { if (id) fetchSources(); }, [id, fetchSources]);

  // Play video when source changes
  useEffect(() => {
    if (!activeSource?.uri || !videoRef.current) return;
    const video = videoRef.current;
    const uri = activeSource.uri;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (activeSource.kind === 'hls' || uri.includes('.m3u8')) {
      import('hls.js').then(mod => {
        const Hls = mod.default;
        if (Hls && Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(uri);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
          hls.on(Hls.Events.ERROR, (...args: unknown[]) => {
            const d = args[1] as { fatal?: boolean } | undefined;
            if (d?.fatal) setError('Playback error. Try another source.');
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = uri;
          video.play().catch(() => {});
        }
      });
    } else {
      video.src = uri;
      video.play().catch(() => {});
    }

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [activeSource]);

  if (!id) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: '#666' }}>No content selected.</p>
        <Link href="/murastream" style={{ color: 'var(--mario-yellow)' }}>← Browse</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(15,15,26,0.95)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ccc' }}>← Back</button>
          <Link href="/murastream" style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-yellow)', textDecoration: 'none' }}>🎬 MuraStream</Link>
        </div>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#fff', margin: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}{type === 'tv' && ` — S${season}E${episode}`}
        </p>
        <button onClick={() => setShowSources(!showSources)} style={{ background: 'rgba(255,214,10,0.15)', border: '1px solid var(--mario-yellow)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '7px', color: 'var(--mario-yellow)' }}>
          ⚡ {sources.length > 0 ? `${sources.length} sources` : 'Sources'}
        </button>
      </div>

      {/* Player */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <div className="custom-loader" />
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#666' }}>
              {decrypting ? 'Decrypting streams...' : 'Finding streams...'}
            </p>
          </div>
        ) : error ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ff6b6b', textAlign: 'center', padding: '0 24px' }}>{error}</p>
            <button onClick={fetchSources} style={{ background: 'rgba(255,214,10,0.15)', border: '1px solid var(--mario-yellow)', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-yellow)' }}>↻ Retry</button>
          </div>
        ) : (
          <video ref={videoRef} controls autoPlay style={{ width: '100%', height: '100%', background: '#000' }} />
        )}
      </div>

      {/* Source picker overlay */}
      {showSources && (
        <div style={{ position: 'absolute', bottom: '50px', left: 0, right: 0, background: 'rgba(10,10,24,0.95)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '12px', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#666', margin: '0 0 8px' }}>SELECT SOURCE ({sources.length})</p>
          {sources.map(s => (
            <button key={s.id} onClick={() => { setActiveSource(s); setShowSources(false); }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: '4px',
              background: activeSource?.id === s.id ? 'rgba(255,214,10,0.15)' : 'rgba(255,255,255,0.05)',
              border: activeSource?.id === s.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '7px',
              color: activeSource?.id === s.id ? 'var(--mario-yellow)' : '#ccc',
            }}>
              {s.name} — {s.kind.toUpperCase()}{s.language ? ` (${s.language})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ background: 'rgba(15,15,26,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {sources.slice(0, 4).map(s => (
          <button key={s.id} onClick={() => setActiveSource(s)} style={{
            padding: '3px 8px', borderRadius: '6px',
            border: activeSource?.id === s.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
            background: activeSource?.id === s.id ? 'rgba(255,214,10,0.15)' : 'transparent',
            color: activeSource?.id === s.id ? 'var(--mario-yellow)' : '#888',
            fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer',
          }}>
            {s.name.split(' (')[0]}
          </button>
        ))}
        {sources.length > 4 && (
          <button onClick={() => setShowSources(true)} style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#888', fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer' }}>
            +{sources.length - 4} more
          </button>
        )}
        {type === 'tv' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <button onClick={() => { if (episode > 1) router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode - 1}`); }} disabled={episode <= 1} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: episode <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,214,10,0.15)', color: episode <= 1 ? '#444' : 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: episode <= 1 ? 'default' : 'pointer' }}>← Prev</button>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#888' }}>S{season}E{episode}</span>
            <button onClick={() => router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}`)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,214,10,0.15)', color: 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer' }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666' }}>Loading...</div>}>
      <WatchContent />
    </Suspense>
  );
}
