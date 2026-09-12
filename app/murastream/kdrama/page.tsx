'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';
import { DRAMA_SECTIONS, type DramaSection } from '../data/dramas';
import type { MediaItem } from '../types';

// K-Drama / C-Drama / J-Drama browse page with infinite scroll and a
// featured hero for the top result of the current filter set.

// TMDB TV genre ids — chosen to return solid result sets for Asian TV.
// (TMDB tags most modern K-dramas as Drama(18) only; narrow chips like
// Romance(10749) can return zero rows when combined with a year filter.)
const GENRES: { id: string; label: string }[] = [
  { id: '', label: 'All Genres' },
  { id: '18', label: 'Drama' },
  { id: '35', label: 'Comedy' },
  { id: '10759', label: 'Action & Adventure' },
  { id: '10765', label: 'Sci-Fi & Fantasy' },
  { id: '9648', label: 'Mystery' },
];

const YEARS = ['All Years', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2016', '2014'];

const SORTS: { id: string; label: string }[] = [
  { id: 'popularity.desc', label: 'Most Popular' },
  { id: 'vote_average.desc', label: 'Top Rated' },
  { id: 'first_air_date.desc', label: 'Newest' },
];

export default function DramaBrowsePage() {
  const [section, setSection] = useState<DramaSection>(DRAMA_SECTIONS[0]);
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('All Years');
  const [sort, setSort] = useState('popularity.desc');

  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const buildUrl = useCallback((p: number, sortBy?: string) => {
    const effectiveSort = sortBy ?? sort;
    const sp = new URLSearchParams({
      action: 'discover',
      type: 'tv',
      with_original_language: section.lang,
      vote_count_gte: effectiveSort === 'vote_average.desc' ? '200' : '20',
      sort_by: effectiveSort,
      page: String(p),
    });
    if (genre) sp.set('with_genres', genre);
    if (year !== 'All Years') sp.set('first_air_date_year', year);
    return `/api/murastream/tmdb?${sp}`;
  }, [section, genre, year, sort]);

  // Reset + load page 1 whenever filters change
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setPage(1);
    (async () => {
      try {
        const res = await fetch(buildUrl(1), { signal: controller.signal });
        const data = res.ok ? await res.json() : { results: [], total_pages: 0 };
        if (controller.signal.aborted) return;
        setItems(data.results || []);
        setHasMore((data.total_pages || 0) > 1);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setItems([]);
        setHasMore(false);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [buildUrl]);

  // Load next page
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetch(buildUrl(next));
      const data = res.ok ? await res.json() : { results: [], total_pages: 0 };
      setItems(prev => {
        const seen = new Set(prev.map(i => i.id));
        return [...prev, ...(data.results || []).filter((r: MediaItem) => !seen.has(r.id))];
      });
      setPage(next);
      setHasMore((data.total_pages || 0) > next);
    } catch { /* keep current state */ }
    finally { setLoadingMore(false); }
  }, [page, hasMore, loadingMore, buildUrl]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '600px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  const hero = items[0] || null;

  return (
    <div className="ms-page-enter" style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <h1 style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 28, fontWeight: 800, color: 'var(--ms-text-strong)', margin: '0 0 6px',
      }}>
        {section.label}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--ms-text-muted)', margin: '0 0 24px' }}>
        Asian drama series — full catalog, sorted and filtered your way.
      </p>

      {/* Section switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {DRAMA_SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s)} style={{
            padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
            border: section.id === s.id ? '1px solid rgba(229,9,20,0.4)' : '1px solid rgba(255,255,255,0.06)',
            background: section.id === s.id ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.03)',
            color: section.id === s.id ? '#E50914' : 'var(--ms-text-dim)',
            fontFamily: '-apple-system, sans-serif', fontSize: 13, fontWeight: 600,
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {GENRES.map(g => (
          <button key={g.id || 'all'} onClick={() => setGenre(g.id)} style={{
            padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
            border: genre === g.id ? '1px solid rgba(229,9,20,0.4)' : '1px solid rgba(255,255,255,0.06)',
            background: genre === g.id ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.03)',
            color: genre === g.id ? '#E50914' : 'var(--ms-text-dim)',
          }}>
            {g.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={year} onChange={e => setYear(e.target.value)} style={{
          background: 'var(--ms-surface-2)', color: 'var(--ms-text)', border: '1px solid var(--ms-border-2)',
          borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', outline: 'none',
        }}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={{
          background: 'var(--ms-surface-2)', color: 'var(--ms-text)', border: '1px solid var(--ms-border-2)',
          borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', outline: 'none',
        }}>
          {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <MuraStreamLoader fullScreen={false} text="Loading dramas..." />
      ) : (
        <>
          {/* Featured hero — top result of the current filter set */}
          {hero && hero.backdropPath && (
            <div style={{
              position: 'relative', borderRadius: 16, overflow: 'hidden',
              marginBottom: 32, minHeight: 300, background: 'var(--ms-surface)', border: '1px solid var(--ms-border)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero.backdropPath} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', opacity: 0.5,
              }} />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.55) 55%, transparent 100%)',
              }} />
              <div style={{ position: 'relative', padding: '44px 40px', maxWidth: 580 }}>
                <span style={{
                  display: 'inline-block', background: 'rgba(229,9,20,0.9)', color: '#fff',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  padding: '4px 10px', borderRadius: 6, marginBottom: 14,
                }}>
                  {section.label.toUpperCase()} · #1 TRENDING
                </span>
                <h2 style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 8px', lineHeight: 1.15,
                }}>
                  {hero.title}
                </h2>
                <div style={{ fontSize: 13, color: '#D0D0D0', marginBottom: 10 }}>
                  {hero.year}{hero.voteAverage ? ` · ★ ${hero.voteAverage.toFixed(1)}` : ''}
                </div>
                {hero.overview && (
                  <p style={{
                    fontSize: 13, color: '#C8C8C8', lineHeight: 1.6, margin: '0 0 20px',
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {hero.overview}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Link href={`/murastream/watch?type=tv&id=${hero.id}&season=1&episode=1`} style={{
                    background: '#E50914', color: '#fff', border: 'none', borderRadius: 10,
                    padding: '12px 24px', fontSize: 14, fontWeight: 700, textDecoration: 'none',
                    boxShadow: '0 4px 20px rgba(229,9,20,0.35)',
                  }}>
                    ▶ Watch Now
                  </Link>
                  <Link href={`/murastream/tv/${hero.id}`} style={{
                    background: 'rgba(255,255,255,0.08)', color: '#fff',
                    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
                    padding: '12px 24px', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                    backdropFilter: 'blur(8px)',
                  }}>
                    Details & Episodes
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Paginated grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
            {items.map(item => <MuraStreamCard key={item.id} item={item} />)}
          </div>

          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--ms-text-faint)' }}>
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: 'var(--ms-text-muted)' }}>
                No dramas match these filters
              </p>
              <p style={{ fontSize: 13, margin: 0 }}>
                Try clearing the genre or year — Asian dramas are often tagged simply as &ldquo;Drama&rdquo;.
              </p>
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {loadingMore && (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ms-text-faint)', fontSize: 13 }}>
              Loading more…
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <div style={{ textAlign: 'center', padding: '24px', color: '#444', fontSize: 12 }}>
              You&apos;ve reached the end — {items.length} titles
            </div>
          )}
        </>
      )}
    </div>
  );
}
