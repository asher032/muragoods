'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';

export default function MuraStreamHistoryPage() {
  const { history, clearHistory } = useMuraStreamStore();
  const [confirmClear, setConfirmClear] = useState(false);

  // Group by date
  const grouped = history.reduce<Record<string, typeof history>>((acc, item) => {
    const d = new Date(item.date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label = 'Last Week';
    if (d.toDateString() === today.toDateString()) label = 'Today';
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
    else if (today.getTime() - d.getTime() < 7 * 86400000) label = 'This Week';

    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});

  const handleClear = () => {
    clearHistory();
    setConfirmClear(false);
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#E5E5E5', margin: 0 }}>
          <span style={{ color: '#B85CFF' }}>🕐</span> WATCH HISTORY
        </h1>
        {history.length > 0 && (
          <>
            {confirmClear ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleClear} style={{
                  padding: '6px 12px', borderRadius: '6px', border: '1px solid #e63946',
                  background: 'rgba(230,57,70,0.12)', color: '#e63946',
                  fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
                }}>Confirm Clear</button>
                <button onClick={() => setConfirmClear(false)} style={{
                  padding: '6px 12px', borderRadius: '6px', border: '1px solid #2A2A2A',
                  background: '#171717', color: '#888',
                  fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
                }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} style={{
                padding: '6px 12px', borderRadius: '6px', border: '1px solid #2A2A2A',
                background: '#171717', color: '#888',
                fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
              }}>CLEAR HISTORY</button>
            )}
          </>
        )}
      </div>

      {Object.keys(grouped).length > 0 ? (
        Object.entries(grouped).map(([label, items]) => (
          <div key={label} style={{ marginBottom: '24px' }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#555', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {label}
            </p>
            {items.map(item => (
              <Link
                key={`${item.id}-${item.date}`}
                href={item.mediaType === 'tv'
                  ? `/murastream/tv/${item.id}`
                  : `/murastream/movie/${item.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '12px', borderRadius: '10px', border: '1px solid #1A1A1A',
                  background: '#111', marginBottom: '8px', transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#2A2A2A'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#1A1A1A'}
                >
                  {item.posterPath ? (
                    <img src={item.posterPath} alt={item.title} style={{ width: '44px', height: '60px', borderRadius: '6px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '44px', height: '60px', borderRadius: '6px', background: '#1A1A1A' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '13px', color: '#E5E5E5', margin: 0 }}>{item.title}</p>
                    {item.mediaType === 'tv' && item.season != null && (
                      <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#B85CFF', margin: '4px 0 0' }}>
                        Season {item.season} • Episode {item.episode}
                      </p>
                    )}
                    {item.progress != null && item.progress > 0 && (
                      <div style={{ marginTop: '6px', height: '3px', background: '#2A2A2A', borderRadius: '2px', maxWidth: '200px' }}>
                        <div style={{ height: '100%', width: `${item.progress}%`, background: '#B85CFF', borderRadius: '2px' }} />
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '10px', color: '#555', whiteSpace: 'nowrap' }}>
                    {new Date(item.date).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ))
      ) : (
        <div style={{ textAlign: 'center', padding: '64px 16px', color: '#555' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', marginBottom: '4px' }}>No watch history</p>
          <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px' }}>Start watching to build your history</p>
        </div>
      )}
    </div>
  );
}
