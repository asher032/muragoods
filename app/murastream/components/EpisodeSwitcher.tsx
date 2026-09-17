'use client';

// In-player episode switcher — a glass panel that lets viewers change
// episodes WITHOUT leaving the watch page. Shows thumbnail, title, watched
// state, and progress per episode. Selecting an episode calls onSelect,
// which the watch page turns into a player reload + URL update.

import { useEffect, useState } from 'react';
import { Check, Play } from 'lucide-react';

type Episode = {
  id: number;
  episodeNumber: number;
  name: string;
  overview?: string;
  stillPath?: string | null;
  airDate?: string | null;
  runtime?: number | null;
};

export default function EpisodeSwitcher({ type, id, season, currentEpisode, watchedEpisodes, onSelect, onClose }: {
  type: 'movie' | 'tv';
  id: number;
  season: number;
  currentEpisode: number;
  watchedEpisodes: number[];
  onSelect: (episode: number) => void;
  onClose: () => void;
}) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (type !== 'tv') return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/murastream/tmdb?action=tv_season&id=${id}&season=${season}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => {
        if (cancelled) return;
        setEpisodes(Array.isArray(data.episodes) ? data.episodes : []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setError('Could not load the episode list'); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [type, id, season]);

  if (type !== 'tv') return null;

  return (
    <div
      role="dialog"
      aria-label="Episodes"
      style={{
        position: 'absolute', top: 12, right: 12, zIndex: 260,
        width: 360, maxWidth: 'calc(100vw - 24px)', maxHeight: '78%',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(18,18,24,0.82)',
        backdropFilter: 'blur(13px)',
        WebkitBackdropFilter: 'blur(13px)',
        border: '1px solid rgba(255,255,255,0.22)',
        borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.28)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.12)',
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: '#E50914' }}>EPISODES</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Season {season}</p>
        </div>
        <button onClick={onClose} aria-label="Close episode panel" style={{
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 8, color: '#ddd', fontSize: 16, cursor: 'pointer',
          width: 28, height: 28, lineHeight: 1,
        }}>×</button>
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', padding: 8, flex: 1 }}>
        {loading && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div className="custom-loader" style={{ margin: '0 auto' }} />
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 10 }}>Loading episodes…</p>
          </div>
        )}
        {error && (
          <p style={{ padding: 20, fontSize: 12.5, color: '#f87171', textAlign: 'center' }}>{error}</p>
        )}
        {!loading && !error && episodes.length === 0 && (
          <p style={{ padding: 20, fontSize: 12.5, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
            No episode data for this season.
          </p>
        )}
        {episodes.map(ep => {
          const active = ep.episodeNumber === currentEpisode;
          const watched = watchedEpisodes.includes(ep.episodeNumber);
          return (
            <button
              key={ep.id || ep.episodeNumber}
              onClick={() => { if (!active) onSelect(ep.episodeNumber); }}
              style={{
                display: 'flex', gap: 10, width: '100%', textAlign: 'left',
                padding: 8, marginBottom: 6, cursor: active ? 'default' : 'pointer',
                borderRadius: 14, border: `1px solid ${active ? 'rgba(229,9,20,0.55)' : 'rgba(255,255,255,0.1)'}`,
                background: active ? 'rgba(229,9,20,0.16)' : 'rgba(255,255,255,0.05)',
                transition: 'background 0.15s, border-color 0.15s',
                alignItems: 'center',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              {/* Thumbnail */}
              <div style={{
                width: 92, height: 52, borderRadius: 9, overflow: 'hidden', flexShrink: 0,
                background: 'rgba(255,255,255,0.07)', position: 'relative',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                {ep.stillPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ep.stillPath} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
                    EP {String(ep.episodeNumber).padStart(2, '0')}
                  </div>
                )}
                {watched && (
                  <span style={{
                    position: 'absolute', top: 3, left: 3, width: 16, height: 16, borderRadius: '50%',
                    background: 'rgba(34,197,94,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Check size={10} color="#04140a" /></span>
                )}
                {active && (
                  <span style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.45)',
                  }}><Play size={16} color="#fff" /></span>
                )}
              </div>
              {/* Meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  color: active ? '#E50914' : 'rgba(255,255,255,0.5)',
                }}>
                  EP {String(ep.episodeNumber).padStart(2, '0')}{watched ? ' · WATCHED' : ''}
                </p>
                <p style={{
                  margin: '2px 0 0', fontSize: 12.5, fontWeight: 600, color: '#f5f5f5',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{ep.name || `Episode ${ep.episodeNumber}`}</p>
                {ep.runtime ? (
                  <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>{ep.runtime} min</p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
