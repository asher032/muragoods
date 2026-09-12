'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';
import { FilmIcon, TvIcon, SparklesIcon } from '../components/MuraStreamIcons';
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

  const setFilter = (key: string, value: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (!value || value === 'All Years') sp.delete(key);
    else sp.set(key, value);
    router.replace(`/murastream/genres?${sp.toString()}`, { scroll: false });
  };

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

      {/* Genre chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
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
