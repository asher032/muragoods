'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';
import type { MediaItem } from '../types';

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

type SearchState = 'idle' | 'loading' | 'success' | 'error' | 'no-results';

export default function MuraStreamSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [activeGenre, setActiveGenre] = useState('all');
  const [searchType, setSearchType] = useState<'multi' | 'movie' | 'tv'>('multi');
  const [errorMessage, setErrorMessage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef('');

  const doSearch = useCallback(async (q: string, type: string, signal?: AbortSignal) => {
    if (!q.trim()) {
      setResults([]);
      setSearchState('idle');
      return;
    }

    // Don't re-search the same query
    if (q === lastQueryRef.current && results.length > 0) return;
    lastQueryRef.current = q;

    setSearchState('loading');
    setErrorMessage('');

    try {
      const action = type === 'multi' ? 'search' : `search-${type}`;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 8 second timeout
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`/api/murastream/tmdb?action=${action}&query=${encodeURIComponent(q)}`, {
        signal: signal || controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Search failed (${res.status})`);

      const data = await res.json();
      const items = data.results || [];

      setResults(items);
      setSearchState(items.length > 0 ? 'success' : 'no-results');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Request was cancelled — don't update state
        return;
      }
      console.error('Search error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Search failed. Please try again.');
      setSearchState('error');
      setResults([]);
    }
  }, [results.length]);

  // Debounced search with AbortController
  useEffect(() => {
    // Clear previous timer
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (!query.trim()) {
      setResults([]);
      setSearchState('idle');
      lastQueryRef.current = '';
      return;
    }

    setSearchState('loading');

    searchTimerRef.current = setTimeout(() => {
      doSearch(query, searchType);
    }, 350);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, searchType, doSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const filtered = activeGenre === 'all'
    ? results
    : results.filter(r => r.genreIds?.includes(parseInt(activeGenre)));

  const displayResults = activeGenre === 'all' ? results : filtered;

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '24px', fontWeight: 700, color: '#F5F5F5', margin: '0 0 20px',
      }}>
        Search
      </h1>

      {/* Search input */}
      <div style={{ position: 'relative', maxWidth: '500px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search movies, TV series, anime..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '14px 16px 14px 44px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px', color: '#E5E5E5', fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', outline: 'none',
            transition: 'border-color 0.2s, background 0.2s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(184,92,255,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
        />
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="#555"
          style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }}
          viewBox="0 0 16 16">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10"/>
        </svg>
        {/* Clear button */}
        {query && (
          <button onClick={() => { setQuery(''); lastQueryRef.current = ''; }}
            style={{
              position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
              width: '24px', height: '24px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '14px',
            }}>✕</button>
        )}
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['multi', 'movie', 'tv'] as const).map(type => (
          <button key={type} onClick={() => { setSearchType(type); lastQueryRef.current = ''; }} style={{
            padding: '8px 16px', borderRadius: '8px',
            border: searchType === type ? '1px solid rgba(184,92,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
            background: searchType === type ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.03)',
            color: searchType === type ? '#B85CFF' : '#888',
            fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.2s',
          }}>
            {type === 'multi' ? 'All' : type === 'movie' ? 'Movies' : 'TV Shows'}
          </button>
        ))}
      </div>

      {/* Genre filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }} className="ms-scroll">
        {GENRES.map(g => (
          <button key={g.id} onClick={() => setActiveGenre(g.id)} style={{
            padding: '6px 12px', borderRadius: '6px',
            border: activeGenre === g.id ? '1px solid rgba(184,92,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
            background: activeGenre === g.id ? 'rgba(184,92,255,0.12)' : 'transparent',
            color: activeGenre === g.id ? '#B85CFF' : '#666',
            fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
            whiteSpace: 'nowrap', transition: 'all 0.2s',
          }}>
            {g.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {searchState === 'loading' && (
        <MuraStreamLoader fullScreen={false} text="Searching..." />
      )}

      {searchState === 'error' && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#ef4444' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
            ⚠ Search failed
          </p>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: '#888', marginBottom: '16px' }}>
            {errorMessage}
          </p>
          <button onClick={() => { lastQueryRef.current = ''; doSearch(query, searchType); }}
            style={{
              padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(184,92,255,0.3)',
              background: 'rgba(184,92,255,0.1)', color: '#B85CFF',
              fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}>
            Retry
          </button>
        </div>
      )}

      {searchState === 'no-results' && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
            No results found
          </p>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: '#555' }}>
            Try a different search term or adjust your filters
          </p>
        </div>
      )}

      {searchState === 'success' && displayResults.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
          {displayResults.map(item => <MuraStreamCard key={item.id} item={item} />)}
        </div>
      )}

      {searchState === 'success' && activeGenre !== 'all' && displayResults.length === 0 && results.length > 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: '#888' }}>
            No results match this genre filter
          </p>
        </div>
      )}

      {searchState === 'idle' && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#444' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', marginBottom: '8px', color: '#666' }}>
            Start typing to search
          </p>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: '#555' }}>
            Search for movies, TV series, and anime
          </p>
        </div>
      )}
    </div>
  );
}
