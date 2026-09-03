'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/app/components/Sidebar';

type LibraryItem = {
  id: number;
  mediaType: 'movie' | 'tv' | 'anime';
  title: string;
  posterPath: string | null;
  addedAt?: string;
  season?: number;
  episode?: number;
  episodeName?: string;
  progress?: number;
  updatedAt?: string;
  watchedAt?: string;
};

type LibraryData = {
  watchlist: LibraryItem[];
  favorites: LibraryItem[];
  history: LibraryItem[];
  continueWatching: LibraryItem[];
  progress: Record<string, number>;
};

const TABS = [
  { id: 'continue', label: '▶ Continue Watching', icon: '▶' },
  { id: 'watchlist', label: '📋 Watchlist', icon: '📋' },
  { id: 'favorites', label: '❤️ Favorites', icon: '❤️' },
  { id: 'history', label: '🕐 History', icon: '🕐' },
];

function ItemCard({ item, type }: { item: LibraryItem; type: string }) {
  const href = item.mediaType === 'tv' ? `/murastream/tv/${item.id}` : `/murastream/movie/${item.id}`;
  const progressKey = item.mediaType === 'tv'
    ? `tv_${item.id}_s${item.season}e${item.episode}`
    : `movie_${item.id}`;
  const pct = item.progress || 0;

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        position: 'relative', borderRadius: '10px', overflow: 'hidden',
        background: '#1a1a2e', cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,214,10,0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        {item.posterPath ? (
          <img src={item.posterPath} alt={item.title} loading="lazy" style={{
            width: '100%', height: '200px', objectFit: 'cover',
          }} />
        ) : (
          <div style={{
            width: '100%', height: '200px', background: '#1a1a2e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#444',
          }}>No Image</div>
        )}
        {/* Progress bar for continue watching */}
        {type === 'continue' && pct > 0 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px',
            background: 'rgba(0,0,0,0.5)',
          }}>
            <div style={{
              height: '100%', width: `${pct}%`, background: 'var(--mario-yellow)',
              borderRadius: '0 2px 0 0',
            }} />
          </div>
        )}
        <div style={{ padding: '8px' }}>
          <p style={{
            fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#fff', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.title}</p>
          {item.mediaType === 'tv' && item.season != null && (
            <p style={{
              fontFamily: 'var(--font-arcade)', fontSize: '6px', color: '#888', margin: '2px 0 0',
            }}>S{item.season} E{item.episode}{item.episodeName ? ` • ${item.episodeName}` : ''}</p>
          )}
          {type === 'continue' && pct > 0 && (
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '6px', color: '#ffd60a', margin: '2px 0 0' }}>
              {Math.round(pct)}% watched
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function LibraryPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('continue');
  const [library, setLibrary] = useState<LibraryData>({
    watchlist: [], favorites: [], history: [], continueWatching: [], progress: {},
  });
  const [loading, setLoading] = useState(true);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/murastream/library');
      if (res.ok) {
        const data = await res.json();
        setLibrary({
          watchlist: data.watchlist || [],
          favorites: data.favorites || [],
          history: data.history || [],
          continueWatching: data.continueWatching || [],
          progress: data.progress || {},
        });
      }
    } catch (err) {
      console.error('Library fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  const items = activeTab === 'continue'
    ? library.continueWatching
    : activeTab === 'watchlist'
    ? library.watchlist
    : activeTab === 'favorites'
    ? library.favorites
    : library.history;

  return (
    <>
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <button onClick={() => setSidebarOpen(true)} style={{
        position: 'fixed', top: '12px', left: '12px', zIndex: 200,
        background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,214,10,0.2)',
        borderRadius: '8px', padding: '8px', cursor: 'pointer',
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffd60a" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5" />
        </svg>
      </button>

      <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto', paddingTop: '60px' }}>
        <h1 style={{
          fontFamily: 'var(--font-arcade)', fontSize: '14px',
          color: 'var(--mario-yellow)', margin: '0 0 4px',
        }}>
          📚 My Library
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '12px',
          color: '#888', margin: '0 0 20px',
        }}>
          Your movies, shows, and watch history
        </p>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px',
        }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '6px 14px', borderRadius: '20px', flexShrink: 0,
              border: activeTab === tab.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === tab.id ? 'rgba(255,214,10,0.15)' : 'rgba(26,26,46,0.5)',
              color: activeTab === tab.id ? 'var(--mario-yellow)' : '#888',
              fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {tab.label}
              <span style={{
                marginLeft: '4px', background: 'rgba(255,255,255,0.1)',
                padding: '1px 5px', borderRadius: '8px', fontSize: '7px',
              }}>
                {(library[activeTab as keyof LibraryData] as LibraryItem[] | Record<string, number>)?.length ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Items Grid */}
        {loading ? (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px',
          }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                borderRadius: '10px', overflow: 'hidden', background: '#1a1a2e',
              }}>
                <div style={{
                  width: '100%', height: '200px',
                  background: 'linear-gradient(90deg, #1a1a2e 25%, #252540 50%, #1a1a2e 75%)',
                  backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
                }} />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 16px',
          }}>
            <p style={{ fontSize: '32px', marginBottom: '8px' }}>
              {activeTab === 'continue' ? '▶' : activeTab === 'watchlist' ? '📋' : activeTab === 'favorites' ? '❤️' : '🕐'}
            </p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#666', margin: '0 0 12px' }}>
              {activeTab === 'continue' ? 'No shows in progress' :
               activeTab === 'watchlist' ? 'Your watchlist is empty' :
               activeTab === 'favorites' ? 'No favorites yet' : 'No watch history'}
            </p>
            <Link href="/murastream" style={{
              fontFamily: 'var(--font-arcade)', fontSize: '8px',
              color: 'var(--mario-yellow)', textDecoration: 'none',
            }}>
              Browse MuraStream →
            </Link>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px',
          }}>
            {items.map((item: LibraryItem) => (
              <ItemCard key={`${item.mediaType}_${item.id}_${item.season || 0}_${item.episode || 0}`} item={item} type={activeTab} />
            ))}
          </div>
        )}

        <style jsx global>{`
          @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        `}</style>

        <div style={{ height: '80px' }} />
      </div>
    </>
  );
}
