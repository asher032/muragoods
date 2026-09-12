'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';
import type { MediaItem } from '../types';

type SearchState = 'idle' | 'loading' | 'success' | 'error' | 'no-results';

export default function MuraStreamSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'kdrama'>('all');
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef('');

  const doSearch = useCallback(async (q: string, type: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearchState('idle');
      return;
    }

    if (q.trim() === lastQueryRef.current && results.length > 0) return;
    lastQueryRef.current = q.trim();

    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearchState('loading');
    setErrorMessage('');

    try {
      let items: MediaItem[] = [];

      // Single multi-search; K-Drama filter narrows to Korean-language titles.
      const res = await fetch(`/api/murastream/tmdb?action=search&q=${encodeURIComponent(q.trim())}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      items = (data.results || []) as MediaItem[];
      if (type === 'kdrama') {
        items = items.filter(r => r.originalLanguage === 'ko');
      }

      if (controller.signal.aborted) return;

      setResults(items);
      setSearchState(items.length > 0 ? 'success' : 'no-results');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[MuraStream Search]', err);
      setErrorMessage('Search is temporarily unavailable. Please try again.');
      setSearchState('error');
      setResults([]);
    }
  }, [results.length]);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    if (!query.trim()) {
      setResults([]);
      setSearchState('idle');
      lastQueryRef.current = '';
      return;
    }

    setSearchState('loading');
    timerRef.current = setTimeout(() => {
      doSearch(query, searchType);
    }, 350);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, searchType, doSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
          placeholder="Search movies & TV shows..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && query.trim()) doSearch(query, searchType); }}
          autoFocus
          style={{
            width: '100%', padding: '14px 44px 14px 44px',
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {(['all', 'kdrama'] as const).map(type => (
          <button key={type} onClick={() => { setSearchType(type); lastQueryRef.current = ''; }}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: searchType === type ? '1px solid rgba(184,92,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
              background: searchType === type ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.03)',
              color: searchType === type ? '#B85CFF' : '#888',
              fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
            {type === 'all' ? 'All' : '🌐 K-Drama'}
          </button>
        ))}
      </div>

      {/* Loading */}
      {searchState === 'loading' && (
        <MuraStreamLoader fullScreen={false} text="Searching..." />
      )}

      {/* Error — only for actual API failures */}
      {searchState === 'error' && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#ef4444' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
            ⚠ {errorMessage || 'Search is temporarily unavailable'}
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

      {/* No results — NOT an error */}
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

      {/* Results */}
      {searchState === 'success' && results.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
          {results.map(item => <MuraStreamCard key={item.id} item={item} />)}
        </div>
      )}

      {/* Idle */}
      {searchState === 'idle' && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#444' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', marginBottom: '8px', color: '#666' }}>
            Search for movies & TV shows...
          </p>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: '#555' }}>
            Try the K-Drama filter for Korean titles
          </p>
        </div>
      )}
    </div>
  );
}
