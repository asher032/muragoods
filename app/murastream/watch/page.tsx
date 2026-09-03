'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type StreamSource = {
  id: string;
  name: string;
  language?: string;
  kind: 'hls' | 'file';
  uri: string;
  headers: Record<string, string>;
  subtitles: { label: string; file: string }[];
  extractor: string;
};

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);

  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const id = Number(searchParams.get('id'));
  const season = Number(searchParams.get('season')) || 1;
  const episode = Number(searchParams.get('episode')) || 1;

  const [sources, setSources] = useState<StreamSource[]>([]);
  const [activeSource, setActiveSource] = useState<StreamSource | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  // Fetch title info
  useEffect(() => {
    if (!id) return;
    const action = type === 'tv' ? 'tv_details' : 'movie_details';
    fetch(`/api/murastream/tmdb?action=${action}&id=${id}`)
      .then(r => r.json())
      .then(data => setTitle(type === 'tv' ? data.name : data.title))
      .catch(() => setTitle(type === 'tv' ? 'TV Show' : 'Movie'));
  }, [id, type]);

  // Resolve stream sources
  const fetchSources = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        tmdbId: String(id),
        type,
        title: title || '',
      });
      if (type === 'tv') {
        params.set('season', String(season));
        params.set('episode', String(episode));
      }
      const res = await fetch(`/api/murastream/stream?${params}`);
      const data = await res.json();
      if (data.sources?.length > 0) {
        setSources(data.sources);
        setActiveSource(data.first);
      } else {
        setError('No streaming sources found for this title.');
      }
    } catch {
      setError('Failed to load streaming sources.');
    } finally {
      setLoading(false);
    }
  }, [id, type, season, episode, title]);

  useEffect(() => { if (id) fetchSources(); }, [id, fetchSources]);

  // Load video when source changes
  useEffect(() => {
    if (!activeSource?.uri || !videoRef.current) return;
    const video = videoRef.current;
    const uri = activeSource.uri;

    // Destroy previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (activeSource.kind === 'hls' || uri.includes('.m3u8')) {
      // Use hls.js for HLS streams
      import('hls.js').then((HlsModule) => {
        const Hls = HlsModule.default;
        if (Hls && Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(uri);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (...args: unknown[]) => {
            const data = args[1] as { fatal?: boolean } | undefined;
            if (data?.fatal) {
              console.error('HLS fatal error:', data);
              setError('Playback error. Try another source.');
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          video.src = uri;
          video.play().catch(() => {});
        }
      });
    } else {
      // Direct MP4/other file
      video.src = uri;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeSource]);

  if (!id) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: '#666' }}>No content selected.</p>
        <Link href="/murastream" style={{ color: 'var(--mario-yellow)' }}>← Browse MuraStream</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: 'rgba(15,15,26,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => router.back()} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
            padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ccc',
          }}>← Back</button>
          <Link href="/murastream" style={{
            fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-yellow)', textDecoration: 'none',
          }}>🎬 MuraStream</Link>
        </div>
        <p style={{
          fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#fff', margin: 0,
          maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}{type === 'tv' && ` — S${season} E${episode}`}
        </p>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setShowSourcePicker(!showSourcePicker)} style={{
            background: 'rgba(255,214,10,0.15)', border: '1px solid var(--mario-yellow)', borderRadius: '6px',
            padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '7px', color: 'var(--mario-yellow)',
          }}>⚡ Sources ({sources.length})</button>
          <button onClick={() => {
            const el = videoRef.current;
            if (el?.requestFullscreen) el.requestFullscreen();
          }} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
            padding: '6px 10px', cursor: 'pointer', color: '#ccc', fontSize: '12px',
          }}>⛶</button>
        </div>
      </div>

      {/* Player */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loading ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '12px',
          }}>
            <div className="custom-loader" />
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#666' }}>
              Resolving stream sources...
            </p>
          </div>
        ) : error ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '12px', padding: '24px',
          }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ff6b6b', textAlign: 'center' }}>
              {error}
            </p>
            <button onClick={fetchSources} style={{
              background: 'rgba(255,214,10,0.15)', border: '1px solid var(--mario-yellow)', borderRadius: '8px',
              padding: '8px 16px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-yellow)',
            }}>↻ Retry</button>
            <Link href="/murastream" style={{
              fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#888', textDecoration: 'none',
            }}>← Back to MuraStream</Link>
          </div>
        ) : activeSource ? (
          <video
            ref={videoRef}
            controls
            autoPlay
            style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 120px)', background: '#000' }}
          />
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '12px',
          }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666' }}>
              No streaming source available.
            </p>
            <Link href="/murastream" style={{
              fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-yellow)', textDecoration: 'none',
            }}>← Back to MuraStream</Link>
          </div>
        )}
      </div>

      {/* Source picker overlay */}
      {showSourcePicker && (
        <div style={{
          position: 'absolute', bottom: '60px', left: 0, right: 0,
          background: 'rgba(10,10,24,0.95)', borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '12px', maxHeight: '200px', overflowY: 'auto', zIndex: 10,
        }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#666', margin: '0 0 8px' }}>
            SELECT SOURCE ({sources.length} available)
          </p>
          {sources.map(src => (
            <button key={src.id} onClick={() => {
              setActiveSource(src);
              setShowSourcePicker(false);
            }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 12px', marginBottom: '4px',
              background: activeSource?.id === src.id ? 'rgba(255,214,10,0.15)' : 'rgba(255,255,255,0.05)',
              border: activeSource?.id === src.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px', cursor: 'pointer',
              fontFamily: 'var(--font-arcade)', fontSize: '7px',
              color: activeSource?.id === src.id ? 'var(--mario-yellow)' : '#ccc',
            }}>
              {src.name} {src.language ? `(${src.language})` : ''} — {src.kind.toUpperCase()}
              {src.subtitles.length > 0 && ` • ${src.subtitles.length} subs`}
            </button>
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div style={{
        background: 'rgba(15,15,26,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#666' }}>SOURCE:</span>
        {sources.slice(0, 5).map(src => (
          <button key={src.id} onClick={() => setActiveSource(src)} style={{
            padding: '3px 8px', borderRadius: '6px',
            border: activeSource?.id === src.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
            background: activeSource?.id === src.id ? 'rgba(255,214,10,0.15)' : 'transparent',
            color: activeSource?.id === src.id ? 'var(--mario-yellow)' : '#888',
            fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer',
          }}>{src.name.split(' (')[0]}</button>
        ))}
        {sources.length > 5 && (
          <button onClick={() => setShowSourcePicker(true)} style={{
            padding: '3px 8px', borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            color: '#888', fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer',
          }}>+{sources.length - 5} more</button>
        )}

        {/* TV episode navigation */}
        {type === 'tv' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <button onClick={() => {
              if (episode > 1) {
                const params = new URLSearchParams({ type, id: String(id), season: String(season), episode: String(episode - 1) });
                router.push(`/murastream/watch?${params.toString()}`);
              }
            }} disabled={episode <= 1} style={{
              padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
              background: episode <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,214,10,0.15)',
              color: episode <= 1 ? '#444' : 'var(--mario-yellow)',
              fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: episode <= 1 ? 'default' : 'pointer',
            }}>← Prev</button>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#888' }}>S{season}E{episode}</span>
            <button onClick={() => {
              const params = new URLSearchParams({ type, id: String(id), season: String(season), episode: String(episode + 1) });
              router.push(`/murastream/watch?${params.toString()}`);
            }} style={{
              padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,214,10,0.15)', color: 'var(--mario-yellow)',
              fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer',
            }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666',
      }}>Loading player...</div>
    }>
      <WatchContent />
    </Suspense>
  );
}
