'use client';

import { useState, useMemo } from 'react';
import MuraStreamCard from '../components/MuraStreamCard';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';
import type { MediaItem } from '../types';

const TABS = [
  { id: 'all', label: 'ALL' },
  { id: 'movies', label: 'MOVIES' },
  { id: 'tv', label: 'TV' },
  { id: 'liked', label: 'LIKED' },
  { id: 'watchlist', label: 'WATCHLIST' },
];

const SORTS = ['Recently Added', 'Recently Watched', 'Alphabetical', 'Rating'] as const;

export default function MuraStreamLibraryPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState<string>('Recently Added');
  const { history, likes, myList } = useMuraStreamStore();

  const items = useMemo(() => {
    const allItems = new Map<number, MediaItem>();
    [...history, ...likes, ...myList].forEach(item => {
      if (!allItems.has(item.id)) allItems.set(item.id, item);
    });
    return Array.from(allItems.values());
  }, [history, likes, myList]);

  const filtered = useMemo(() => {
    const likedIds = new Set(likes.map(l => l.id));
    const myListIds = new Set(myList.map(w => w.id));

    return items.filter(item => {
      if (activeTab === 'movies') return item.mediaType === 'movie';
      if (activeTab === 'tv') return item.mediaType === 'tv';
      if (activeTab === 'liked') return likedIds.has(item.id);
      if (activeTab === 'watchlist') return myListIds.has(item.id);
      return true;
    }).sort((a, b) => {
      if (sortBy === 'Alphabetical') return a.title.localeCompare(b.title);
      if (sortBy === 'Rating') return (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
      return 0;
    });
  }, [items, activeTab, sortBy, likes, myList]);

  return (
    <div style={{ padding: '24px 28px' }}>
      <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#E5E5E5', margin: '0 0 16px' }}>
        LIBRARY
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '6px 14px', borderRadius: '6px',
            border: activeTab === tab.id ? '1px solid #E50914' : '1px solid #2A2A2A',
            background: activeTab === tab.id ? 'rgba(229,9,20,0.12)' : '#171717',
            color: activeTab === tab.id ? '#E50914' : '#888',
            fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#555' }}>SORT:</span>
        {SORTS.map(sort => (
          <button key={sort} onClick={() => setSortBy(sort)} style={{
            padding: '4px 8px', borderRadius: '4px',
            border: sortBy === sort ? '1px solid rgba(229,9,20,0.3)' : '1px solid transparent',
            background: sortBy === sort ? 'rgba(229,9,20,0.08)' : 'transparent',
            color: sortBy === sort ? '#E50914' : '#555',
            fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '11px', cursor: 'pointer',
          }}>
            {sort}
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {filtered.map(item => <MuraStreamCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '64px 16px', color: '#555' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', marginBottom: '4px' }}>Nothing here yet</p>
          <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px' }}>Browse and add titles to build your library</p>
        </div>
      )}
    </div>
  );
}
