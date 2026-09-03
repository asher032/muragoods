'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/app/components/Sidebar';

type MediaItem = {
  id: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  year: string;
  overview: string;
  genreIds: number[];
  releaseDate: string;
  name?: string;
};

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

const CATEGORY_TABS = [
  { id: 'trending', label: '🔥 Trending' },
  { id: 'movies', label: '🎬 Movies' },
  { id: 'tv', label: '📺 TV Shows' },
  { id: 'anime', label: '🍥 Anime' },
];

function MediaCard({ item, size = 'normal' }: { item: MediaItem; size?: 'large' | 'normal' }) {
  const href = item.mediaType === 'tv' ? `/murastream/tv/${item.id}` : `/murastream/movie/${item.id}`;
  const isLarge = size === 'large';

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#1a1a2e',
        cursor: 'pointer',
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        width: isLarge ? '200px' : '150px',
        minWidth: isLarge ? '200px' : '150px',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.05)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(255,214,10,0.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      >
        {item.posterPath ? (
          <img
            src={item.posterPath}
            alt={item.title}
            loading="lazy"
            style={{ width: '100%', height: isLarge ? '300px' : '225px', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%', height: isLarge ? '300px' : '225px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
            fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666',
          }}>
            No Image
          </div>
        )}
        {/* Rating badge */}
        {item.voteAverage > 0 && (
          <div style={{
            position: 'absolute', top: '8px', right: '8px',
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            padding: '2px 6px', borderRadius: '6px',
            fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ffd60a',
            display: 'flex', alignItems: 'center', gap: '3px',
          }}>
            ★ {item.voteAverage.toFixed(1)}
          </div>
        )}
        {/* Title bar */}
        <div style={{
          padding: '8px 10px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 100%)',
          position: 'absolute', bottom: 0, left: 0, right: 0,
        }}>
          <p style={{
            fontFamily: 'var(--font-arcade)', fontSize: '7px',
            color: '#fff', margin: 0, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.title}
          </p>
          {item.year && (
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '10px',
              color: '#999', margin: 0, marginTop: '2px',
            }}>
              {item.year}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      width: '150px', minWidth: '150px', borderRadius: '12px', overflow: 'hidden',
      background: '#1a1a2e', flexShrink: 0,
    }}>
      <div style={{
        width: '100%', height: '225px',
        background: 'linear-gradient(90deg, #1a1a2e 25%, #252540 50%, #1a1a2e 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }} />
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          height: '8px', borderRadius: '4px', width: '80%',
          background: 'linear-gradient(90deg, #252540 25%, #333 50%, #252540 75%)',
          backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
        }} />
      </div>
    </div>
  );
}

function HeroCarousel({ items }: { items: MediaItem[] }) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % Math.min(items.length, 5));
    }, 6000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  if (items.length === 0) return null;
  const item = items[current % items.length];
  const href = item.mediaType === 'tv' ? `/murastream/tv/${item.id}` : `/murastream/movie/${item.id}`;

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div style={{
        position: 'relative', width: '100%', height: '400px',
        borderRadius: '16px', overflow: 'hidden', marginBottom: '32px',
        cursor: 'pointer',
      }}>
        {item.backdropPath ? (
          <img
            src={item.backdropPath}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }} />
        )}
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(0deg, rgba(15,15,26,0.95) 0%, rgba(15,15,26,0.5) 40%, transparent 70%)',
        }} />
        {/* Content */}
        <div style={{
          position: 'absolute', bottom: '24px', left: '24px', right: '24px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
          }}>
            <span style={{
              background: 'var(--mario-red)', padding: '2px 8px', borderRadius: '4px',
              fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#fff',
            }}>
              {item.mediaType === 'tv' ? 'TV SERIES' : 'MOVIE'}
            </span>
            {item.voteAverage > 0 && (
              <span style={{
                fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ffd60a',
              }}>
                ★ {item.voteAverage.toFixed(1)}
              </span>
            )}
          </div>
          <h2 style={{
            fontFamily: 'var(--font-arcade)', fontSize: '18px',
            color: '#fff', margin: 0, marginBottom: '8px',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}>
            {item.title}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '13px',
            color: '#ccc', margin: 0, maxWidth: '500px',
            lineHeight: '1.5', maxHeight: '40px', overflow: 'hidden',
          }}>
            {item.overview}
          </p>
          <div style={{ marginTop: '12px' }}>
            <span style={{
              background: 'var(--mario-yellow)', color: 'var(--mario-bg)',
              padding: '6px 16px', borderRadius: '8px',
              fontFamily: 'var(--font-arcade)', fontSize: '8px',
              display: 'inline-block',
            }}>
              ▶ WATCH NOW
            </span>
          </div>
        </div>
        {/* Dots */}
        <div style={{
          position: 'absolute', bottom: '24px', right: '24px',
          display: 'flex', gap: '6px',
        }}>
          {items.slice(0, 5).map((_, i) => (
            <div
              key={i}
              onClick={(e) => {                    e.preventDefault(); setCurrent(i); if (timerRef.current) clearInterval(timerRef.current); }}
              style={{
                width: i === (current % 5) ? '20px' : '8px',
                height: '8px', borderRadius: '4px',
                background: i === (current % 5) ? 'var(--mario-yellow)' : 'rgba(255,255,255,0.3)',
                cursor: 'pointer', transition: 'all 0.3s',
              }}
            />
          ))}
        </div>
      </div>
    </Link>
  );
}

export default function MuraStreamHome() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('trending');
  const [trendingMovies, setTrendingMovies] = useState<MediaItem[]>([]);
  const [trendingTV, setTrendingTV] = useState<MediaItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<MediaItem[]>([]);
  const [popularTV, setPopularTV] = useState<MediaItem[]>([]);
  const [animeList, setAnimeList] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchTMDB = useCallback(async (action: string, params: Record<string, string> = {}) => {
    const sp = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/murastream/tmdb?${sp}`);
    if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
    return res.json();
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

        // Try fetching anime via AniList or filter TMDB
        try {
          const animeRes = await fetch('/api/murastream/tmdb?action=trending&type=movie&window=week');
          const animeData = await animeRes.json();
          // Filter animation genre (16) with Japanese origin
          const anime = (animeData.results || []).filter((item: MediaItem & { genreIds?: number[]; originalLanguage?: string }) =>
            (item.genreIds || []).includes(16) && item.originalLanguage === 'ja'
          );
          setAnimeList(anime.length > 0 ? anime : []);
        } catch {
          setAnimeList([]);
        }
      } catch (err) {
        console.error('Failed to load MuraStream data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchTMDB]);

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearching(false); return; }
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const data = await fetchTMDB('search', { q: searchQuery });
        setSearchResults((data.results || []).filter((item: MediaItem) => item.mediaType !== 'person'));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchTMDB]);

  const renderSection = (title: string, items: MediaItem[], loading?: boolean) => (
    <div style={{ marginBottom: '32px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <h3 style={{
          fontFamily: 'var(--font-arcade)', fontSize: '12px',
          color: 'var(--mario-yellow)', margin: 0,
        }}>
          {title}
        </h3>
      </div>
      <div style={{
        display: 'flex', gap: '12px', overflowX: 'auto',
        paddingBottom: '8px', scrollbarWidth: 'thin',
      }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : items.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: '#666' }}>
            No titles available yet.
          </p>
        ) : (
          items.map(item => <MediaCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );

  return (
    <>
      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .murastream-scroll::-webkit-scrollbar { height: 6px; }
        .murastream-scroll::-webkit-scrollbar-track { background: transparent; }
        .murastream-scroll::-webkit-scrollbar-thumb { background: rgba(255,214,10,0.3); border-radius: 3px; }
      `}</style>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Hamburger for mobile */}
      <button
        onClick={() => setSidebarOpen(true)}
        style={{
          position: 'fixed', top: '12px', left: '12px', zIndex: 200,
          background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,214,10,0.2)',
          borderRadius: '8px', padding: '8px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffd60a" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5" />
        </svg>
      </button>

      <div style={{
        padding: '16px',
        maxWidth: '1200px',
        margin: '0 auto',
        paddingTop: '60px',
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center', marginBottom: '24px',
        }}>
          <h1 style={{
            fontFamily: 'var(--font-arcade)', fontSize: '20px',
            color: 'var(--mario-yellow)', margin: 0,
          }}>
            🎬 MuraStream
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '13px',
            color: '#999', margin: '4px 0 16px',
          }}>
            Movies • TV • Anime
          </p>

          {/* Search */}
          <div style={{
            position: 'relative', maxWidth: '400px', margin: '0 auto',
          }}>
            <input
              type="text"
              placeholder="Search movies, shows & anime..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '10px 16px 10px 36px',
                background: 'rgba(26,26,46,0.8)', border: '1px solid rgba(255,214,10,0.2)',
                borderRadius: '12px', color: '#fff', fontSize: '13px',
                fontFamily: 'var(--font-body)', outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,214,10,0.5)'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,214,10,0.2)'}
            />
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#666"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              viewBox="0 0 16 16">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10" />
            </svg>
          </div>
        </div>

        {/* Search Results */}
        {searchQuery.trim() && (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{
              fontFamily: 'var(--font-arcade)', fontSize: '10px',
              color: '#999', margin: '0 0 12px',
            }}>
              {searching ? 'Searching...' : `Results for "${searchQuery}"`}
            </h3>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '12px',
            }}>
              {searchResults.map(item => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Category Tabs */}
        {!searchQuery.trim() && (
          <>
            <div style={{
              display: 'flex', gap: '8px', marginBottom: '24px',
              overflowX: 'auto', paddingBottom: '4px',
            }}>
              {CATEGORY_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px',
                    border: activeTab === tab.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
                    background: activeTab === tab.id ? 'rgba(255,214,10,0.15)' : 'rgba(26,26,46,0.5)',
                    color: activeTab === tab.id ? 'var(--mario-yellow)' : '#888',
                    fontFamily: 'var(--font-arcade)', fontSize: '8px',
                    cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Hero Carousel */}
            {activeTab === 'trending' && trendingMovies.length > 0 && (
              <HeroCarousel items={trendingMovies} />
            )}
            {activeTab === 'movies' && popularMovies.length > 0 && (
              <HeroCarousel items={popularMovies} />
            )}
            {activeTab === 'tv' && trendingTV.length > 0 && (
              <HeroCarousel items={trendingTV} />
            )}

            {/* Content Sections */}
            {activeTab === 'trending' && (
              <>
                {renderSection('🔥 Trending Movies', trendingMovies, loading)}
                {renderSection('📺 Trending TV Shows', trendingTV, loading)}
                {renderSection('🎬 Popular Movies', popularMovies, loading)}
              </>
            )}
            {activeTab === 'movies' && (
              <>
                {renderSection('🎬 Popular Movies', popularMovies, loading)}
                {renderSection('🔥 Trending Movies', trendingMovies, loading)}
              </>
            )}
            {activeTab === 'tv' && (
              <>
                {renderSection('📺 Popular TV Shows', popularTV, loading)}
                {renderSection('🔥 Trending TV', trendingTV, loading)}
              </>
            )}
            {activeTab === 'anime' && (
              <>
                {renderSection('🍥 Anime', animeList, loading)}
                {animeList.length === 0 && !loading && (
                  <div style={{
                    textAlign: 'center', padding: '48px 16px',
                    color: '#666', fontFamily: 'var(--font-body)', fontSize: '13px',
                  }}>
                    <p style={{ fontSize: '32px', marginBottom: '12px' }}>🍥</p>
                    <p>Anime titles are filtered from trending movies.</p>
                    <p>Check back later for anime content!</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          textAlign: 'center', padding: '32px 0 80px',
          borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '24px',
        }}>
          <p style={{
            fontFamily: 'var(--font-arcade)', fontSize: '7px',
            color: '#444', letterSpacing: '0.1em',
          }}>
            MURASTREAM — Powered by TMDB
          </p>
        </div>
      </div>
    </>
  );
}
