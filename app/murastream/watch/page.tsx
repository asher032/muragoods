'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type SourceConfig = { id: string; label: string; url: string };
type ConfigData = {
  sources: Record<string, SourceConfig>;
  active: SourceConfig;
  defaultSource: string;
};

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const id = Number(searchParams.get('id'));
  const sourceId = searchParams.get('source') || 'nexstream';
  const season = Number(searchParams.get('season')) || 1;
  const episode = Number(searchParams.get('episode')) || 1;

  const [config, setConfig] = useState<ConfigData | null>(null);
  const [activeSource, setActiveSource] = useState(sourceId);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch streaming config from API
  const fetchConfig = useCallback(async (src: string) => {
    try {
      const params = new URLSearchParams({ type, id: String(id), source: src });
      if (type === 'tv') {
        params.set('season', String(season));
        params.set('episode', String(episode));
      }
      const res = await fetch(`/api/murastream/config?${params}`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Config fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [type, id, season, episode]);

  // Fetch title info
  useEffect(() => {
    if (!id) return;
    const action = type === 'tv' ? 'tv_details' : 'movie_details';
    fetch(`/api/murastream/tmdb?action=${action}&id=${id}`)
      .then(r => r.json())
      .then(data => setTitle(type === 'tv' ? data.name : data.title))
      .catch(() => setTitle(type === 'tv' ? 'TV Show' : 'Movie'));
  }, [id, type]);

  // Fetch config when source changes
  useEffect(() => { if (id) fetchConfig(activeSource); }, [id, activeSource, fetchConfig]);

  const updateSource = (newSource: string) => {
    setActiveSource(newSource);
    const params = new URLSearchParams({ type, id: String(id), source: newSource });
    if (type === 'tv') {
      params.set('season', String(season));
      params.set('episode', String(episode));
    }
    router.push(`/murastream/watch?${params.toString()}`);
  };

  const goNextEpisode = () => {
    const params = new URLSearchParams({ type, id: String(id), source: activeSource, season: String(season), episode: String(episode + 1) });
    router.push(`/murastream/watch?${params.toString()}`);
  };

  const goPrevEpisode = () => {
    if (episode <= 1) return;
    const params = new URLSearchParams({ type, id: String(id), source: activeSource, season: String(season), episode: String(episode - 1) });
    router.push(`/murastream/watch?${params.toString()}`);
  };

  if (!id) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: '#666' }}>No content selected.</p>
        <Link href="/murastream" style={{ color: 'var(--mario-yellow)' }}>← Browse MuraStream</Link>
      </div>
    );
  }

  const playerUrl = config?.active?.url || '';
  const sourceList = config ? Object.values(config.sources) : [];

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
        <button onClick={() => {
          const el = document.getElementById('player-frame');
          if (el?.requestFullscreen) el.requestFullscreen();
        }} style={{
          background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
          padding: '6px 10px', cursor: 'pointer', color: '#ccc', fontSize: '12px',
        }}>⛶</button>
      </div>

      {/* Player */}
      <div id="player-frame" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loading ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666',
          }}>Loading player...</div>
        ) : playerUrl ? (
          <iframe
            src={playerUrl}
            title="Player"
            style={{ width: '100%', flex: 1, minHeight: 'calc(100vh - 120px)', border: 'none' }}
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px',
          }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666' }}>
              No streaming source available for this title.
            </p>
            <Link href="/murastream" style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-yellow)', textDecoration: 'none' }}>
              ← Back to MuraStream
            </Link>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{
        background: 'rgba(15,15,26,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 12px',
      }}>
        {/* Source selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#666' }}>SOURCE:</span>
          {sourceList.map(src => (
            <button key={src.id} onClick={() => updateSource(src.id)} style={{
              padding: '3px 8px', borderRadius: '6px',
              border: activeSource === src.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
              background: activeSource === src.id ? 'rgba(255,214,10,0.15)' : 'transparent',
              color: activeSource === src.id ? 'var(--mario-yellow)' : '#888',
              fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer',
            }}>{src.label}</button>
          ))}
        </div>

        {/* TV episode navigation */}
        {type === 'tv' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={goPrevEpisode} disabled={episode <= 1} style={{
              padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
              background: episode <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,214,10,0.15)',
              color: episode <= 1 ? '#444' : 'var(--mario-yellow)',
              fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: episode <= 1 ? 'default' : 'pointer',
            }}>← Prev Ep</button>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#888' }}>S{season} • E{episode}</span>
            <button onClick={goNextEpisode} style={{
              padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,214,10,0.15)', color: 'var(--mario-yellow)',
              fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer',
            }}>Next Ep →</button>
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
