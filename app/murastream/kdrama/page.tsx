'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';
import { DRAMA_SECTIONS, type DramaSection } from '../data/dramas';
import type { MediaItem } from '../types';

// TMDB TV genre ids mapped to friendly chips
const GENRES: { id: string; label: string }[] = [
  { id: '', label: 'All Genres' },
  { id: '18', label: 'Drama' },
  { id: '35', label: 'Comedy' },
  { id: '10749', label: 'Romance' },
  { id: '80', label: 'Thriller' },
  { id: '10759', label: 'Action' },
  { id: '10765', label: 'Fantasy' },
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

  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [topRated, setTopRated] = useState<MediaItem[]>([]);
  const [newest, setNewest] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const base = (extra: Record<string, string>) => {
      const sp = new URLSearchParams({
        action: 'discover',
        type: 'tv',
        with_original_language: section.lang,
        vote_count_gte: sort === 'vote_average.desc' ? '200' : '20',
        ...extra,
      });
      if (genre) sp.set('with_genres', genre);
      if (year !== 'All Years') sp.set('first_air_date_year', year);
      return `/api/murastream/tmdb?${sp}`;
    };

    try {
      const [tRes, rRes, nRes] = await Promise.allSettled([
        fetch(base({ sort_by: 'popularity.desc' }), { signal: controller.signal }),
        fetch(base({ sort_by: 'vote_average.desc' }), { signal: controller.signal }),
        fetch(base({ sort_by: 'first_air_date.desc' }), { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      setTrending(tRes.status === 'fulfilled' && tRes.value.ok ? (await tRes.value.json()).results || [] : []);
      setTopRated(rRes.status === 'fulfilled' && rRes.value.ok ? (await rRes.value.json()).results || [] : []);
      setNewest(nRes.status === 'fulfilled' && nRes.value.ok ? (await nRes.value.json()).results || [] : []);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [section, genre, year, sort]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const Grid = ({ items }: { items: MediaItem[] }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
      {items.map(item => <MuraStreamCard key={item.id} item={item} />)}
    </div>
  );

  return (
    <div className="ms-page-enter" style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <h1 style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 28, fontWeight: 800, color: '#F5F5F5', margin: '0 0 6px',
      }}>
        {section.flag} {section.label}
      </h1>
      <p style={{ fontSize: 14, color: '#A0A0A0', margin: '0 0 24px' }}>
        Asian drama series — full catalog, sorted and filtered your way.
      </p>

      {/* Section switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {DRAMA_SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s)} style={{
            padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
            border: section.id === s.id ? '1px solid rgba(184,92,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
            background: section.id === s.id ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.03)',
            color: section.id === s.id ? '#B85CFF' : '#888',
            fontFamily: '-apple-system, sans-serif', fontSize: 13, fontWeight: 600,
          }}>
            {s.flag} {s.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {GENRES.map(g => (
          <button key={g.id || 'all'} onClick={() => setGenre(g.id)} style={{
            padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
            border: genre === g.id ? '1px solid rgba(184,92,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
            background: genre === g.id ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.03)',
            color: genre === g.id ? '#B85CFF' : '#888',
          }}>
            {g.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={year} onChange={e => setYear(e.target.value)} style={{
          background: '#171717', color: '#E5E5E5', border: '1px solid #2A2A2A',
          borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', outline: 'none',
        }}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={{
          background: '#171717', color: '#E5E5E5', border: '1px solid #2A2A2A',
          borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', outline: 'none',
        }}>
          {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <MuraStreamLoader fullScreen={false} text="Loading dramas..." />
      ) : (
        <>
          <Row title="🔥 Trending Now" items={trending} Grid={Grid} />
          <Row title="🏆 Top Rated" items={topRated} Grid={Grid} />
          <Row title="🆕 Newest Releases" items={newest} Grid={Grid} />
        </>
      )}
    </div>
  );
}

function Row({ title, items, Grid }: { title: string; items: MediaItem[]; Grid: (p: { items: MediaItem[] }) => React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 44 }}>
      <h2 style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 17, fontWeight: 700, color: '#F5F5F5', margin: '0 0 16px',
      }}>{title}</h2>
      <Grid items={items} />
    </div>
  );
}
