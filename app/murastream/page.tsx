'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import MuraStreamCard from './components/MuraStreamCard';
import MuraStreamLoader from './components/MuraStreamLoader';
import { useMuraStreamStore } from './hooks/useMuraStreamStore';
import type { MediaItem, ContinueWatchingItem } from './types';
import { GENRE_MAP } from './types';

function FeaturedHero({ item }: { item: MediaItem | null }) {
  if (!item) return null;
  const href = item.mediaType === 'tv' ? `/murastream/tv/${item.id}` : `/murastream/movie/${item.id}`;
  const genres = item.genreIds?.slice(0, 3).map(id => GENRE_MAP[id]).filter(Boolean).join(' • ') || '';
  const year = item.year || item.releaseDate?.slice(0, 4) || '';

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', height: '400px', marginBottom: '32px', cursor: 'pointer' }}>
        {item.backdropPath ? (
          <img src={item.backdropPath} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : item.posterPath ? (
          <img src={item.posterPath} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0A0A0A, #1A1A2E)' }} />
        )}
        {/* Gradient overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0A0A0A 0%, rgba(10,10,10,0.6) 40%, rgba(10,10,10,0.2) 60%, transparent 100%)' }} />
        {/* Content */}
        <div style={{ position: 'absolute', bottom: '32px', left: '28px', right: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#B85CFF', background: 'rgba(184,92,255,0.15)', padding: '3px 10px', borderRadius: '4px', letterSpacing: '0.1em' }}>FEATURED</span>
            {year && <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#888' }}>{year}</span>}
            {genres && <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#666' }}>• {genres}</span>}
          </div>
          <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '28px', color: '#FFF', margin: '0 0 8px', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
            {item.title}
          </h2>
          {(item.voteAverage ?? 0) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}>
              <span style={{ color: '#B85CFF', fontSize: '13px' }}>★</span>
              <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#E5E5E5' }}>{(item.voteAverage ?? 0).toFixed(1)}</span>
            </div>
          )}
          <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '13px', color: '#A0A0A0', margin: '0 0 20px', maxWidth: '500px', lineHeight: '1.6', maxHeight: '52px', overflow: 'hidden' }}>
            {item.overview}
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span style={{
              background: '#B85CFF', color: '#FFF', padding: '10px 24px', borderRadius: '8px',
              fontFamily: 'var(--font-arcade)', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}>
              <svg width="14" height="14" fill="#fff" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
              WATCH NOW
            </span>
            <span style={{
              background: 'rgba(184,92,255,0.12)', border: '1px solid rgba(184,92,255,0.3)', color: '#B85CFF',
              padding: '10px 24px', borderRadius: '8px',
              fontFamily: 'var(--font-arcade)', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}>
              + MY LIST
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MediaRow({ title, items, loading }: { title: string; items: MediaItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="ms-row">
        <div className="ms-row-header">
          <p className="ms-row-title">{title}</p>
        </div>
        <div className="ms-row-items">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ width: '230px', height: '330px', borderRadius: '10px', background: 'linear-gradient(90deg, #111 0%, #1A1A1A 50%, #111 100%)', backgroundSize: '200% 100%', animation: 'msShimmer 1.5s infinite', flexShrink: 0 }} />
          ))}
        </div>
      </div>
    );
  }
  if (items.length === 0) return null;
  return (
    <div className="ms-row">
      <div className="ms-row-header">
        <p className="ms-row-title">{title}</p>
        <Link href="/murastream/search" className="ms-row-more">View All →</Link>
      </div>
      <div className="ms-row-items">
        {items.map(item => <MuraStreamCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

function ContinueWatchingRow({ items }: { items: ContinueWatchingItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="ms-row">
      <div className="ms-row-header">
        <p className="ms-row-title">▶ CONTINUE WATCHING</p>
        <Link href="/murastream/history" className="ms-row-more">View All →</Link>
      </div>
      <div className="ms-row-items">
        {items.map(item => (
          <MuraStreamCard
            key={`${item.id}-${item.season}-${item.episode}`}
            item={{ ...item, mediaType: item.mediaType || 'movie', genreIds: [], overview: '', releaseDate: '' }}
            progress={item.progress}
            season={item.season}
            episode={item.episode}
          />
        ))}
      </div>
    </div>
  );
}

export default function MuraStreamHome() {
  const [trendingMovies, setTrendingMovies] = useState<MediaItem[]>([]);
  const [trendingTV, setTrendingTV] = useState<MediaItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<MediaItem[]>([]);
  const [popularTV, setPopularTV] = useState<MediaItem[]>([]);
  const [animeList, setAnimeList] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searching, setSearching] = useState(false);
  const { continueWatching } = useMuraStreamStore();
  const [activeTab, setActiveTab] = useState('trending');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTMDB = useCallback(async (action: string, params: Record<string, string> = {}) => {
    const sp = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/murastream/tmdb?${sp}`);
    if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
    return res.json();
  }, []);

  useEffect(() => {
    // Read tab from URL
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) setActiveTab(tab);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [tM, tTV, pM, pTV] = await Promise.all([
          fetchTMDB('trending', { type: 'movie', window: 'week' }),
          fetchTMDB('trending', { type: 'tv', window: 'week' }),
          fetchTMDB('popular', { type: 'movie' }),
          fetchTMDB('popular', { type: 'tv' }),
        ]);
        setTrendingMovies(tM.results || []);
        setTrendingTV(tTV.results || []);
        setPopularMovies(pM.results || []);
        setPopularTV(pTV.results || []);

        try {
          const animeRes = await fetch('/api/murastream/anime?action=trending&limit=15');
          const animeData = await animeRes.json();
          setAnimeList(animeData.data || []);
        } catch { setAnimeList([]); }

      } catch (err) {
        console.error('Failed to load MuraStream data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchTMDB]);

  // Search with debounce
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await fetchTMDB('search', { query: searchQuery });
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 500);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, fetchTMDB]);

  const heroItem = activeTab === 'trending' && trendingMovies.length > 0
    ? trendingMovies[0]
    : activeTab === 'movies' && popularMovies.length > 0
      ? popularMovies[0]
      : activeTab === 'tv' && trendingTV.length > 0
        ? trendingTV[0]
        : trendingMovies[0] || null;

  return (
    <>
      <style jsx global>{`
        @keyframes msShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div style={{ padding: '24px 28px', maxWidth: '1100px' }}>
        {/* Header + Search */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#E5E5E5', margin: '0 0 4px' }}>
            What are you watching today?
          </h1>
          <div style={{ position: 'relative', maxWidth: '420px', marginTop: '16px' }}>
            <input
              type="text"
              placeholder="Search movies, TV series & anime..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '12px 16px 12px 40px',
                background: '#171717', border: '1px solid #2A2A2A',
                borderRadius: '10px', color: '#E5E5E5', fontSize: '13px',
                fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#B85CFF'}
              onBlur={e => e.currentTarget.style.borderColor = '#2A2A2A'}
            />
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#555"
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
              viewBox="0 0 16 16">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10"/>
            </svg>
          </div>
        </div>

        {/* Search Results */}
        {searchQuery.trim() && (
          <div style={{ marginBottom: '32px' }}>
            <p className="ms-row-title" style={{ marginBottom: '12px' }}>
              {searching ? 'Searching...' : `Results for "${searchQuery}"`}
            </p>
            {searching ? (
              <MuraStreamLoader fullScreen={false} text="Searching..." />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                {searchResults.map(item => <MuraStreamCard key={item.id} item={item} />)}
              </div>
            )}
          </div>
        )}

        {/* Main Content */}
        {!searchQuery.trim() && (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto' }}>
              {[
                { id: 'trending', label: 'Trending' },
                { id: 'movies', label: 'Movies' },
                { id: 'tv', label: 'TV Series' },
                { id: 'anime', label: 'Anime' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '8px 18px', borderRadius: '8px',
                    border: activeTab === tab.id ? '1px solid #B85CFF' : '1px solid #2A2A2A',
                    background: activeTab === tab.id ? 'rgba(184,92,255,0.12)' : '#171717',
                    color: activeTab === tab.id ? '#B85CFF' : '#888',
                    fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer',
                    transition: 'all 0.2s', whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Featured Hero */}
            {heroItem && <FeaturedHero item={heroItem} />}

            {/* Continue Watching */}
            {continueWatching.length > 0 && <ContinueWatchingRow items={continueWatching} />}

            {/* Content Rows by Tab */}
            {activeTab === 'trending' && (
              <>
                <MediaRow title="🔥 TRENDING MOVIES" items={trendingMovies} loading={loading} />
                <MediaRow title="📺 TRENDING TV SHOWS" items={trendingTV} loading={loading} />
                <MediaRow title="🎬 POPULAR MOVIES" items={popularMovies} loading={loading} />
              </>
            )}
            {activeTab === 'movies' && (
              <>
                <MediaRow title="🎬 POPULAR MOVIES" items={popularMovies} loading={loading} />
                <MediaRow title="🔥 TRENDING MOVIES" items={trendingMovies} loading={loading} />
              </>
            )}
            {activeTab === 'tv' && (
              <>
                <MediaRow title="📺 POPULAR TV SHOWS" items={popularTV} loading={loading} />
                <MediaRow title="🔥 TRENDING TV" items={trendingTV} loading={loading} />
              </>
            )}
            {activeTab === 'anime' && (
              <>
                <MediaRow title="🍥 TRENDING ANIME" items={animeList} loading={loading} />
                {animeList.length === 0 && !loading && (
                  <div style={{ textAlign: 'center', padding: '48px 16px', color: '#555' }}>
                    <MuraStreamLoader fullScreen={false} text="No anime titles found yet" />
                  </div>
                )}
                {/* Link to full anime page */}
                <div style={{ textAlign: 'center', marginTop: '24px', padding: '20px', background: 'rgba(184,92,255,0.06)', borderRadius: '12px', border: '1px solid rgba(184,92,255,0.15)' }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#B85CFF', margin: '0 0 8px' }}>
                    🍥 FULL ANIME EXPERIENCE
                  </p>
                  <p style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '12px', color: '#888', margin: '0 0 14px' }}>
                    Top anime, seasonal releases, genre filters, and more
                  </p>
                  <Link href="/murastream/anime" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: '#B85CFF', color: '#FFF', padding: '10px 24px', borderRadius: '8px',
                    fontFamily: 'var(--font-arcade)', fontSize: '10px', textDecoration: 'none',
                  }}>
                    🍥 EXPLORE ANIME →
                  </Link>
                </div>
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '32px 0 16px', borderTop: '1px solid #1A1A1A', marginTop: '24px' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#444', letterSpacing: '0.1em' }}>
            MURASTREAM — Powered by TMDB
          </p>
        </div>
      </div>
    </>
  );
}
