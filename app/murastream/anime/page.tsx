'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';
import type { MediaItem } from '../types';

// Anime genre IDs (MAL genre IDs)
const ANIME_GENRES = [
  { id: 1, name: 'Action' },
  { id: 2, name: 'Adventure' },
  { id: 4, name: 'Comedy' },
  { id: 8, name: 'Drama' },
  { id: 10, name: 'Fantasy' },
  { id: 14, name: 'Horror' },
  { id: 22, name: 'Romance' },
  { id: 24, name: 'Sci-Fi' },
  { id: 36, name: 'Slice of Life' },
  { id: 37, name: 'Supernatural' },
  { id: 40, name: 'Psychological' },
  { id: 62, name: 'Isekai' },
];

function AnimeHero({ item }: { item: MediaItem | null }) {
  if (!item) return null;
  const year = item.year || (item.releaseDate ? item.releaseDate.substring(0, 4) : '');
  const genres = (item as MediaItem & { genres?: string[] }).genres?.slice(0, 3).join(' • ') || '';
  const episodes = (item as MediaItem & { episodes?: number }).episodes;
  const score = (item as MediaItem & { score?: number; rating?: string }).score || item.voteAverage || 0;
  const status = (item as MediaItem & { status?: string }).status;
  const studios = (item as MediaItem & { studios?: string[] }).studios?.join(', ') || '';

  return (
    <div style={{
      position: 'relative', borderRadius: '12px', overflow: 'hidden',
      height: '420px', marginBottom: '32px', background: '#0A0A0A',
    }}>
      {/* Background poster */}
      {item.posterPath ? (
        <img src={item.posterPath} alt={item.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.4)' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0A0A0A 0%, #1A0A2E 50%, #0A0A0A 100%)' }} />
      )}

      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0A0A0A 0%, rgba(10,10,10,0.7) 30%, rgba(10,10,10,0.3) 60%, transparent 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.5) 40%, transparent 100%)' }} />

      {/* Content */}
      <div style={{ position: 'absolute', bottom: '32px', left: '28px', right: '28px', maxWidth: '600px' }}>
        {/* Badges */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#B85CFF',
            background: 'rgba(184,92,255,0.2)', padding: '3px 10px', borderRadius: '4px',
            letterSpacing: '0.1em', border: '1px solid rgba(184,92,255,0.3)',
          }}>TOP RANKED</span>
          {status && (
            <span style={{
              fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#4ade80',
              background: 'rgba(74,222,128,0.15)', padding: '3px 10px', borderRadius: '4px',
              letterSpacing: '0.05em',
            }}>{status}</span>
          )}
          {score > 0 && (
            <span style={{
              fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#facc15',
              background: 'rgba(250,204,21,0.15)', padding: '3px 10px', borderRadius: '4px',
            }}>★ {score.toFixed(1)}</span>
          )}
          {episodes && (
            <span style={{
              fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#888',
              background: 'rgba(255,255,255,0.08)', padding: '3px 10px', borderRadius: '4px',
            }}>{episodes} EP</span>
          )}
        </div>

        <h2 style={{
          fontFamily: 'var(--font-arcade)', fontSize: '28px', color: '#FFF',
          margin: '0 0 8px', textShadow: '0 2px 12px rgba(0,0,0,0.5)',
        }}>{item.title}</h2>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {year && <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#888' }}>{year}</span>}
          {genres && <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '12px', color: '#A0A0A0' }}>{genres}</span>}
          {studios && <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '11px', color: '#666' }}>by {studios}</span>}
        </div>

        <p style={{
          fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '13px', color: '#A0A0A0',
          margin: '0 0 20px', maxWidth: '500px', lineHeight: '1.6', maxHeight: '56px', overflow: 'hidden',
        }}>{item.overview}</p>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href={`/murastream/tv/${item.id}`} style={{
            background: '#B85CFF', color: '#FFF', padding: '10px 24px', borderRadius: '8px',
            fontFamily: 'var(--font-arcade)', fontSize: '11px', display: 'inline-flex',
            alignItems: 'center', gap: '6px', textDecoration: 'none',
          }}>
            <svg width="14" height="14" fill="#fff" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
            WATCH NOW
          </Link>
        </div>
      </div>
    </div>
  );
}

function AnimeCard({ item }: { item: MediaItem }) {
  const score = (item as MediaItem & { score?: number }).score || item.voteAverage || 0;
  const episodes = (item as MediaItem & { episodes?: number }).episodes;
  const status = (item as MediaItem & { status?: string }).status;
  const genres = (item as MediaItem & { genres?: string[] }).genres?.slice(0, 2);

  return (
    <Link href={`/murastream/tv/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="anime-card">
        <div className="anime-card-poster">
          {item.posterPath ? (
            <img src={item.posterPath} alt={item.title} loading="lazy" />
          ) : (
            <div style={{
              width: '100%', height: '100%', background: 'linear-gradient(135deg, #111, #1A1A2E)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-arcade)', fontSize: '32px', color: '#333',
            }}>🍥</div>
          )}

          {/* Score badge */}
          {score > 0 && (
            <div className="anime-card-score">★ {score.toFixed(1)}</div>
          )}

          {/* Status badge */}
          {status && (
            <div className={`anime-card-status ${status === 'Currently Airing' ? 'airing' : ''}`}>
              {status === 'Currently Airing' ? 'AIRING' : status === 'Finished Airing' ? 'COMPLETED' : 'UPCOMING'}
            </div>
          )}

          {/* Sub/Dub badge */}
          {(item as MediaItem & { hasDub?: boolean }).hasDub && (
            <div style={{
              position: 'absolute', bottom: '8px', left: '8px',
              background: 'rgba(74,222,128,0.85)', color: '#000',
              padding: '2px 6px', borderRadius: '4px',
              fontFamily: 'var(--font-arcade)', fontSize: '7px', fontWeight: 700,
            }}>DUB</div>
          )}

          {/* Hover play overlay */}
          <div className="anime-card-play">
            <svg width="20" height="20" fill="#fff" viewBox="0 0 16 16">
              <path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/>
            </svg>
          </div>
        </div>

        <div className="anime-card-info">
          <p className="anime-card-title">{item.title}</p>
          <div className="anime-card-meta">
            {genres?.map((g, i) => (
              <span key={i} className="anime-card-genre">{g}</span>
            ))}
          </div>
          {episodes && (
            <p className="anime-card-episodes">{episodes} episodes</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function AnimePage() {
  const [featured, setFeatured] = useState<MediaItem | null>(null);
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [seasonal, setSeasonal] = useState<MediaItem[]>([]);
  const [upcoming, setUpcoming] = useState<MediaItem[]>([]);
  const [topAllTime, setTopAllTime] = useState<MediaItem[]>([]);
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [activeGenre, setActiveGenre] = useState<number | null>(null);
  const [genreResults, setGenreResults] = useState<MediaItem[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [audioFilter, setAudioFilter] = useState<'all' | 'sub' | 'dub'>('all');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { animeContinueWatching, markEpisodeWatched, isEpisodeWatched, getAnimeProgress } = useMuraStreamStore();

  const fetchAnime = useCallback(async (action: string, params: Record<string, string> = {}) => {
    const sp = new URLSearchParams({ action, ...params });
    const res = await fetch(`/api/murastream/anime?${sp}`);
    if (!res.ok) throw new Error(`Anime API: ${res.status}`);
    return res.json();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [topRes, trendRes, seasonalRes, upcomingRes] = await Promise.allSettled([
          fetchAnime('top', { limit: '20' }),
          fetchAnime('trending', { limit: '20' }),
          fetchAnime('seasonal', { limit: '20' }),
          fetchAnime('upcoming', { limit: '20' }),
        ]);

        const topData = topRes.status === 'fulfilled' ? topRes.value : { data: [] };
        const trendData = trendRes.status === 'fulfilled' ? trendRes.value : { data: [] };
        const seasonalData = seasonalRes.status === 'fulfilled' ? seasonalRes.value : { data: [] };
        const upcomingData = upcomingRes.status === 'fulfilled' ? upcomingRes.value : { data: [] };

        let topAnime = topData.data || [];
        let trendAnime = trendData.data || [];
        let seasonalAnime = seasonalData.data || [];
        let upcomingAnime = upcomingData.data || [];

        // Fallback: if Jikan returns nothing, use TMDB anime (genre 16, Japanese)
        if (topAnime.length === 0 && trendAnime.length === 0) {
          try {
            const tmdbRes = await fetch('/api/murastream/tmdb?action=trending&type=tv&window=week');
            const tmdbData = await tmdbRes.json();
            const anime = (tmdbData.results || []).filter((item: MediaItem & { genreIds?: number[]; originalLanguage?: string }) =>
              (item.genreIds || []).includes(16) && item.originalLanguage === 'ja'
            );
            if (anime.length > 0) {
              topAnime = anime;
              trendAnime = anime.slice(0, 10);
            }
          } catch { /* empty */ }
        }

        setTopAllTime(topAnime);
        setTrending(trendAnime);
        setSeasonal(seasonalAnime);
        setUpcoming(upcomingAnime);

        // Use top anime as featured
        if (topAnime.length > 0) {
          setFeatured(topAnime[0]);
        }
      } catch (err) {
        console.error('Failed to load anime:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchAnime]);

  // Search with debounce
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await fetchAnime('search', { q: searchQuery, limit: '20' });
        setSearchResults(data.data || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 500);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, fetchAnime]);

  // Genre filter
  const handleGenreClick = async (genreId: number) => {
    if (activeGenre === genreId) {
      setActiveGenre(null);
      setGenreResults([]);
      return;
    }
    setActiveGenre(genreId);
    setGenreLoading(true);
    try {
      const data = await fetchAnime('genre', { genre_id: String(genreId), limit: '20' });
      setGenreResults(data.data || []);
    } catch { setGenreResults([]); }
    setGenreLoading(false);
  };

  return (
    <>
      <style jsx global>{`
        .anime-card {
          width: 200px;
          flex-shrink: 0;
          cursor: pointer;
          transition: transform 0.25s ease;
        }
        .anime-card:hover {
          transform: translateY(-6px);
        }
        .anime-card-poster {
          width: 100%;
          height: 280px;
          border-radius: 10px;
          overflow: hidden;
          position: relative;
          background: #111;
        }
        .anime-card-poster img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .anime-card-score {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(10,10,10,0.85);
          color: #facc15;
          padding: 3px 8px;
          border-radius: 6px;
          font-family: var(--font-arcade);
          font-size: 9px;
          backdrop-filter: blur(4px);
        }
        .anime-card-status {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(10,10,10,0.85);
          color: #A0A0A0;
          padding: 3px 8px;
          border-radius: 6px;
          font-family: var(--font-arcade);
          font-size: 7px;
          letter-spacing: 0.1em;
          backdrop-filter: blur(4px);
        }
        .anime-card-status.airing {
          color: #4ade80;
          border: 1px solid rgba(74,222,128,0.3);
        }
        .anime-card-play {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(184,92,255,0.0);
          opacity: 0;
          transition: all 0.25s ease;
          border-radius: 10px;
        }
        .anime-card:hover .anime-card-play {
          opacity: 1;
          background: rgba(184,92,255,0.25);
        }
        .anime-card-info {
          padding: 8px 2px;
        }
        .anime-card-title {
          margin: 0;
          font-family: "Lucida Sans", Geneva, Verdana, sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: #E5E5E5;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .anime-card-meta {
          display: flex;
          gap: 4px;
          margin-top: 4px;
          flex-wrap: wrap;
        }
        .anime-card-genre {
          font-family: var(--font-arcade);
          font-size: 7px;
          color: #B85CFF;
          background: rgba(184,92,255,0.12);
          padding: 2px 6px;
          border-radius: 3px;
        }
        .anime-card-episodes {
          margin: 4px 0 0;
          font-family: var(--font-arcade);
          font-size: 8px;
          color: #666;
        }
        .anime-row {
          margin-bottom: 32px;
        }
        .anime-row-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .anime-row-title {
          margin: 0;
          font-family: var(--font-arcade);
          font-size: 14px;
          color: #E5E5E5;
          letter-spacing: 0.05em;
        }
        .anime-row-more {
          font-family: var(--font-arcade);
          font-size: 8px;
          color: #B85CFF;
          text-decoration: none;
          opacity: 0.7;
          transition: opacity 0.2s;
        }
        .anime-row-more:hover { opacity: 1; }
        .anime-scroll {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          scroll-behavior: smooth;
          padding-bottom: 8px;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .anime-scroll::-webkit-scrollbar { display: none; }
        .anime-genre-pill {
          padding: 7px 16px;
          border-radius: 20px;
          border: 1px solid #2A2A2A;
          background: #111;
          color: #888;
          font-family: var(--font-arcade);
          font-size: 9px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .anime-genre-pill:hover {
          border-color: rgba(184,92,255,0.3);
          color: #B85CFF;
        }
        .anime-genre-pill.active {
          border-color: #B85CFF;
          background: rgba(184,92,255,0.12);
          color: #B85CFF;
        }
      `}</style>

      <div style={{ padding: '24px 28px', maxWidth: '1100px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#E5E5E5', margin: 0 }}>
              🍥 Anime
            </h1>
          </div>
          <p style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#666', margin: '0 0 20px' }}>
            Discover top-rated anime, seasonal releases, and upcoming series
          </p>

          {/* Search */}
          <div style={{ position: 'relative', maxWidth: '420px' }}>
            <input
              type="text"
              placeholder="Search anime by title..."
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

        {/* Audio + Genre Filter Row */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Sub/Dub Filter */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[{ id: 'all' as const, label: 'ALL' }, { id: 'sub' as const, label: '🇯🇵 SUB' }, { id: 'dub' as const, label: '🇺🇸 DUB' }].map(opt => (
              <button
                key={opt.id}
                onClick={() => setAudioFilter(opt.id)}
                style={{
                  padding: '6px 14px', borderRadius: '8px',
                  border: audioFilter === opt.id ? '1px solid #B85CFF' : '1px solid #2A2A2A',
                  background: audioFilter === opt.id ? 'rgba(184,92,255,0.15)' : '#171717',
                  color: audioFilter === opt.id ? '#B85CFF' : '#888',
                  fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
                  transition: 'all 0.2s', letterSpacing: '0.05em',
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Genre Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', overflowX: 'auto', paddingBottom: '4px' }}>
          {ANIME_GENRES.map(g => (
            <button
              key={g.id}
              className={`anime-genre-pill ${activeGenre === g.id ? 'active' : ''}`}
              onClick={() => handleGenreClick(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>

        {/* Search Results */}
        {searchQuery.trim() && (
          <div style={{ marginBottom: '32px' }}>
            <p className="anime-row-title" style={{ marginBottom: '12px' }}>
              {searching ? 'Searching...' : `Results for "${searchQuery}"`}
            </p>
            {searching ? (
              <MuraStreamLoader fullScreen={false} text="Searching anime..." />
            ) : (
              <div className="anime-scroll">
                {searchResults.map(item => <AnimeCard key={item.id} item={item} />)}
              </div>
            )}
          </div>
        )}

        {/* Genre Results */}
        {activeGenre && !searchQuery.trim() && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <p className="anime-row-title">
                {genreLoading ? 'Loading...' : `${ANIME_GENRES.find(g => g.id === activeGenre)?.name} Anime`}
              </p>
              <button onClick={() => { setActiveGenre(null); setGenreResults([]); }}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px',
                  padding: '4px 10px', fontFamily: 'var(--font-arcade)', fontSize: '7px',
                  color: '#888', cursor: 'pointer',
                }}>✕ Clear</button>
            </div>
            {genreLoading ? (
              <MuraStreamLoader fullScreen={false} text="Loading..." />
            ) : (
              <div className="anime-scroll">
                {genreResults.map(item => <AnimeCard key={item.id} item={item} />)}
              </div>
            )}
          </div>
        )}

        {/* Main Content */}
        {!searchQuery.trim() && !activeGenre && (
          <>
            {/* Loading state */}
            {loading ? (
              <MuraStreamLoader fullScreen={false} text="Loading anime..." />
            ) : (
              <>
                {/* Featured Hero */}
                {featured && <AnimeHero item={featured} />}

                {/* Continue Watching Anime */}
                {animeContinueWatching.length > 0 && (
                  <div className="anime-row">
                    <div className="anime-row-header">
                      <p className="anime-row-title">▶ CONTINUE WATCHING</p>
                    </div>
                    <div className="anime-scroll">
                      {animeContinueWatching.map(prog => {
                        const total = prog.totalEpisodes || 0;
                        const watched = prog.watchedEpisodes.length;
                        const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
                        return (
                          <Link key={prog.id} href={`/murastream/tv/${prog.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div className="anime-card" style={{ width: '200px' }}>
                              <div className="anime-card-poster" style={{ position: 'relative' }}>
                                {prog.posterPath ? (
                                  <img src={prog.posterPath} alt={prog.title} loading="lazy" />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', background: '#111' }} />
                                )}
                                {/* Progress bar */}
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'rgba(0,0,0,0.5)' }}>
                                  <div style={{ height: '100%', background: '#B85CFF', width: `${pct}%`, transition: 'width 0.3s' }} />
                                </div>
                                <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px' }}>
                                  <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#fff', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px' }}>
                                    {watched}/{total || '?'} EP
                                  </span>
                                </div>
                              </div>
                              <div className="anime-card-info">
                                <p className="anime-card-title">{prog.title}</p>
                                <p className="anime-card-episodes">{pct}% watched</p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Helper: filter by sub/dub */}
                {(() => {
                  const filterAudio = (items: MediaItem[]) => {
                    if (audioFilter === 'all') return items;
                    return items.filter(item => {
                      const hasDub = (item as MediaItem & { hasDub?: boolean }).hasDub;
                      const hasSub = (item as MediaItem & { hasSub?: boolean }).hasSub;
                      return audioFilter === 'dub' ? hasDub : hasSub;
                    });
                  };
                  const fSeasonal = filterAudio(seasonal);
                  const fTrending = filterAudio(trending);
                  const fTop = filterAudio(topAllTime);
                  const fUpcoming = filterAudio(upcoming);

                  return (
                    <>
                      {/* Airing Now */}
                      {fSeasonal.length > 0 && (
                        <div className="anime-row">
                          <div className="anime-row-header">
                            <p className="anime-row-title">📺 AIRING NOW</p>
                          </div>
                          <div className="anime-scroll">
                            {fSeasonal.map(item => <AnimeCard key={item.id} item={item} />)}
                          </div>
                        </div>
                      )}

                      {/* Trending */}
                      {fTrending.length > 0 && (
                        <div className="anime-row">
                          <div className="anime-row-header">
                            <p className="anime-row-title">🔥 TRENDING</p>
                          </div>
                          <div className="anime-scroll">
                            {fTrending.map(item => <AnimeCard key={item.id} item={item} />)}
                          </div>
                        </div>
                      )}

                      {/* Top All Time */}
                      {fTop.length > 0 && (
                        <div className="anime-row">
                          <div className="anime-row-header">
                            <p className="anime-row-title">⭐ TOP ALL TIME</p>
                            <Link href="/murastream/search" className="anime-row-more">View All →</Link>
                          </div>
                          <div className="anime-scroll">
                            {fTop.map(item => <AnimeCard key={item.id} item={item} />)}
                          </div>
                        </div>
                      )}

                      {/* Upcoming */}
                      {fUpcoming.length > 0 && (
                        <div className="anime-row">
                          <div className="anime-row-header">
                            <p className="anime-row-title">📅 UPCOMING</p>
                          </div>
                          <div className="anime-scroll">
                            {fUpcoming.map(item => <AnimeCard key={item.id} item={item} />)}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '32px 0 16px', borderTop: '1px solid #1A1A1A', marginTop: '24px' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#444', letterSpacing: '0.1em' }}>
            MURASTREAM ANIME — Powered by MyAnimeList
          </p>
        </div>
      </div>
    </>
  );
}
