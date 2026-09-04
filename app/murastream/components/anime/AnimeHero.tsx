import type { MediaItem } from '../../types';

export default function AnimeHero({ item }: { item: MediaItem | null }) {
  if (!item) return null;
  const year = item.year || (item.releaseDate ? item.releaseDate.substring(0, 4) : '');
  const genres = item.genres?.slice(0, 3).join(' • ') || '';
  const episodes = item.episodes;
  const score = item.score || item.voteAverage || 0;
  const status = item.status;

  return (
    <div style={{
      position: 'relative', borderRadius: '12px', overflow: 'hidden',
      height: '420px', marginBottom: '32px', background: '#0A0A0A',
    }}>
      {item.posterPath ? (
        <img src={item.posterPath} alt={item.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.4)' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0A0A0A 0%, #1A0A2E 50%, #0A0A0A 100%)' }} />
      )}

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0A0A0A 0%, rgba(10,10,10,0.7) 30%, rgba(10,10,10,0.3) 60%, transparent 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.5) 40%, transparent 100%)' }} />

      <div style={{ position: 'absolute', bottom: '32px', left: '28px', right: '28px', maxWidth: '600px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#B85CFF',
            background: 'rgba(184,92,255,0.2)', padding: '3px 10px', borderRadius: '4px',
            letterSpacing: '0.1em', border: '1px solid rgba(184,92,255,0.3)',
          }}>TOP RANKED</span>
          {status && (
            <span style={{
              fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#4ade80',
              background: 'rgba(74,222,128,0.15)', padding: '3px 10px', borderRadius: '4px',
              letterSpacing: '0.05em',
            }}>{status}</span>
          )}
          {score > 0 && (
            <span style={{
              fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#facc15',
              background: 'rgba(250,204,21,0.15)', padding: '3px 10px', borderRadius: '4px',
            }}>★ {score.toFixed(1)}</span>
          )}
          {episodes && (
            <span style={{
              fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#888',
              background: 'rgba(255,255,255,0.08)', padding: '3px 10px', borderRadius: '4px',
            }}>{episodes} EP</span>
          )}
        </div>

        <h2 style={{
          fontFamily: 'var(--font-arcade)', fontSize: '28px', color: '#FFF',
          margin: '0 0 8px', textShadow: '0 2px 12px rgba(0,0,0,0.5)',
        }}>{item.title}</h2>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {year && <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#888' }}>{year}</span>}
          {genres && <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '12px', color: '#A0A0A0' }}>{genres}</span>}
        </div>

        <p style={{
          fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '13px', color: '#A0A0A0',
          margin: '0 0 20px', maxWidth: '500px', lineHeight: '1.6', maxHeight: '56px', overflow: 'hidden',
        }}>{item.overview}</p>

        <a href={`/murastream/tv/${item.id}${item.anilistId ? `?anilist=${item.anilistId}` : ''}`} style={{
          background: '#B85CFF', color: '#FFF', padding: '10px 24px', borderRadius: '8px',
          fontFamily: 'var(--font-arcade)', fontSize: '11px', display: 'inline-flex',
          alignItems: 'center', gap: '6px', textDecoration: 'none',
        }}>
          <svg width="14" height="14" fill="#fff" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
          WATCH NOW
        </a>
      </div>
    </div>
  );
}
