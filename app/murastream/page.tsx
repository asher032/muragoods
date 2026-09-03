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

type ContinueWatchingItem = {
  id: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  season?: number;
  episode?: number;
  progress?: number;
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
            background: 'rgba(0,0,0,0.7)', borderRadius: '6px',
            padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '3px',
          }}>
            <span style={{ color: '#ffd60a', fontSize: '9px' }}>★</span>
            <span style={{ color: '#fff', fontFamily: 'var(--font-arcade)', fontSize: '7px' }}>
              {item.voteAverage.toFixed(1)}
            </span>
          </div>
        )}
        {/* Info */}
        <div style={{ padding: '8px' }}>
          <p style={{
            fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#fff', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.title}</p>
          {item.year && (
            <p style={{
              fontFamily: 'var(--font-arcade)', fontSize: '6px', color: '#888', margin: '2px 0 0',
            }}>{item.year}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function ContinueWatchingCard({ item }: { item: ContinueWatchingItem }) {
  const href = item.mediaType === 'tv'
    ? `/murastream/watch?type=tv&id=${item.id}&season=${item.season || 1}&episode=${item.episode || 1}`
    : `/murastream/movie/${item.id}`;

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        position: 'relative', borderRadius: '12px', overflow: 'hidden',
        background: '#1a1a2e', cursor: 'pointer', width: '160px', minWidth: '160px', flexShrink: 0,
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(255,214,10,0.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        {item.posterPath ? (
          <img src={item.posterPath} alt={item.title} loading="lazy"
            style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666' }}>No Image</div>
        )}
        {/* Play overlay */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.3)', opacity: 0,
          transition: 'opacity 0.2s',
        }}
          className="cw-play-overlay"
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,214,10,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" fill="#000" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ height: '100%', width: `${item.progress || 0}%`, background: 'var(--mario-yellow)', borderRadius: '0 2px 0 0' }} />
        </div>
        <div style={{ padding: '8px' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
          {item.mediaType === 'tv' && item.season != null && (
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '6px', color: '#ffd60a', margin: '2px 0 0' }}>
              ▶ Continue S{item.season}E{item.episode}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function MediaRow({ title, items, loading }: { title: string; items: MediaItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#888', margin: '0 0 12px' }}>{title}</p>
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }} className="murastream-scroll">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ width: '150px', height: '280px', borderRadius: '12px', background: 'linear-gradient(90deg, #1a1a2e 0%, #252540 50%, #1a1a2e 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', flexShrink: 0 }} />
          ))}
        </div>
      </div>
    );
  }
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: '24px' }}>
      <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#888', margin: '0 0 12px' }}>{title}</p>
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }} className="murastream-scroll">
        {items.map(item => <MediaCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

function HeroCarousel({ items }: { items: MediaItem[] }) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setCurrent(c => c + 1), 6000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  if (items.length === 0) return null;
  const item = items[current % items.length];
  const href = item.mediaType === 'tv' ? `/murastream/tv/${item.id}` : `/murastream/movie/${item.id}`;

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        position: 'relative', borderRadius: '16px', overflow: 'hidden',
        height: '300px', marginBottom: '24px', cursor: 'pointer',
      }}>
        {item.backdropPath ? (
          <img src={item.backdropPath} alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : item.posterPath ? (
          <img src={item.posterPath} alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0a0a18, #1a1a2e)' }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '40px', left: '24px',
        }}>
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
              onClick={(e) => { e.preventDefault(); setCurrent(i); if (timerRef.current) clearInterval(timerRef.current); }}
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
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);

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

        try {
          const animeRes = await fetch('/api/murastream/tmdb?action=trending&type=movie&window=week');
          const animeData = await animeRes.json();
          const anime = (animeData.results || []).filter((item: MediaItem & { genreIds?: number[]; originalLanguage?: string }) =>
            (item.genreIds || []).includes(16) && item.originalLanguage === 'ja'
          );
          setAnimeList(anime.length > 0 ? anime : []);
        } catch {
          setAnimeList([]);
        }

        // Fetch continue watching from library
        try {
          const libRes = await fetch('/api/murastream/library');
          if (libRes.ok) {
            const libData = await libRes.json();
            setContinueWatching(libData.continueWatching || []);
          }
        } catch { /* empty */ }
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
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetchTMDB('search', { query: searchQuery });
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchTMDB]);

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
        .cw-play-overlay { opacity: 0 !important; }
        div:hover > .cw-play-overlay { opacity: 1 !important; }
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
            {/* Continue Watching */}
            {continueWatching.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-yellow)', margin: 0 }}>
                    ▶ Continue Watching
                  </p>
                  <Link href="/murastream/library" style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#666', textDecoration: 'none' }}>
                    View All →
                  </Link>
                </div>
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }} className="murastream-scroll">
                  {continueWatching.map((item) => (
                    <ContinueWatchingCard key={`${item.id}-${item.season}-${item.episode}`} item={item} />
                  ))}
                </div>
              </div>
            )}

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
                {MediaRow({ title: '🔥 Trending Movies', items: trendingMovies, loading })}
                {MediaRow({ title: '📺 Trending TV Shows', items: trendingTV, loading })}
                {MediaRow({ title: '🎬 Popular Movies', items: popularMovies, loading })}
              </>
            )}
            {activeTab === 'movies' && (
              <>
                {MediaRow({ title: '🎬 Popular Movies', items: popularMovies, loading })}
                {MediaRow({ title: '🔥 Trending Movies', items: trendingMovies, loading })}
              </>
            )}
            {activeTab === 'tv' && (
              <>
                {MediaRow({ title: '📺 Popular TV Shows', items: popularTV, loading })}
                {MediaRow({ title: '🔥 Trending TV', items: trendingTV, loading })}
              </>
            )}
            {activeTab === 'anime' && (
              <>
                {MediaRow({ title: '🍥 Anime', items: animeList, loading })}
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
