'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import MuraStreamCard from './components/MuraStreamCard';
import MuraStreamLoader from './components/MuraStreamLoader';
import { useMuraStreamStore } from './hooks/useMuraStreamStore';
import type { MediaItem, ContinueWatchingItem } from './types';
import { GENRE_MAP } from './types';
import { DRAMA_SECTIONS } from './data/dramas';

function FeaturedHero({ item }: { item: MediaItem | null }) {
  if (!item) return null;
  const href = item.mediaType === 'tv' ? `/murastream/tv/${item.id}` : `/murastream/movie/${item.id}`;
  const genres = item.genreIds?.slice(0, 3).map(id => GENRE_MAP[id]).filter(Boolean).join(' · ') || '';
  const year = item.year || item.releaseDate?.slice(0, 4) || '';

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div style={{
        position: 'relative', width: '100%', height: '520px', marginBottom: '40px',
        borderRadius: '16px', overflow: 'hidden', cursor: 'pointer',
      }}>
        {/* Backdrop image */}
        {item.backdropPath ? (
          <img src={item.backdropPath} alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 8s ease' }} />
        ) : item.posterPath ? (
          <img src={item.posterPath} alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0A0A0A 0%, #1A0A2E 50%, #0A0A0A 100%)' }} />
        )}

        {/* Cinematic gradients */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, #0A0A0A 0%, rgba(10,10,10,0.5) 30%, rgba(10,10,10,0.1) 50%, transparent 100%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.6) 35%, transparent 65%)',
        }} />

        {/* Content */}
        <div style={{
          position: 'absolute', bottom: '40px', left: '40px', right: '40px',
          maxWidth: '600px',
        }}>
          {/* Badges */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '11px', fontWeight: 700, color: '#B85CFF',
              background: 'rgba(184,92,255,0.2)', padding: '4px 12px', borderRadius: '6px',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>Featured</span>
            {year && (
              <span style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '12px', color: '#888',
              }}>{year}</span>
            )}
            {genres && (
              <span style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '12px', color: '#666',
              }}>· {genres}</span>
            )}
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
            fontSize: '36px', fontWeight: 800, color: '#FFF',
            margin: '0 0 12px', lineHeight: '1.1',
            textShadow: '0 2px 20px rgba(0,0,0,0.5)',
            letterSpacing: '-0.02em',
          }}>
            {item.title}
          </h1>

          {/* Rating */}
          {(item.voteAverage ?? 0) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <span style={{ color: '#B85CFF', fontSize: '16px' }}>★</span>
              <span style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '14px', fontWeight: 600, color: '#E5E5E5'
              }}>{(item.voteAverage ?? 0).toFixed(1)}</span>
            </div>
          )}

          {/* Description */}
          <p style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '14px', color: '#A0A0A0', margin: '0 0 24px',
            lineHeight: '1.6', maxHeight: '60px', overflow: 'hidden',
          }}>
            {item.overview}
          </p>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{
              background: '#B85CFF', color: '#FFF', padding: '12px 28px',
              borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '14px', fontWeight: 700,
              boxShadow: '0 4px 20px rgba(184,92,255,0.4)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
              <svg width="16" height="16" fill="#fff" viewBox="0 0 16 16">
                <path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/>
              </svg>
              Watch Now
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#E5E5E5', padding: '12px 28px', borderRadius: '10px',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '14px', fontWeight: 600,
              backdropFilter: 'blur(8px)',
            }}>
              + My List
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MediaRow({ title, items, loading, viewAllHref }: {
  title: string; items: MediaItem[]; loading: boolean; viewAllHref?: string;
}) {
  if (loading) {
    return (
      <div className="ms-row">
        <div className="ms-row-header">
          <p className="ms-row-title">{title}</p>
        </div>
        <div className="ms-row-items">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{
              width: '200px', height: '300px', borderRadius: '12px',
              background: 'linear-gradient(90deg, #141414 0%, #1A1A1A 50%, #141414 100%)',
              backgroundSize: '200% 100%', animation: 'msShimmer 1.5s infinite',
              flexShrink: 0,
            }} />
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
        {viewAllHref && (
          <Link href={viewAllHref} className="ms-row-more">View All →</Link>
        )}
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
        <p className="ms-row-title">Continue Watching</p>
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
  const [dramaLists, setDramaLists] = useState<Record<string, MediaItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const { continueWatching } = useMuraStreamStore();
  const [activeTab, setActiveTab] = useState('trending');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const fetchTMDB = useCallback(async (action: string, params: Record<string, string> = {}) => {
    const sp = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/murastream/tmdb?${sp}`);
    if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
    return res.json();
  }, []);

  useEffect(() => {
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
          const dramaRes = await Promise.all(
            DRAMA_SECTIONS.map(s =>
              fetch(`/api/murastream/tmdb?action=discover&type=tv&with_original_language=${s.lang}&with_genres=18&vote_count_gte=20`)
                .then(r => (r.ok ? r.json() : { results: [] }))
                .then(d => d.results || [])
                .catch(() => [] as MediaItem[])
            )
          );
          const next: Record<string, MediaItem[]> = {};
          DRAMA_SECTIONS.forEach((s, i) => { next[s.id] = dramaRes[i]; });
          setDramaLists(next);
        } catch { setDramaLists({}); }

      } catch (err) {
        console.error('Failed to load MuraStream data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchTMDB]);

  // Search with debounce + AbortController
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();
    if (!searchQuery.trim()) { setSearchResults([]); setSearching(false); setSearchError(false); return; }
    setSearching(true);
    setSearchError(false);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const controller = new AbortController();
        searchAbortRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const sp = new URLSearchParams({ action: 'search', q: searchQuery });
        const res = await fetch(`/api/murastream/tmdb?${sp}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSearchResults([]);
        setSearchError(true);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (searchAbortRef.current) searchAbortRef.current.abort();
    };
  }, [searchQuery]);

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

      <div className="ms-page-enter" style={{ padding: '0 24px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* ─── Search Bar ────────────────────────────── */}
        <div style={{ paddingTop: '24px', marginBottom: '24px' }}>
          <div style={{ position: 'relative', maxWidth: '480px' }}>
            <input
              type="text"
              placeholder="Search movies & TV shows..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '14px 18px 14px 44px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px', color: '#E5E5E5', fontSize: '14px',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                outline: 'none', transition: 'all 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(184,92,255,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            />
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#555"
              style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }}
              viewBox="0 0 16 16">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10"/>
            </svg>
          </div>
        </div>

        {/* ─── Search Results ─────────────────────────── */}
        {searchQuery.trim() && (
          <div style={{ marginBottom: '40px' }}>
            <p className="ms-row-title" style={{ marginBottom: '16px' }}>
              {searching ? 'Searching...' : `Results for "${searchQuery}"`}
            </p>
            {searching ? (
              <MuraStreamLoader fullScreen={false} text="Searching..." />
            ) : searchError ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#ef4444' }}>
                <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px' }}>Search failed. Please try again.</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#666' }}>
                <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px' }}>No results found</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
                {searchResults.map(item => <MuraStreamCard key={item.id} item={item} />)}
              </div>
            )}
          </div>
        )}

        {/* ─── Main Content ──────────────────────────── */}
        {!searchQuery.trim() && (
          <>
            {/* Tabs */}
            <div style={{
              display: 'flex', gap: '6px', marginBottom: '28px',
              overflowX: 'auto', paddingBottom: '4px',
            }}>
              {[
                { id: 'trending', label: '🔥 Trending' },
                { id: 'movies', label: '🎬 Movies' },
                { id: 'tv', label: '📺 TV Shows' },
                { id: 'kdrama', label: '🌏 Dramas' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '10px 20px', borderRadius: '10px',
                    border: activeTab === tab.id ? '1px solid rgba(184,92,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    background: activeTab === tab.id ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.03)',
                    color: activeTab === tab.id ? '#B85CFF' : '#888',
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
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
                <MediaRow title="Trending Movies" items={trendingMovies} loading={loading} viewAllHref="/murastream?tab=movies" />
                <MediaRow title="Trending TV Shows" items={trendingTV} loading={loading} viewAllHref="/murastream?tab=tv" />
                <MediaRow title="Popular Movies" items={popularMovies} loading={loading} viewAllHref="/murastream?tab=movies" />
                <MediaRow title="K-Dramas Everyone's Watching" items={dramaLists.kdrama || []} loading={loading} viewAllHref="/murastream/kdrama" />
              </>
            )}
            {activeTab === 'movies' && (
              <>
                <MediaRow title="Popular Movies" items={popularMovies} loading={loading} />
                <MediaRow title="Trending Movies" items={trendingMovies} loading={loading} />
              </>
            )}
            {activeTab === 'tv' && (
              <>
                <MediaRow title="Popular TV Shows" items={popularTV} loading={loading} />
                <MediaRow title="Trending TV" items={trendingTV} loading={loading} />
              </>
            )}            {activeTab === 'kdrama' && (
              <>
                {DRAMA_SECTIONS.map(s => (
                  <MediaRow
                    key={s.id}
                    title={`${s.flag} Popular ${s.label}`}
                    items={dramaLists[s.id] || []}
                    loading={loading}
                    viewAllHref="/murastream/kdrama"
                  />
                ))}
                <div style={{
                  textAlign: 'center', marginTop: '20px', padding: '24px',
                  background: 'rgba(184,92,255,0.05)', borderRadius: '16px',
                  border: '1px solid rgba(184,92,255,0.12)',
                }}>
                  <p style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: '16px', fontWeight: 700, color: '#B85CFF', margin: '0 0 6px',
                  }}>
                    🌏 Full Drama Experience
                  </p>
                  <p style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: '13px', color: '#888', margin: '0 0 16px',
                  }}>
                    K-Dramas, C-Dramas & J-Dramas — genres, years, top-rated
                  </p>
                  <Link href="/murastream/kdrama" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: '#B85CFF', color: '#FFF', padding: '12px 28px',
                    borderRadius: '10px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: '13px', fontWeight: 700, textDecoration: 'none',
                    boxShadow: '0 4px 20px rgba(184,92,255,0.3)',
                  }}>
                    🌏 Browse Dramas →
                  </Link>
                </div>
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          textAlign: 'center', padding: '40px 0 24px',
          borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: '40px',
        }}>
          <p style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '12px', color: '#444', letterSpacing: '0.05em',
          }}>
            MURASTREAM — Powered by TMDB
          </p>
        </div>
      </div>
    </>
  );
}
