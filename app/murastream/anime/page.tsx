'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';
import type { MediaItem } from '../types';
import { DEDUPED_ANIME } from '../data/curated-anime';
import { AnimeHero, AnimeCard, AnimeRow } from '../components/anime';
import MuraStreamLoader from '../components/MuraStreamLoader';
import '../components/anime/anime.css';

const ANIME_GENRES = [
  { id: 1, name: 'Action' }, { id: 2, name: 'Adventure' }, { id: 4, name: 'Comedy' },
  { id: 8, name: 'Drama' }, { id: 10, name: 'Fantasy' }, { id: 14, name: 'Horror' },
  { id: 22, name: 'Romance' }, { id: 24, name: 'Sci-Fi' }, { id: 30, name: 'Sports' },
  { id: 36, name: 'Slice of Life' }, { id: 37, name: 'Supernatural' },
  { id: 40, name: 'Psychological' }, { id: 62, name: 'Isekai' }, { id: 73, name: 'School' },
];

const CURATED_CATEGORIES = [
  { id: 'action', label: '⚔️ Action' }, { id: 'comedy', label: '😂 Comedy' },
  { id: 'romance', label: '💕 Romance' }, { id: 'fantasy', label: '🔮 Fantasy' },
  { id: 'isekai', label: '🌀 Isekai' }, { id: 'sports', label: '⚽ Sports' },
  { id: 'school', label: '🏫 School' }, { id: 'slice_of_life', label: '🍃 Slice of Life' },
];

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
  const [curatedFilter, setCuratedFilter] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { animeContinueWatching } = useMuraStreamStore();

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

        let topAnime = topRes.status === 'fulfilled' ? topRes.value.data || [] : [];
        let trendAnime = trendRes.status === 'fulfilled' ? trendRes.value.data || [] : [];
        let seasonalAnime = seasonalRes.status === 'fulfilled' ? seasonalRes.value.data || [] : [];
        let upcomingAnime = upcomingRes.status === 'fulfilled' ? upcomingRes.value.data || [] : [];

        if (topAnime.length === 0 && trendAnime.length === 0) {
          try {
            const tmdbRes = await fetch('/api/murastream/tmdb?action=trending&type=tv&window=week');
            const tmdbData = await tmdbRes.json();
            const anime = (tmdbData.results || []).filter((item: MediaItem) =>
              (item.genreIds || []).includes(16) && item.originalLanguage === 'ja'
            );
            if (anime.length > 0) { topAnime = anime; trendAnime = anime.slice(0, 10); }
          } catch { /* empty */ }
        }

        setTopAllTime(topAnime);
        setTrending(trendAnime);
        setSeasonal(seasonalAnime);
        setUpcoming(upcomingAnime);
        if (topAnime.length > 0) setFeatured(topAnime[0]);
      } catch (err) {
        console.error('Failed to load anime:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchAnime]);

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

  const handleGenreClick = async (genreId: number) => {
    if (activeGenre === genreId) { setActiveGenre(null); setGenreResults([]); return; }
    setActiveGenre(genreId);
    setGenreLoading(true);
    try {
      const data = await fetchAnime('genre', { genre_id: String(genreId), limit: '20' });
      setGenreResults(data.data || []);
    } catch { setGenreResults([]); }
    setGenreLoading(false);
  };

  const filterAudio = (items: MediaItem[]) => {
    if (audioFilter === 'all') return items;
    return items.filter(item =>
      audioFilter === 'dub' ? (item as MediaItem & { hasDub?: boolean }).hasDub : (item as MediaItem & { hasSub?: boolean }).hasSub
    );
  };

  const getCuratedItems = (category: string): MediaItem[] =>
    (curatedFilter ? DEDUPED_ANIME.filter(a => a.categories.includes(curatedFilter)) : DEDUPED_ANIME.filter(a => a.categories.includes(category))) as unknown as MediaItem[];

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#E5E5E5', margin: '0 0 4px' }}>
          🍥 Anime
        </h1>
        <p style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#666', margin: '0 0 20px' }}>
          Discover top-rated anime, seasonal releases, and upcoming series
        </p>

        {/* Search */}
        <div style={{ position: 'relative', maxWidth: '420px' }}>
          <input
            type="text" placeholder="Search anime by title..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '12px 16px 12px 40px',
              background: '#171717', border: '1px solid #2A2A2A', borderRadius: '10px',
              color: '#E5E5E5', fontSize: '13px',
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

      {/* Audio Filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        {[{ id: 'all' as const, label: 'ALL' }, { id: 'sub' as const, label: '🇯🇵 SUB' }, { id: 'dub' as const, label: '🇺🇸 DUB' }].map(opt => (
          <button key={opt.id} onClick={() => setAudioFilter(opt.id)} style={{
            padding: '6px 14px', borderRadius: '8px',
            border: audioFilter === opt.id ? '1px solid #B85CFF' : '1px solid #2A2A2A',
            background: audioFilter === opt.id ? 'rgba(184,92,255,0.15)' : '#171717',
            color: audioFilter === opt.id ? '#B85CFF' : '#888',
            fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
            transition: 'all 0.2s', letterSpacing: '0.05em',
          }}>{opt.label}</button>
        ))}
      </div>

      {/* Genre Pills */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', overflowX: 'auto', paddingBottom: '4px' }}>
        {ANIME_GENRES.map(g => (
          <button key={g.id} className={`anime-genre-pill ${activeGenre === g.id ? 'active' : ''}`}
            onClick={() => handleGenreClick(g.id)}>{g.name}</button>
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
            <button onClick={() => { setActiveGenre(null); setGenreResults([]); }} style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px',
              padding: '4px 10px', fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#888', cursor: 'pointer',
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
        loading ? (
          <MuraStreamLoader fullScreen={false} text="Loading anime..." />
        ) : (
          <>
            {featured && <AnimeHero item={featured} />}

            {/* Continue Watching */}
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
                      <a key={prog.id} href={`/murastream/tv/${prog.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div className="anime-card" style={{ width: '200px' }}>
                          <div className="anime-card-poster" style={{ position: 'relative' }}>
                            {prog.posterPath ? (
                              <img src={prog.posterPath} alt={prog.title} loading="lazy" />
                            ) : (
                              <div style={{ width: '100%', height: '100%', background: '#111' }} />
                            )}
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
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            <AnimeRow title="📺 AIRING NOW" items={filterAudio(seasonal)} />
            <AnimeRow title="🔥 TRENDING" items={filterAudio(trending)} />
            <AnimeRow title="⭐ TOP ALL TIME" items={filterAudio(topAllTime)} moreHref="/murastream/search" />
            <AnimeRow title="📅 UPCOMING" items={filterAudio(upcoming)} />
          </>
        )
      )}

      {/* Curated Library */}
      {!searchQuery.trim() && !activeGenre && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button onClick={() => setCuratedFilter(null)} style={{
              padding: '7px 16px', borderRadius: '20px',
              border: curatedFilter === null ? '1px solid #B85CFF' : '1px solid #2A2A2A',
              background: curatedFilter === null ? 'rgba(184,92,255,0.15)' : '#111',
              color: curatedFilter === null ? '#B85CFF' : '#888',
              fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer',
              transition: 'all 0.2s', whiteSpace: 'nowrap',
            }}>⭐ All Popular</button>
            {CURATED_CATEGORIES.map(opt => (
              <button key={opt.id} onClick={() => setCuratedFilter(curatedFilter === opt.id ? null : opt.id)} style={{
                padding: '7px 16px', borderRadius: '20px',
                border: curatedFilter === opt.id ? '1px solid #B85CFF' : '1px solid #2A2A2A',
                background: curatedFilter === opt.id ? 'rgba(184,92,255,0.15)' : '#111',
                color: curatedFilter === opt.id ? '#B85CFF' : '#888',
                fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer',
                transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}>{opt.label}</button>
            ))}
          </div>

          <AnimeRow title="🔥 POPULAR NOW" items={getCuratedItems('trending')} />

          {curatedFilter === null && (
            <AnimeRow title="⭐ ALL-TIME CLASSICS" items={DEDUPED_ANIME.filter(a => a.categories.includes('top') && !a.categories.includes('trending')) as unknown as MediaItem[]} />
          )}

          {curatedFilter && curatedFilter !== 'trending' && (
            <AnimeRow title={curatedFilter.replace('_', ' ').toUpperCase()} items={DEDUPED_ANIME.filter(a => a.categories.includes(curatedFilter)) as unknown as MediaItem[]} />
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '32px 0 16px', borderTop: '1px solid #1A1A1A', marginTop: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#444', letterSpacing: '0.1em' }}>
          MURASTREAM ANIME — Powered by MyAnimeList
        </p>
      </div>
    </div>
  );
}
