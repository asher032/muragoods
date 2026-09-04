'use client';

import Link from 'next/link';
import { useState } from 'react';

type MediaItem = {
  id: number;
  mediaType: string;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  voteAverage?: number;
  year?: string;
  overview?: string;
  genreIds?: number[];
  releaseDate?: string;
};

export default function MuraStreamCard({
  item,
  showActions = false,
  progress,
  season,
  episode,
}: {
  item: MediaItem;
  showActions?: boolean;
  progress?: number;
  season?: number;
  episode?: number;
}) {
  const [liked, setLiked] = useState(false);
  const [inList, setInList] = useState(false);
  const href = item.mediaType === 'tv'
    ? `/murastream/tv/${item.id}`
    : `/murastream/movie/${item.id}`;

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="ms-card">
        <div className="ms-card-image">
          {item.posterPath ? (
            <img src={item.posterPath} alt={item.title} loading="lazy" />
          ) : (
            <div className="ms-card-noimg">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#444" viewBox="0 0 16 16">
                <path d="M6 3a3 3 0 1 1-6 0 3 3 0 0 1 6 0M1 3a2 2 0 1 0 4 0 2 2 0 0 0-4 0"/>
                <path d="M9 6h.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 7.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 16H2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
              </svg>
            </div>
          )}

          {/* Rating badge */}
          {(item.voteAverage ?? 0) > 0 && (
            <div className="ms-card-rating">
              <span>★</span> {(item.voteAverage ?? 0).toFixed(1)}
            </div>
          )}

          {/* Hover overlay */}
          <div className="ms-card-overlay">
            <div className="ms-card-play">
              <svg width="16" height="16" fill="#fff" viewBox="0 0 16 16">
                <path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/>
              </svg>
            </div>
          </div>

          {/* Progress bar */}
          {progress != null && progress > 0 && (
            <div className="ms-card-progress">
              <div className="ms-card-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        <div className="ms-card-info">
          <p className="ms-card-title">{item.title}</p>
          <div className="ms-card-meta">
            {item.year && <span>{item.year}</span>}
            {season != null && episode != null && (
              <span className="ms-card-episode">S{season}E{episode}</span>
            )}
          </div>
        </div>

        {showActions && (
          <div className="ms-card-actions">
            <button
              className="ms-card-action"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLiked(!liked); }}
              title="Like"
            >
              {liked ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#B85CFF" viewBox="0 0 16 16">
                  <path d="M4 1c2.21 0 4 1.755 4 3.92C8 2.755 9.79 1 12 1s4 1.755 4 3.92c0 3.263-3.234 4.414-7.608 9.608a.513.513 0 0 1-.784 0C3.234 9.334 0 8.183 0 4.92 0 2.755 1.79 1 4 1"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#A0A0A0" viewBox="0 0 16 16">
                  <path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15"/>
                </svg>
              )}
            </button>
            <button
              className="ms-card-action"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInList(!inList); }}
              title="My List"
            >
              {inList ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#B85CFF" viewBox="0 0 16 16">
                  <path d="M2 2v2h2V2zm4 0v2h8V2zm-4 4v2h12V6zm-4 4v2h16v-2zm-4 4v2h20v-2z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#A0A0A0" viewBox="0 0 16 16">
                  <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/>
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </Link>
  );
}
