'use client';

import { useState, useMemo } from 'react';
import MuraStreamCard from '../components/MuraStreamCard';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';
import type { MediaItem } from '../types';

// Library — every title the user has liked, saved, or watched in one grid.
// Pulls from ALL store buckets (history, likes, myList AND episodeProgress)
// so TV shows tracked by episode appear too — previously they were missing.

const TABS = [
  { id: 'all', label: 'ALL' },
  { id: 'movies', label: 'MOVIES' },
  { id: 'tv', label: 'TV' },
  { id: 'liked', label: 'LIKED' },
  { id: 'watchlist', label: 'WATCHLIST' },
  { id: 'watching', label: 'WATCHING' },
];

const SORTS = ['Recently Added', 'Recently Watched', 'Alphabetical', 'Rating'] as const;

export default function MuraStreamLibraryPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState<string>('Recently Added');
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const { history, likes, myList, episodeProgress, clearAllLibrary } = useMuraStreamStore();

  // Continue-watching TV entries from episode progress
  const watchingItems = useMemo<MediaItem[]>(() => (
    episodeProgress.map(ep => ({
      id: ep.id,
      mediaType: 'tv' as const,
      title: ep.title,
      posterPath: ep.posterPath || '',
      genreIds: [],
      overview: '',
      releaseDate: '',
    }))
  ), [episodeProgress]);

  const items = useMemo(() => {
    const allItems = new Map<number, MediaItem>();
    [...history, ...likes, ...myList, ...watchingItems].forEach(item => {
      if (!allItems.has(item.id)) allItems.set(item.id, item);
    });
    return Array.from(allItems.values());
  }, [history, likes, myList, watchingItems]);

  const filtered = useMemo(() => {
    const likedIds = new Set(likes.map(l => l.id));
    const myListIds = new Set(myList.map(w => w.id));
    const watchingIds = new Set(episodeProgress.map(ep => ep.id));

    const q = query.trim().toLowerCase();
    return items
      .filter(item => {
        if (activeTab === 'movies') return item.mediaType === 'movie';
        if (activeTab === 'tv') return item.mediaType === 'tv';
        if (activeTab === 'liked') return likedIds.has(item.id);
        if (activeTab === 'watchlist') return myListIds.has(item.id);
        if (activeTab === 'watching') return watchingIds.has(item.id);
        return true;
      })
      .filter(item => !q || item.title?.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === 'Alphabetical') return a.title.localeCompare(b.title);
        if (sortBy === 'Rating') return (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
        if (sortBy === 'Recently Watched') {
          const la = history.find(h => h.id === a.id)?.date || '';
          const lb = history.find(h => h.id === b.id)?.date || '';
          return lb.localeCompare(la);
        }
        return 0;
      });
  }, [items, activeTab, sortBy, query, likes, myList, episodeProgress, history]);

  const handleClear = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearAllLibrary();
    setConfirmClear(false);
  };

  return (
    <div className="ms-page-pad">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: 'var(--ms-text)', margin: 0 }}>
          LIBRARY
        </h1>
        {items.length > 0 && (
          <button
            onClick={handleClear}
            title="Remove every title from your library"
            style={{
              background: 'transparent', border: `1px solid ${confirmClear ? 'rgba(229,9,20,0.6)' : 'var(--ms-border-2)'}`,
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
              color: confirmClear ? '#E50914' : 'var(--ms-text-faint)', fontSize: 12, fontWeight: 600,
            }}
          >
            {confirmClear ? 'Tap again to confirm' : 'Clear all'}
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 360, marginBottom: 16 }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your library..."
          aria-label="Search library"
          style={{
            width: '100%', padding: '10px 14px',
            background: 'var(--ms-surface-2)', border: '1px solid var(--ms-border-2)',
            borderRadius: 10, color: 'var(--ms-text)', fontSize: 13,
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', outline: 'none',
          }}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} aria-pressed={activeTab === tab.id} style={{
            padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
            border: activeTab === tab.id ? '1px solid #E50914' : '1px solid var(--ms-border-2)',
            background: activeTab === tab.id ? 'rgba(229,9,20,0.12)' : 'var(--ms-surface-2)',
            color: activeTab === tab.id ? '#E50914' : 'var(--ms-text-dim)',
            fontFamily: 'var(--font-arcade)', fontSize: '9px', whiteSpace: 'nowrap',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--ms-text-ghost)' }}>SORT:</span>
        {SORTS.map(sort => (
          <button key={sort} onClick={() => setSortBy(sort)} aria-pressed={sortBy === sort} style={{
            padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
            border: sortBy === sort ? '1px solid rgba(229,9,20,0.3)' : '1px solid transparent',
            background: sortBy === sort ? 'rgba(229,9,20,0.08)' : 'transparent',
            color: sortBy === sort ? '#E50914' : 'var(--ms-text-ghost)',
            fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '11px',
          }}>
            {sort}
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: '36px 28px',
        }}>
          {filtered.map(item => <MuraStreamCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '64px 16px', color: 'var(--ms-text-ghost)' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', marginBottom: '4px' }}>
            {query ? 'No matches' : 'Nothing here yet'}
          </p>
          <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px' }}>
            {query ? `Nothing in your library matches "${query}"` : 'Browse and add titles to build your library'}
          </p>
        </div>
      )}
    </div>
  );
}
