'use client';

import { useState, useEffect, useCallback } from 'react';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';

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
};

const GENRES = [
  { id: 'all', label: 'All' },
  { id: '28', label: 'Action' },
  { id: '35', label: 'Comedy' },
  { id: '18', label: 'Drama' },
  { id: '27', label: 'Horror' },
  { id: '878', label: 'Sci-Fi' },
  { id: '16', label: 'Animation' },
  { id: '10749', label: 'Romance' },
  { id: '53', label: 'Thriller' },
  { id: '99', label: 'Documentary' },
];

export default function MuraStreamSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeGenre, setActiveGenre] = useState('all');
  const [searchType, setSearchType] = useState<'multi' | 'movie' | 'tv'>('multi');

  const doSearch = useCallback(async (q: string, type: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const action = type === 'multi' ? 'search' : `search-${type}`;
      const res = await fetch(`/api/murastream/tmdb?action=${action}&query=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query, searchType), 500);
    return () => clearTimeout(timer);
  }, [query, searchType, doSearch]);

  const filtered = activeGenre === 'all'
    ? results
    : results.filter(r => r.genreIds?.includes(parseInt(activeGenre)));

  return (
    <div style={{ padding: '24px 28px' }}>
      <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#E5E5E5', margin: '0 0 16px' }}>
        SEARCH
      </h1>

      {/* Search input */}
      <div style={{ position: 'relative', maxWidth: '500px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search for movies, TV series, anime..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '14px 16px 14px 44px',
            background: '#171717', border: '1px solid #2A2A2A',
            borderRadius: '10px', color: '#E5E5E5', fontSize: '14px',
            fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = '#B85CFF'}
          onBlur={e => e.currentTarget.style.borderColor = '#2A2A2A'}
        />
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#555"
          style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }}
          viewBox="0 0 16 16">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10"/>
        </svg>
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['multi', 'movie', 'tv'] as const).map(type => (
          <button key={type} onClick={() => setSearchType(type)} style={{
            padding: '6px 14px', borderRadius: '6px',
            border: searchType === type ? '1px solid #B85CFF' : '1px solid #2A2A2A',
            background: searchType === type ? 'rgba(184,92,255,0.12)' : '#171717',
            color: searchType === type ? '#B85CFF' : '#888',
            fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer',
          }}>
            {type === 'multi' ? 'All' : type === 'movie' ? 'Movies' : 'TV'}
          </button>
        ))}
      </div>

      {/* Genre filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
        {GENRES.map(g => (
          <button key={g.id} onClick={() => setActiveGenre(g.id)} style={{
            padding: '4px 10px', borderRadius: '4px',
            border: activeGenre === g.id ? '1px solid rgba(184,92,255,0.4)' : '1px solid #2A2A2A',
            background: activeGenre === g.id ? 'rgba(184,92,255,0.1)' : 'transparent',
            color: activeGenre === g.id ? '#B85CFF' : '#666',
            fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {g.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <MuraStreamLoader fullScreen={false} text="Searching..." />
      ) : filtered.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {filtered.map(item => <MuraStreamCard key={item.id} item={item} />)}
        </div>
      ) : query.trim() ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#555' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>No results found</p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '48px', color: '#444' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', marginBottom: '8px' }}>Start typing to search</p>
          <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px', color: '#555' }}>
            Search for movies, TV series, and anime
          </p>
        </div>
      )}
    </div>
  );
}
