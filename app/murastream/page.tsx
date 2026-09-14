'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import MuraStreamCard from './components/MuraStreamCard';
import MuraStreamLoader from './components/MuraStreamLoader';
import { useMuraStreamStore } from './hooks/useMuraStreamStore';
import type { MediaItem, ContinueWatchingItem } from './types';
import { GENRE_MAP } from './types';
import { DRAMA_SECTIONS } from './data/dramas';
import { Star } from 'lucide-react';

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
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--ms-bg) 0%, #1A0A2E 50%, var(--ms-bg) 100%)' }} />
        )}

        {/* Cinematic gradients */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, var(--ms-bg) 0%, rgba(10,10,10,0.5) 30%, rgba(10,10,10,0.1) 50%, transparent 100%)',
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
              fontSize: '11px', fontWeight: 700, color: '#E50914',
              background: 'rgba(229,9,20,0.2)', padding: '4px 12px', borderRadius: '6px',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>Featured</span>
            {year && (
              <span style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '12px', color: 'var(--ms-text-dim)',
              }}>{year}</span>
            )}
            {genres && (
              <span style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '12px', color: 'var(--ms-text-faint)',
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
              <span style={{ color: '#E50914', fontSize: '16px' }}><Star color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
              <span style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '14px', fontWeight: 600, color: 'var(--ms-text)'
              }}>{(item.voteAverage ?? 0).toFixed(1)}</span>
            </div>
          )}

          {/* Description */}
          <p style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '14px', color: 'var(--ms-text-muted)', margin: '0 0 24px',
            lineHeight: '1.6', maxHeight: '60px', overflow: 'hidden',
          }}>
            {item.overview}
          </p>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{
              background: '#E50914', color: '#FFF', padding: '12px 28px',
              borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '14px', fontWeight: 700,
              boxShadow: '0 4px 20px rgba(229,9,20,0.4)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
              <svg width="16" height="16" fill="#fff" viewBox="0 0 16 16">
                <path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/>
              </svg>
              Watch Now
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--ms-text)', padding: '12px 28px', borderRadius: '10px',
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

// Watch Party banner card on the homepage. Restores an in-progress party
// from localStorage (same key the watch page persists) so a live party is
// resumable from home; otherwise offers code-entry and start.
function WatchPartyCard({ partyCode, hero }: { partyCode: string | null; hero: MediaItem | null }) {
  const [code, setCode] = useState('');
  const [savedParty, setSavedParty] = useState<{ code: string; isHost: boolean } | null>(null);
  const [live, setLive] = useState(false);
  const router = useRouter();

  // Restore + liveness: the watch page writes { code, isHost } to 'ms-party'.
  // A party is "live" if the server still knows it (members list exists).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ms-party');
      if (!raw) return;
      const p = JSON.parse(raw) as { code?: string; isHost?: boolean };
      if (!p.code) return;
      setSavedParty({ code: p.code, isHost: !!p.isHost });
      let dead = false;
      fetch(`/api/murastream/party?code=${p.code}`)
        .then(r => { if (r.status === 404) dead = true; return r.json(); })
        .then(d => {
          if (!dead && d?.success && d?.data?.members?.length > 0) setLive(true);
          else setSavedParty(null);
        })
        .catch(() => setSavedParty(null));
    } catch { /* empty */ }
  }, []);

  const go = (suffix: string) => {
    const base = hero
      ? `/murastream/watch?type=${hero.mediaType === 'tv' ? 'tv' : 'movie'}&id=${hero.id}`
      : '/murastream/watch?type=movie&id=27205';
    // base already carries a query string — join with &, never a second '?'.
    router.push(`${base}&${suffix.replace(/^\?/, '')}`);
  };
  return (
    <div style={{
      marginTop: 4, marginBottom: 32, padding: '20px 24px',
      display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      background: 'linear-gradient(120deg, rgba(229,9,20,0.12) 0%, rgba(229,9,20,0.04) 55%, transparent 100%)',
      border: '1px solid rgba(229,9,20,0.25)', borderRadius: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 260px' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'rgba(229,9,20,0.18)', border: '1px solid rgba(229,9,20,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Users size={22} color="#E50914" />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ms-text-strong)', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', display: 'flex', alignItems: 'center', gap: 8 }}>
            {(partyCode || (savedParty && live)) ? (
              <>
                Party {(partyCode || savedParty?.code)} is live
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block',
                  boxShadow: '0 0 8px rgba(34,197,94,0.7)',
                }} />
              </>
            ) : 'Watch Party'}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--ms-text-dim)', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
            {(partyCode || (savedParty && live))
              ? 'Your party is still running — jump back in with playback and chat in sync.'
              : 'Watch in sync with friends. Start a party, share the code, chat live.'}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter' && code.trim().length >= 4) go(`?party=${encodeURIComponent(code.trim())}&partyPanel=1`); }}
          placeholder="PARTY CODE"
          maxLength={6}
          aria-label="Party code"
          style={{
            width: 150, padding: '10px 12px', borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)',
            color: 'var(--ms-text)', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em',
            fontFamily: 'var(--font-arcade)', textTransform: 'uppercase',
          }}
        />
        <button
          onClick={() => { if (code.trim().length >= 4) go(`?party=${encodeURIComponent(code.trim())}&partyPanel=1`); }}
          disabled={code.trim().length < 4}
          style={{
            padding: '10px 18px', borderRadius: 9, cursor: code.trim().length >= 4 ? 'pointer' : 'default',
            border: '1px solid rgba(229,9,20,0.5)', background: code.trim().length >= 4 ? '#E50914' : 'rgba(229,9,20,0.25)',
            color: '#fff', fontSize: 13, fontWeight: 700,
          }}
        >Join</button>
        {(savedParty && live) && (
          <button
            onClick={() => go(`?party=${savedParty.code}&partyPanel=1`)}
            style={{
              padding: '10px 18px', borderRadius: 9, cursor: 'pointer',
              border: '1px solid #22c55e', background: 'rgba(34,197,94,0.15)',
              color: '#22c55e', fontSize: 13, fontWeight: 700,
            }}
          >Resume party</button>
        )}
        <button
          onClick={() => go('?partyPanel=1')}
          style={{
            padding: '10px 18px', borderRadius: 9, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)',
            color: 'var(--ms-text)', fontSize: 13, fontWeight: 600,
          }}
        >Start a party</button>
      </div>
    </div>
  );
}

function MediaRow({ title, items, loading, viewAllHref, ranked }: {
  title: string; items: MediaItem[]; loading: boolean; viewAllHref?: string; ranked?: boolean;
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
              width: '190px', height: '300px', borderRadius: '12px',
              background: 'linear-gradient(90deg, #141414 0%, var(--ms-border) 50%, #141414 100%)',
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
    <div className={`ms-row${ranked ? ' ms-rank-row' : ''}`}>
      <div className="ms-row-header">
        <p className="ms-row-title">{title}</p>
        {viewAllHref && (
          <Link href={viewAllHref} className="ms-row-more">View All →</Link>
        )}
      </div>
      <div className="ms-row-items">
        {items.map((item, i) => ranked ? (
          <div key={item.id} className="ms-rank-item">
            <span className={`ms-rank${i === 9 ? ' ms-rank-wide' : ''}`} aria-hidden>{i + 1}</span>
            <MuraStreamCard item={item} />
          </div>
        ) : (
          <MuraStreamCard key={item.id} item={item} />
        ))}
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
  // Party code from ?party= — read once on mount; the card is informational.
  const [partyCode, setPartyCode] = useState<string | null>(null);
  useEffect(() => {
    const m = window.location.search.match(/party=([A-Za-z0-9]{4,8})/);
    if (m) setPartyCode(m[1].toUpperCase());
  }, []);
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

      <div className="ms-page-enter ms-page-pad" style={{ paddingTop: 0 }}>

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
                borderRadius: '12px', color: 'var(--ms-text)', fontSize: '14px',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                outline: 'none', transition: 'all 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(229,9,20,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            />
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="var(--ms-text-ghost)"
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
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ms-text-faint)' }}>
                <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px' }}>No results found</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: '36px 28px',
              }}>
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
                { id: 'trending', label: 'Trending' },
                { id: 'movies', label: 'Movies' },
                { id: 'tv', label: 'TV Shows' },
                { id: 'kdrama', label: 'Dramas' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '10px 20px', borderRadius: '10px',
                    border: activeTab === tab.id ? '1px solid rgba(229,9,20,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    background: activeTab === tab.id ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.03)',
                    color: activeTab === tab.id ? '#E50914' : 'var(--ms-text-dim)',
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

            {/* Watch Party card — jump back into a party or start one */}
            <WatchPartyCard partyCode={partyCode} hero={heroItem} />

            {/* Continue Watching */}
            {continueWatching.length > 0 && <ContinueWatchingRow items={continueWatching} />}

            {/* Content Rows by Tab */}
            {activeTab === 'trending' && (
              <>
                <MediaRow title="Trending Now — Top 10" items={trendingMovies} loading={loading} viewAllHref="/murastream?tab=movies" ranked />
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
                    title={`Popular ${s.label}`}
                    items={dramaLists[s.id] || []}
                    loading={loading}
                    viewAllHref="/murastream/kdrama"
                  />
                ))}
                <div style={{
                  textAlign: 'center', marginTop: '20px', padding: '24px',
                  background: 'rgba(229,9,20,0.05)', borderRadius: '16px',
                  border: '1px solid rgba(229,9,20,0.12)',
                }}>
                  <p style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: '16px', fontWeight: 700, color: '#E50914', margin: '0 0 6px',
                  }}>
                    Full Drama Experience
                  </p>
                  <p style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: '13px', color: 'var(--ms-text-dim)', margin: '0 0 16px',
                  }}>
                    K-Dramas, C-Dramas & J-Dramas — genres, years, top-rated
                  </p>
                  <Link href="/murastream/kdrama" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: '#E50914', color: '#FFF', padding: '12px 28px',
                    borderRadius: '10px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    fontSize: '13px', fontWeight: 700, textDecoration: 'none',
                    boxShadow: '0 4px 20px rgba(229,9,20,0.3)',
                  }}>
                    Browse Dramas →
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
