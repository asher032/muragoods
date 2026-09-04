import Link from 'next/link';
import type { MediaItem } from '../../types';

export default function AnimeCard({ item }: { item: MediaItem }) {
  const score = item.score || item.voteAverage || 0;
  const episodes = item.episodes;
  const status = item.status;
  const genres = item.genres?.slice(0, 2);

  return (
    <Link href={`/murastream/tv/${item.id}${item.anilistId ? `?anilist=${item.anilistId}` : ''}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="anime-card">
        <div className="anime-card-poster">
          {item.posterPath ? (
            <img src={item.posterPath} alt={item.title} loading="lazy" />
          ) : (
            <div style={{
              width: '100%', height: '100%', background: 'linear-gradient(135deg, #111, #1A1A2E)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-arcade)', fontSize: '32px', color: '#333',
            }}>🍥</div>
          )}

          {score > 0 && (
            <div className="anime-card-score">★ {score.toFixed(1)}</div>
          )}

          {status && (
            <div className={`anime-card-status ${status === 'Currently Airing' ? 'airing' : ''}`}>
              {status === 'Currently Airing' ? 'AIRING' : status === 'Finished Airing' ? 'COMPLETED' : 'UPCOMING'}
            </div>
          )}

          <div className="anime-card-play">
            <svg width="20" height="20" fill="#fff" viewBox="0 0 16 16">
              <path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/>
            </svg>
          </div>
        </div>

        <div className="anime-card-info">
          <p className="anime-card-title">{item.title}</p>
          <div className="anime-card-meta">
            {genres?.map((g, i) => (
              <span key={i} className="anime-card-genre">{g}</span>
            ))}
          </div>
          {episodes && (
            <p className="anime-card-episodes">{episodes} episodes</p>
          )}
        </div>
      </div>
    </Link>
  );
}
