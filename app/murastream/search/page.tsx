'use client';

// MuraStream search — URL-driven. The query lives in ?q= and the filter in
// ?type=, so a search can never get stuck in a stale client state: pasting a
// link, pressing Enter, or the home search bar all land here and the effect
// re-runs from the URL itself. The input updates the URL (debounced) and the
// effect fetches — one direction of flow, no guards to deadlock.

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';
import type { MediaItem } from '../types';
import { X } from 'lucide-react';

type SearchState = 'idle' | 'loading' | 'success' | 'error' | 'no-results';

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get('q') || '';
  const urlType = (searchParams.get('type') === 'kdrama' ? 'kdrama' : 'all') as 'all' | 'kdrama';

  // Local input state follows the URL; typing writes back to the URL debounced.
  const [input, setInput] = useState(urlQuery);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [searchState, setSearchState] = useState<SearchState>(urlQuery.trim() ? 'loading' : 'idle');
  const [errorMessage, setErrorMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the input in sync when the URL changes from outside (nav, back button).
  useEffect(() => { setInput(urlQuery); }, [urlQuery]);

  useEffect(() => {
    const q = urlQuery.trim();
    if (!q) {
      abortRef.current?.abort();
      setResults([]);
      setSearchState('idle');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSearchState('loading');
    setErrorMessage('');

    (async () => {
      try {
        const res = await fetch(`/api/murastream/tmdb?action=search&q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        let items: MediaItem[] = data.results || [];
        if (urlType === 'kdrama') items = items.filter(r => r.originalLanguage === 'ko');
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
    })();

    return () => controller.abort();
  }, [urlQuery, urlType]);

  // Debounced URL sync while typing (keeps the input responsive).
  const onInput = (value: string) => {
    setInput(value);
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      const q = value.trim();
      const sp = new URLSearchParams();
      if (q) sp.set('q', q);
      if (urlType === 'kdrama') sp.set('type', 'kdrama');
      router.replace(`/murastream/search?${sp.toString()}`, { scroll: false });
    }, 350);
  };

  const setType = (t: 'all' | 'kdrama') => {
    const q = urlQuery.trim();
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (t === 'kdrama') sp.set('type', 'kdrama');
    router.replace(`/murastream/search?${sp.toString()}`, { scroll: false });
  };

  const clear = () => {
    setInput('');
    inputRef.current?.focus();
    router.replace('/murastream/search', { scroll: false });
  };

  return (
    <div className="ms-page-pad">
      <h1 style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '24px', fontWeight: 700, color: 'var(--ms-text-strong)', margin: '0 0 20px',
      }}>
        Search
      </h1>

      {/* Search input */}
      <div style={{ position: 'relative', maxWidth: '500px', marginBottom: '20px' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search movies & TV shows..."
          value={input}
          onChange={e => onInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { if (pushTimerRef.current) clearTimeout(pushTimerRef.current); onInput(input); } }}
          autoFocus
          style={{
            width: '100%', padding: '14px 44px 14px 44px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px', color: 'var(--ms-text)', fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', outline: 'none',
            transition: 'border-color 0.2s, background 0.2s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(229,9,20,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
        />
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="var(--ms-text-ghost)"
          style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }}
          viewBox="0 0 16 16">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10"/>
        </svg>
        {input && (
          <button onClick={clear} aria-label="Clear search"
            style={{
              position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
              width: '24px', height: '24px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'var(--ms-text-dim)', fontSize: '14px',
            }}><X className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></button>
        )}
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {(['all', 'kdrama'] as const).map(t => (
          <button key={t} onClick={() => setType(t)}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: urlType === t ? '1px solid rgba(229,9,20,0.4)' : '1px solid rgba(255,255,255,0.06)',
              background: urlType === t ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.03)',
              color: urlType === t ? '#E50914' : 'var(--ms-text-dim)',
              fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
            {t === 'all' ? 'All' : 'K-Drama'}
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
            Search is temporarily unavailable
          </p>
          <button onClick={() => router.replace(`/murastream/search?q=${encodeURIComponent(urlQuery)}${urlType === 'kdrama' ? '&type=kdrama' : ''}`)}
            style={{
              padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(229,9,20,0.3)',
              background: 'rgba(229,9,20,0.1)', color: '#E50914',
              fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}>
            Retry
          </button>
        </div>
      )}

      {/* No results — NOT an error */}
      {searchState === 'no-results' && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--ms-text-faint)' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
            No results found
          </p>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: 'var(--ms-text-ghost)' }}>
            Try a different search term or adjust your filters
          </p>
        </div>
      )}

      {/* Results */}
      {searchState === 'success' && results.length > 0 && (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--ms-text-ghost)', margin: '0 0 14px' }}>
            {results.length} result{results.length === 1 ? '' : 's'} for “{urlQuery.trim()}”
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
            {results.map(item => <MuraStreamCard key={item.id} item={item} />)}
          </div>
        </>
      )}

      {/* Idle */}
      {searchState === 'idle' && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#444' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', marginBottom: '8px', color: 'var(--ms-text-faint)' }}>
            Search for movies & TV shows...
          </p>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: 'var(--ms-text-ghost)' }}>
            Try the K-Drama filter for Korean titles
          </p>
        </div>
      )}
    </div>
  );
}

export default function MuraStreamSearchPage() {
  return (
    <Suspense fallback={<MuraStreamLoader fullScreen={false} text="Loading search..." />}>
      <SearchContent />
    </Suspense>
  );
}
