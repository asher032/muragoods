'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Source {
  id: string;
  name: string;
  getUrl: (type: string, id: number, season?: number, episode?: number) => string;
}

const SOURCES: Source[] = [
  {
    id: 'vidlink', name: 'VidLink',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://vidlink.pro/tv/${id}/${season}/${episode}`
        : `https://vidlink.pro/movie/${id}`,
  },
  {
    id: '2embed', name: '2Embed',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://www.2embed.cc/embed/tmdb/tv/${id}/${season}/${episode}`
        : `https://www.2embed.cc/embed/tmdb/movie/${id}`,
  },
  {
    id: 'multiembed', name: 'Multi',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/?video_id=${id}&tmdb=1`,
  },
  {
    id: 'vidsrc', name: 'VidSrc',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://vidsrc.me/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`
        : `https://vidsrc.me/embed/movie?tmdb=${id}`,
  },
  {
    id: 'cinesrc', name: 'CineSrc',
    getUrl: (type, id) =>
      `https://cinesrc.st/embed/movie/${id}`,
  },
];

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const id = Number(searchParams.get('id'));
  const season = Number(searchParams.get('season')) || 1;
  const episode = Number(searchParams.get('episode')) || 1;

  const [title, setTitle] = useState('');
  const [activeSource, setActiveSource] = useState<Source>(SOURCES[0]);
  const [loading, setLoading] = useState(true);
  const [showAutoPlay, setShowAutoPlay] = useState(false);
  const [autoPlayCountdown, setAutoPlayCountdown] = useState(10);
  const [posterPath, setPosterPath] = useState('');

  // Fetch title from TMDB
  useEffect(() => {
    if (!id) return;
    const action = type === 'tv' ? 'tv_details' : 'movie_details';
    fetch(`/api/murastream/tmdb?action=${action}&id=${id}`)
      .then(r => r.json())
      .then(data => {
        setTitle(type === 'tv' ? data.name : data.title);
        setPosterPath(data.posterPath || '');
        setLoading(false);
      })
      .catch(() => { setTitle(type === 'tv' ? 'TV Show' : 'Movie'); setLoading(false); });
  }, [id, type]);

  // Record to watch history when page loads
  useEffect(() => {
    if (!id || loading) return;
    fetch('/api/murastream/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add-history',
        item: {
          id,
          mediaType: type,
          title,
          posterPath,
          season: type === 'tv' ? season : undefined,
          episode: type === 'tv' ? episode : undefined,
        },
      }),
    }).catch(() => {});

    // Also update continue watching
    if (type === 'tv') {
      fetch('/api/murastream/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-continue-watching',
          item: {
            id,
            mediaType: type,
            title,
            posterPath,
            season,
            episode,
          },
        }),
      }).catch(() => {});
    }
  }, [id, type, season, episode, title, posterPath, loading]);

  // Auto-play countdown for TV shows
  useEffect(() => {
    if (!showAutoPlay || type !== 'tv') return;
    if (autoPlayCountdown <= 0) {
      router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}`);
      return;
    }
    const timer = setTimeout(() => setAutoPlayCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [showAutoPlay, autoPlayCountdown, type, id, season, episode, router]);

  if (!id) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: '#666' }}>No content selected.</p>
        <Link href="/murastream" style={{ color: 'var(--mario-yellow)' }}>← Browse</Link>
      </div>
    );
  }

  const embedUrl = activeSource.getUrl(type, id, season, episode);

  // Auto-fallback: if iframe fails to load, try next source
  const handleIframeError = () => {
    const currentIdx = SOURCES.findIndex(s => s.id === activeSource.id);
    if (currentIdx < SOURCES.length - 1) {
      setActiveSource(SOURCES[currentIdx + 1]);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(15,15,26,0.95)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ccc' }}>← Back</button>
          <Link href="/murastream" style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#B85CFF', textDecoration: 'none' }}>🎬 MuraStream</Link>
        </div>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#fff', margin: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}{type === 'tv' && ` — S${season}E${episode}`}
        </p>
        <div style={{ display: 'flex', gap: '4px' }}>
          {SOURCES.map(s => (
            <button key={s.id} onClick={() => setActiveSource(s)} style={{
              padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '7px',
              border: activeSource.id === s.id ? '1px solid #B85CFF' : '1px solid rgba(255,255,255,0.1)',
              background: activeSource.id === s.id ? 'rgba(184,92,255,0.15)' : 'transparent',
              color: activeSource.id === s.id ? '#B85CFF' : '#888',
            }}>{s.name}</button>
          ))}
        </div>
      </div>

      {/* Player */}
      <div style={{ flex: 1, position: 'relative', minHeight: '60vh' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <div className="custom-loader" />
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#666' }}>Loading player...</p>
          </div>
        ) : (
          <iframe
            key={`${activeSource.id}-${id}-${type}-${season}-${episode}`}
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            onError={handleIframeError}
          />
        )}

        {/* Auto-play next episode overlay */}
        {showAutoPlay && type === 'tv' && (
          <div style={{
            position: 'absolute', bottom: '80px', right: '16px', zIndex: 20,
            background: 'rgba(10,10,24,0.95)', border: '1px solid rgba(184,92,255,0.3)',
            borderRadius: '12px', padding: '16px', width: '300px',
            backdropFilter: 'blur(10px)',
          }}>              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#B85CFF', margin: '0 0 8px' }}>
              ▶ NEXT EPISODE
            </p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#fff', margin: '0 0 4px' }}>
              {title} — S{season}E{episode + 1}
            </p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '6px', color: '#888', margin: '0 0 12px' }}>
              Starting in {autoPlayCountdown}s...
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}`)} style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #B85CFF',
                background: 'rgba(184,92,255,0.15)', color: '#B85CFF',
                fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer',
              }}>▶ Play Now</button>
              <button onClick={() => setShowAutoPlay(false)} style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: '#888',
                fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'rgba(15,15,26,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link href={type === 'tv' ? `/murastream/tv/${id}` : `/murastream/movie/${id}`} style={{
            padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: '#888',
            fontFamily: 'var(--font-arcade)', fontSize: '7px', textDecoration: 'none',
          }}>Details</Link>
          <Link href="/murastream/library" style={{
            padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: '#888',
            fontFamily: 'var(--font-arcade)', fontSize: '7px', textDecoration: 'none',
          }}>Library</Link>
        </div>

        {/* TV Episode Navigation */}
        {type === 'tv' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => { if (episode > 1) router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode - 1}`); }} disabled={episode <= 1} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',              background: episode <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(184,92,255,0.15)', color: episode <= 1 ? '#444' : '#B85CFF', fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: episode <= 1 ? 'default' : 'pointer' }}>← Prev</button>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#888' }}>S{season}E{episode}</span>
            <button onClick={() => {
              // Show auto-play overlay instead of navigating immediately
              setShowAutoPlay(true);
              setAutoPlayCountdown(10);
            }} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #B85CFF', background: 'rgba(184,92,255,0.15)', color: '#B85CFF', fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer' }}>Next →</button>
          </div>
        )}

        {/* Auto-play toggle for TV */}
        {type === 'tv' && !showAutoPlay && (
          <button onClick={() => {
            // Simulate episode end to trigger auto-play
            setShowAutoPlay(true);
            setAutoPlayCountdown(10);
          }} style={{
            padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(184,92,255,0.2)',
            background: 'rgba(184,92,255,0.1)', color: '#B85CFF',
            fontFamily: 'var(--font-arcade)', fontSize: '6px', cursor: 'pointer',
          }}>⚡ Auto-Play</button>
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
