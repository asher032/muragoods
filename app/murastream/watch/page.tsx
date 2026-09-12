'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';

interface Source {
  id: string;
  name: string;
  getUrl: (type: string, id: number, season?: number, episode?: number) => string;
}

const SOURCES: Source[] = [
  {
    id: '2embed', name: '2Embed',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://www.2embed.cc/embed/tv/${id}/${season}/${episode}`
        : `https://www.2embed.cc/embed/movie/${id}`,
  },
  {
    id: 'vidlink', name: 'VidLink',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://vidlink.pro/tv/${id}/${season}/${episode}`
        : `https://vidlink.pro/movie/${id}`,
  },
  {
    id: 'vidsrc', name: 'VidSrc',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://vidsrcme.ru/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`
        : `https://vidsrcme.ru/embed/movie?tmdb=${id}`,
  },
  {
    id: 'multiembed', name: 'Multi',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/?video_id=${id}&tmdb=1`,
  },
  {
    id: 'dailymotion', name: 'Dailymotion',
    getUrl: (_type, id) => `https://geo.dailymotion.com/player.html?video=${id}`,
  },
  {
    id: 'cinecom', name: 'CineCom',
    getUrl: (_type, id) => `https://cinecom.net/embed/${id}`,
  },
];

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const id = Number(searchParams.get('id'));
  const season = Number(searchParams.get('season')) || 1;
  const episode = Number(searchParams.get('episode')) || 1;
  const anilistIdParam = searchParams.get('anilist');
  const isAnime = !!anilistIdParam;

  const [title, setTitle] = useState('');
  const [activeSource, setActiveSource] = useState<Source>(SOURCES[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [posterPath, setPosterPath] = useState('');
  const [showAutoPlay, setShowAutoPlay] = useState(false);
  const [autoPlayCountdown, setAutoPlayCountdown] = useState(10);
  const [failedSources, setFailedSources] = useState<Set<string>>(new Set());

  // Fetch title
  useEffect(() => {
    if (!id) {
      setError('No content selected.');
      setLoading(false);
      return;
    }

    console.log('[Watch] Loading:', { type, id, season, episode, isAnime, anilistIdParam });

    const controller = new AbortController();

    if (isAnime && anilistIdParam) {
      fetch(`/api/murastream/anilist?action=details&id=${anilistIdParam}`, { signal: controller.signal })
        .then(r => r.json())
        .then(data => {
          console.log('[Watch] AniList title:', data?.title);
          setTitle(data.title || 'Anime');
          setPosterPath(data.posterPath || '');
          setLoading(false);
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          console.error('[Watch] AniList failed:', err);
          setTitle('Anime');
          setLoading(false);
        });
    } else {
      const action = type === 'tv' ? 'tv_details' : 'movie_details';
      fetch(`/api/murastream/tmdb?action=${action}&id=${id}`, { signal: controller.signal })
        .then(r => r.json())
        .then(data => {
          console.log('[Watch] TMDB title:', data?.title || data?.name);
          setTitle(type === 'tv' ? (data.name || 'TV Show') : (data.title || 'Movie'));
          setPosterPath(data.posterPath || '');
          setLoading(false);
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          console.error('[Watch] TMDB failed:', err);
          setTitle(type === 'tv' ? 'TV Show' : 'Movie');
          setLoading(false);
        });
    }
    return () => controller.abort();
  }, [id, type, isAnime, anilistIdParam, season, episode]);

  const { markEpisodeWatched } = useMuraStreamStore();

  // Record to watch history
  useEffect(() => {
    if (!id || loading || error) return;
    if (type === 'tv' && title) {
      markEpisodeWatched(id, title, posterPath, episode, undefined);
    }
  }, [id, type, episode, title, posterPath, loading, error, markEpisodeWatched]);

  // Reset failed sources when content or episode changes
  useEffect(() => {
    setFailedSources(new Set());
  }, [id, type, season, episode]);

  // Auto-play next episode
  useEffect(() => {
    if (!showAutoPlay || type !== 'tv') return;
    if (autoPlayCountdown <= 0) {
      router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}${isAnime ? `&anilist=${anilistIdParam}` : ''}`);
      return;
    }
    const timer = setTimeout(() => setAutoPlayCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [showAutoPlay, autoPlayCountdown, type, id, season, episode, router, isAnime, anilistIdParam]);

  if (!id) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '16px', color: '#ef4444' }}>No content selected.</p>
        <Link href="/murastream" style={{ color: '#B85CFF', fontSize: '14px', textDecoration: 'none' }}>← Browse MuraStream</Link>
      </div>
    );
  }

  const embedUrl = activeSource.getUrl(type, id, season, episode);

  const handleIframeError = () => {
    // Record this source as failed, then move to the next one that hasn't failed yet
    const currentIdx = SOURCES.findIndex(s => s.id === activeSource.id);
    setFailedSources(prev => new Set(prev).add(activeSource.id));
    let nextIdx = currentIdx + 1;
    while (nextIdx < SOURCES.length && failedSources.has(SOURCES[nextIdx].id)) {
      nextIdx++;
    }
    if (nextIdx < SOURCES.length) {
      setActiveSource(SOURCES[nextIdx]);
    } else {
      setError('All streaming sources are currently unavailable. Please try again later.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', background: 'rgba(10,10,10,0.9)',
        backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.back()} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', padding: '8px 14px', cursor: 'pointer',
            fontSize: '13px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/></svg>
            Back
          </button>
          <Link href="/murastream" style={{ fontSize: '13px', color: '#B85CFF', textDecoration: 'none', fontWeight: 600 }}>MuraStream</Link>
        </div>
        <p style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: 0, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}{type === 'tv' && <span style={{ color: '#B85CFF', fontWeight: 400 }}> — S{season}E{episode}</span>}
        </p>
        <div style={{ display: 'flex', gap: '6px' }}>
          {SOURCES.map(s => (
            <button key={s.id} onClick={() => setActiveSource(s)} style={{
              padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '12px', fontWeight: 500,
              border: activeSource.id === s.id ? '1px solid rgba(184,92,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
              background: activeSource.id === s.id ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.04)',
              color: activeSource.id === s.id ? '#B85CFF' : '#888',
              transition: 'all 0.2s',
            }}>{s.name}</button>
          ))}
        </div>
      </div>

      {/* Player */}
      <div style={{ flex: 1, position: 'relative', minHeight: '60vh' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <div className="custom-loader" />
            <p style={{ fontSize: '14px', color: '#666' }}>Loading player...</p>
          </div>
        ) : error ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '24px' }}>
            <p style={{ fontSize: '14px', color: '#ef4444', textAlign: 'center', maxWidth: '400px' }}>{error}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setError(''); setActiveSource(SOURCES[0]); }}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #B85CFF', background: 'rgba(184,92,255,0.15)', color: '#B85CFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                ↻ Retry
              </button>
              <Link href={type === 'tv' ? `/murastream/tv/${id}${isAnime ? `?anilist=${anilistIdParam}` : ''}` : `/murastream/movie/${id}`} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#888', fontSize: '13px', textDecoration: 'none' }}>
                ← Details
              </Link>
            </div>
          </div>
        ) : (
          <iframe
            key={`${activeSource.id}-${id}-${type}-${season}-${episode}`}
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            onError={handleIframeError}
          />
        )}

        {/* Auto-play overlay */}
        {showAutoPlay && type === 'tv' && (
          <div style={{
            position: 'absolute', bottom: '80px', right: '16px', zIndex: 20,
            background: 'rgba(10,10,24,0.95)', border: '1px solid rgba(184,92,255,0.3)',
            borderRadius: '12px', padding: '16px', width: '300px',
            backdropFilter: 'blur(10px)',
          }}>
            <p style={{ fontSize: '11px', color: '#B85CFF', margin: '0 0 8px', fontWeight: 600 }}>▶ NEXT EPISODE</p>
            <p style={{ fontSize: '12px', color: '#fff', margin: '0 0 4px' }}>{title} — S{season}E{episode + 1}</p>
            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 12px' }}>Starting in {autoPlayCountdown}s...</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}${isAnime ? `&anilist=${anilistIdParam}` : ''}`)} style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #B85CFF',
                background: 'rgba(184,92,255,0.15)', color: '#B85CFF',
                fontSize: '12px', cursor: 'pointer', fontWeight: 600,
              }}>▶ Play Now</button>
              <button onClick={() => setShowAutoPlay(false)} style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: '#888', fontSize: '12px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'rgba(15,15,26,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link href={type === 'tv' ? `/murastream/tv/${id}${isAnime ? `?anilist=${anilistIdParam}` : ''}` : `/murastream/movie/${id}`} style={{
            padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: '#888', fontSize: '12px', textDecoration: 'none',
          }}>Details</Link>
        </div>

        {type === 'tv' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => { if (episode > 1) router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode - 1}${isAnime ? `&anilist=${anilistIdParam}` : ''}`); }}
              disabled={episode <= 1} style={{
                padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                background: episode <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(184,92,255,0.15)',
                color: episode <= 1 ? '#444' : '#B85CFF', fontSize: '12px', cursor: episode <= 1 ? 'default' : 'pointer',
              }}>← Prev</button>
            <span style={{ fontSize: '12px', color: '#888' }}>S{season}E{episode}</span>
            <button onClick={() => { setShowAutoPlay(true); setAutoPlayCountdown(10); }} style={{
              padding: '4px 12px', borderRadius: '6px', border: '1px solid #B85CFF',
              background: 'rgba(184,92,255,0.15)', color: '#B85CFF', fontSize: '12px', cursor: 'pointer',
            }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#666' }}>Loading...</div>}>
      <WatchContent />
    </Suspense>
  );
}
