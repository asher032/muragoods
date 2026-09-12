'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';
import { FilmIcon, TvIcon, SparklesIcon, ShuffleIcon } from '../components/MuraStreamIcons';
import type { MediaItem } from '../types';

// Genre browse — the drama browse experience generalized to all movies and
// TV. Type toggle (Movies / TV Shows), TMDB genre chips, year + sort filters,
// infinite scroll, "More like this" rows, and a Surprise Me pick.
// All filters persist in the URL (?type=&genre=&year=&sort=) so filtered
// views are shareable links.

type Genre = { id: number; name: string };

const YEARS = ['All Years', ...Array.from({ length: 13 }, (_, i) => String(2026 - i))];
const SORTS = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'vote_average.desc', label: 'Top Rated' },
  { value: 'primary_release_date.desc', label: 'Newest' },
];

function GenreBrowseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filters initialize from (and write back to) the URL.
  const type = (searchParams.get('type') === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
  const genre = searchParams.get('genre') || '';
  const year = searchParams.get('year') || 'All Years';
  const sort = searchParams.get('sort') || 'popularity.desc';

  const [genres, setGenres] = useState<Genre[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [surprising, setSurprising] = useState(false);
  // Daily hero + chip keyboard nav
  const [hero, setHero] = useState<MediaItem | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const setFilter = (key: string, value: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (!value || value === 'All Years') sp.delete(key);
    else sp.set(key, value);
    // Remember the resulting filter set per user (restored on next visit
    // when the URL carries no explicit filters).
    try {
      localStorage.setItem('ms-genre-filters', JSON.stringify({
        type: sp.get('type') || 'movie',
        genre: sp.get('genre') || '',
        year: sp.get('year') || 'All Years',
        sort: sp.get('sort') || 'popularity.desc',
      }));
    } catch { /* empty */ }
    router.replace(`/murastream/genres?${sp.toString()}`, { scroll: false });
  };

  // Restore last-used filters on first visit without explicit URL params.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (searchParams.toString()) return; // explicit URL wins
    try {
      const saved = JSON.parse(localStorage.getItem('ms-genre-filters') || 'null') as
        { type?: string; genre?: string; year?: string; sort?: string } | null;
      if (!saved) return;
      const sp = new URLSearchParams();
      if (saved.type === 'tv') sp.set('type', 'tv');
      if (saved.genre) sp.set('genre', saved.genre);
      if (saved.year && saved.year !== 'All Years') sp.set('year', saved.year);
      if (saved.sort && saved.sort !== 'popularity.desc') sp.set('sort', saved.sort);
      if ([...sp.keys()].length) router.replace(`/murastream/genres?${sp.toString()}`, { scroll: false });
    } catch { /* empty */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Genre list per type (TMDB genre ids differ between movie and TV).
  useEffect(() => {
    fetch(`/api/murastream/tmdb?action=genres&type=${type}`)
      .then(r => (r.ok ? r.json() : { genres: [] }))
      .then(d => setGenres((d.genres || []).filter((g: Genre) => g.id > 0)))
      .catch(() => setGenres([]));
  }, [type]);

  const buildUrl = useCallback((p: number) => {
    const sp = new URLSearchParams({
      action: 'discover',
      type,
      sort_by: sort,
      page: String(p),
      'vote_count.gte': sort === 'vote_average.desc' ? '200' : '20',
    });
    if (genre) sp.set('with_genres', genre);
    if (year !== 'All Years') {
      // The discover route accepts both year params; send the right one.
      sp.set(type === 'movie' ? 'primary_release_year' : 'first_air_date_year', year);
    }
    return `/api/murastream/tmdb?${sp}`;
  }, [type, genre, year, sort]);

  // Reset + load page 1 whenever filters change
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPage(1);
    setHasMore(true);
    fetch(buildUrl(1), { signal: controller.signal })
      .then(r => (r.ok ? r.json() : { results: [] }))
      .then(d => {
        const results: MediaItem[] = d.results || [];
        setItems(results);
        setHasMore((d.total_pages || 1) > 1 && results.length > 0);
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') { setItems([]); setLoading(false); }
      });
    return () => controller.abort();
  }, [buildUrl]);

  // Infinite scroll
  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      const next = page + 1;
      setLoadingMore(true);
      fetch(buildUrl(next))
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(d => {
          const results: MediaItem[] = d.results || [];
          setItems(prev => {
            const seen = new Set(prev.map(i => i.id));
            return [...prev, ...results.filter(r => !seen.has(r.id))];
          });
          setHasMore(results.length > 0 && next < (d.total_pages || 1));
          setPage(next);
          setLoadingMore(false);
        })
        .catch(() => setLoadingMore(false));
    }, { rootMargin: '600px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, page, buildUrl]);

  // Surprise Me: pull extra top-rated pages beyond page 1, pick a random
  // well-rated title from the current filters, open its detail page.
  const surprise = useCallback(async () => {
    if (surprising) return;
    setSurprising(true);
    try {
      const pool: MediaItem[] = [];
      for (let p = 1; p <= 3; p++) {
        const sp = new URLSearchParams(buildUrl(1));
        sp.set('sort_by', 'vote_average.desc');
        sp.set('vote_count.gte', '300');
        sp.set('page', String(p));
        const res = await fetch(`/api/murastream/tmdb?${sp}`);
        if (res.ok) pool.push(...((await res.json()).results as MediaItem[]));
      }
      const top = pool.filter(t => (t.voteAverage ?? 0) >= 7);
      const candidates = top.length ? top : pool;
      if (candidates.length) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        router.push(`/murastream/${type}/${chosen.id}`);
      }
    } finally {
      setSurprising(false);
    }
  }, [buildUrl, router, surprising, type]);

  // "More like this": up to 3 extra rows of well-rated titles from the
  // current genre, drawn from pages 2–4 of a rating-sorted query so they
  // don't just repeat the main grid.
  const likeRows = useMemo(() => {
    if (!genre) return [];
    const names: Record<string, string> = {};
    genres.forEach(g => { names[String(g.id)] = g.name; });
    return [
      { key: 'critics', title: `Critically Acclaimed ${names[genre] || ''}` },
      { key: 'hidden', title: `Hidden Gems in ${names[genre] || ''}` },
      { key: 'crowd', title: `Crowd Pleasers — ${names[genre] || ''}` },
    ];
  }, [genre, genres]);

  const [rowItems, setRowItems] = useState<Record<string, MediaItem[]>>({});
  useEffect(() => {
    if (likeRows.length === 0) { setRowItems({}); return; }
    const controller = new AbortController();
    const base = new URLSearchParams(buildUrl(1));
    base.set('sort_by', 'vote_average.desc');
    const fetchRow = async (startPage: number) => {
      const sp = new URLSearchParams(base);
      sp.set('page', String(startPage));
      const res = await fetch(`/api/murastream/tmdb?${sp}`, { signal: controller.signal });
      if (!res.ok) return [] as MediaItem[];
      const d = await res.json();
      return (d.results as MediaItem[]).filter((t: MediaItem) => (t.voteAverage ?? 0) >= 6.5).slice(0, 14);
    };
    Promise.all(likeRows.map((_, i) => fetchRow(i + 2)))
      .then(rows => {
        if (controller.signal.aborted) return;
        const next: Record<string, MediaItem[]> = {};
        likeRows.forEach((row, i) => { next[row.key] = rows[i]; });
        setRowItems(next);
      })
      .catch(() => { /* keep previous */ });
    return () => controller.abort();
  }, [likeRows, buildUrl]);

  // Daily hero: seed = today's date, so every user sees the same pick per
  // day; it rotates through the current top-rated pool as filters change.
  useEffect(() => {
    if (loading) return;
    if (items.length < 5) { setHero(null); return; }
    const pool = items.filter(t => (t.voteAverage ?? 0) >= 6.5 && t.backdropPath);
    if (pool.length === 0) { setHero(null); return; }
    const seedBase = `${type}|${genre}|${new Date().toISOString().slice(0, 10)}`;
    let h = 0;
    for (let i = 0; i < seedBase.length; i++) h = (h * 31 + seedBase.charCodeAt(i)) >>> 0;
    setHero(pool[h % pool.length]);
  }, [items, loading, type, genre]);

  const typeName = type === 'movie' ? 'Movies' : 'TV Shows';
  const genreName = genres.find(g => String(g.id) === genre)?.name;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <h1 style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 28, fontWeight: 800, color: 'var(--ms-text-strong)', margin: '0 0 6px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {type === 'movie' ? <FilmIcon size={24} color="#E50914" /> : <TvIcon size={24} color="#E50914" />}
        Browse by Genre
      </h1>
      <p style={{ fontSize: 14, color: 'var(--ms-text-muted)', margin: '0 0 20px' }}>
        Every movie and TV show, filtered your way.
      </p>

      {/* Type toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['movie', 'tv'] as const).map(t => (
          <button key={t} onClick={() => { setFilter('type', t); setFilter('genre', ''); }}
            style={{
              padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
              border: type === t ? '1px solid rgba(229,9,20,0.5)' : '1px solid var(--ms-line)',
              background: type === t ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.03)',
              color: type === t ? '#E50914' : 'var(--ms-text-dim)',
              fontFamily: '-apple-system, sans-serif', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {t === 'movie' ? <FilmIcon size={14} /> : <TvIcon size={14} />}
            {t === 'movie' ? 'Movies' : 'TV Shows'}
          </button>
        ))}
      </div>

      {/* Daily rotating hero */}
      {hero && (
        <div style={{
          position: 'relative', borderRadius: 16, overflow: 'hidden', marginBottom: 24,
          minHeight: 220, background: 'var(--ms-surface)', border: '1px solid var(--ms-border)',
        }}>
          {hero.backdropPath && (
            <img src={hero.backdropPath} alt="" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover',
            }} />
          )}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.15) 100%)',
          }} />
          <div style={{
            position: 'relative', zIndex: 1, padding: '26px 28px', maxWidth: 640, minHeight: 220,
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
              background: '#E50914', color: '#fff', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', padding: '4px 10px', borderRadius: 6,
            }}>
              <SparklesIcon size={11} /> TOP PICK FOR TODAY
            </span>
            <h2 style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 26, fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.2,
            }}>{hero.title}</h2>
            <p style={{
              fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0,
              display: 'flex', gap: 10, alignItems: 'center',
            }}>
              <span style={{ color: '#E50914', fontWeight: 700 }}>★ {Math.round((hero.voteAverage ?? 0) * 10) / 10}</span>
              {hero.year && <span>{hero.year}</span>}
              {genreName && <span>{genreName}</span>}
            </p>
            {hero.overview && (
              <p style={{
                fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.5,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>{hero.overview}</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href={`/murastream/watch?type=${hero.mediaType || type}&id=${hero.id}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: '#E50914', color: '#fff', padding: '10px 20px', borderRadius: 9,
                fontFamily: '-apple-system, sans-serif', fontSize: 13, fontWeight: 700,
                textDecoration: 'none', boxShadow: '0 4px 18px rgba(229,9,20,0.4)',
              }}>
                <svg width="13" height="13" fill="#fff" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
                Watch Now
              </Link>
              <Link href={`/murastream/${hero.mediaType || type}/${hero.id}`} style={{
                display: 'inline-flex', alignItems: 'center',
                border: '1px solid rgba(255,255,255,0.35)', color: '#fff',
                padding: '10px 18px', borderRadius: 9, textDecoration: 'none',
                fontFamily: '-apple-system, sans-serif', fontSize: 13, fontWeight: 600,
              }}>
                Details
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Genre chips — arrow keys navigate, Enter/Space selects */}
      <div
        ref={chipsRef}
        role="toolbar"
        aria-label="Filter by genre"
        tabIndex={0}
        onKeyDown={e => {
          const buttons = Array.from(chipsRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
          if (buttons.length === 0) return;
          const currentIndex = buttons.findIndex(b => b === document.activeElement);
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            buttons[(currentIndex + 1 + buttons.length) % buttons.length]?.focus();
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            buttons[(currentIndex - 1 + buttons.length) % buttons.length]?.focus();
          } else if (e.key === 'Home') {
            e.preventDefault();
            buttons[0]?.focus();
          } else if (e.key === 'End') {
            e.preventDefault();
            buttons[buttons.length - 1]?.focus();
          }
        }}
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, outline: 'none' }}
      >
        <button onClick={() => setFilter('genre', '')} style={chipStyle(genre === '')}>All</button>
        {genres.map(g => (
          <button key={g.id} onClick={() => setFilter('genre', String(g.id))} style={chipStyle(genre === String(g.id))}>
            {g.name}
          </button>
        ))}
      </div>

      {/* Year + sort + Surprise Me */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={year} onChange={e => setFilter('year', e.target.value)} style={selectStyle}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={sort} onChange={e => setFilter('sort', e.target.value)} style={selectStyle}>
          {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button onClick={surprise} disabled={surprising} style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '8px 16px', borderRadius: 8, cursor: surprising ? 'wait' : 'pointer',
          border: '1px solid rgba(229,9,20,0.5)', background: 'rgba(229,9,20,0.12)',
          color: '#E50914', fontFamily: '-apple-system, sans-serif', fontSize: 13, fontWeight: 700,
        }}>
          <SparklesIcon size={14} />
          {surprising ? 'Picking…' : 'Surprise Me'}
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <MuraStreamLoader fullScreen={false} text="Loading titles..." />
      ) : items.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '56px 20px', color: 'var(--ms-text-faint)',
          background: 'var(--ms-surface)', borderRadius: 14, border: '1px solid var(--ms-border)',
        }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ms-text)', margin: '0 0 6px' }}>
            Nothing matches these filters
          </p>
          <p style={{ fontSize: 13, margin: 0 }}>
            Try removing the year or picking a different genre.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '22px 16px',
        }}>
          {items.map(item => (
            <MuraStreamCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && (
        <p style={{ textAlign: 'center', color: 'var(--ms-text-faint)', fontSize: 13, padding: '16px 0' }}>
          Loading more…
        </p>
      )}
      {!hasMore && items.length > 0 && (
        <p style={{ textAlign: 'center', color: 'var(--ms-text-ghost)', fontSize: 12, padding: '16px 0' }}>
          You&apos;ve reached the end — {items.length} titles
        </p>
      )}

      {/* More like this — extra rows from the current genre */}
      {likeRows.map(row => (
        rowItems[row.key]?.length ? (
          <section key={row.key} style={{ marginTop: 44 }}>
            <h2 style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 18, fontWeight: 700, color: 'var(--ms-text-strong)', margin: '0 0 16px',
            }}>
              {row.title}
            </h2>
            <div className="ms-scroll" style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
              {rowItems[row.key].map(item => (
                <MuraStreamCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null
      ))}

      {likeRows.length > 0 && !rowItems[likeRows[0].key] && !loading && (
        <p style={{ textAlign: 'center', color: 'var(--ms-text-ghost)', fontSize: 12, marginTop: 32 }}>
          Finding more {genreName || ''} {typeName.toLowerCase()} you might like…
        </p>
      )}
    </div>
  );
}

export default function GenreBrowsePage() {
  return (
    <Suspense fallback={<MuraStreamLoader fullScreen={false} text="Loading..." />}>
      <GenreBrowseContent />
    </Suspense>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    border: active ? '1px solid rgba(229,9,20,0.5)' : '1px solid var(--ms-border-2)',
    background: active ? 'rgba(229,9,20,0.15)' : 'transparent',
    color: active ? '#E50914' : 'var(--ms-text-dim)',
    fontFamily: '-apple-system, sans-serif',
  };
}

const selectStyle: React.CSSProperties = {
  background: 'var(--ms-surface-2)', border: '1px solid var(--ms-border-2)', borderRadius: 8,
  color: 'var(--ms-text)', padding: '8px 12px', fontSize: 13, cursor: 'pointer',
  fontFamily: '-apple-system, sans-serif',
};
