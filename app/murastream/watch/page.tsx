'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const SOURCES = [
  { id: 'videasy', label: 'Videasy', movieUrl: (id: number) => `https://player.videasy.to/movie/${id}?overlay=true`, tvUrl: (id: number, s: number, e: number) => `https://player.videasy.to/tv/${id}/${s}/${e}?overlay=true` },
  { id: 'vidsrc', label: 'VidSrc', movieUrl: (id: number) => `https://vsembed.su/embed/movie/${id}`, tvUrl: (id: number, s: number, e: number) => `https://vsembed.su/embed/tv/${id}/${s}/${e}` },
  { id: 'vidking', label: 'Vidking', movieUrl: (id: number) => `https://www.vidking.net/embed/movie/${id}?autoPlay=true`, tvUrl: (id: number, s: number, e: number) => `https://www.vidking.net/embed/tv/${id}/${s}/${e}?autoPlay=true` },
];

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const id = Number(searchParams.get('id'));
  const sourceId = searchParams.get('source') || 'videasy';
  const season = Number(searchParams.get('season')) || 1;
  const episode = Number(searchParams.get('episode')) || 1;

  const [activeSource, setActiveSource] = useState(sourceId);
  const [title, setTitle] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fetch title info
  useEffect(() => {
    if (!id) return;
    const action = type === 'tv' ? 'tv_details' : 'movie_details';
    fetch(`/api/murastream/tmdb?action=${action}&id=${id}`)
      .then(r => r.json())
      .then(data => {
        setTitle(type === 'tv' ? data.name : data.title);
      })
      .catch(() => setTitle(type === 'tv' ? 'TV Show' : 'Movie'));
  }, [id, type]);

  const getSourceUrl = () => {
    const src = SOURCES.find(s => s.id === activeSource) || SOURCES[0];
    return type === 'movie' ? src.movieUrl(id) : src.tvUrl(id, season, episode);
  };

  const updateSource = (newSource: string) => {
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

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: 'rgba(15,15,26,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => router.back()} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
            padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-arcade)',
            fontSize: '8px', color: '#ccc',
          }}>← Back</button>
          <Link href="/murastream" style={{
            fontFamily: 'var(--font-arcade)', fontSize: '8px',
            color: 'var(--mario-yellow)', textDecoration: 'none',
          }}>🎬 MuraStream</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p style={{
            fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#fff', margin: 0,
            maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
            {type === 'tv' && ` — S${season} E${episode}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => {
            const el = document.getElementById('player-iframe');
            if (el?.requestFullscreen) el.requestFullscreen();
          }} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
            padding: '6px 10px', cursor: 'pointer', color: '#ccc', fontSize: '12px',
          }}>⛶</button>
        </div>
      </div>

      {/* Player */}
      <div id="player-iframe" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        minHeight: 0,
      }}>
        <iframe
          src={getSourceUrl()}
          title="Player"
          style={{
            width: '100%',
            flex: 1,
            minHeight: 'calc(100vh - 120px)',
            border: 'none',
          }}
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>

      {/* Bottom controls */}
      <div style={{
        background: 'rgba(15,15,26,0.95)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '8px 12px',
      }}>
        {/* Source selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#666' }}>SOURCE:</span>
          {SOURCES.map(src => (
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
              padding: '4px 10px', borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: episode <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,214,10,0.15)',
              color: episode <= 1 ? '#444' : 'var(--mario-yellow)',
              fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: episode <= 1 ? 'default' : 'pointer',
            }}>← Prev Ep</button>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#888' }}>
              S{season} • E{episode}
            </span>
            <button onClick={goNextEpisode} style={{
              padding: '4px 10px', borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,214,10,0.15)',
              color: 'var(--mario-yellow)',
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
        minHeight: '100vh', background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666',
      }}>
        Loading player...
      </div>
    }>
      <WatchContent />
    </Suspense>
  );
}
