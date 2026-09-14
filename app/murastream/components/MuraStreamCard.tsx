'use client';

import Link from 'next/link';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';
import type { MediaItem } from '../types';
import { Check, Star } from 'lucide-react';
// Country-of-origin labels for Asian drama recognition
const COUNTRY_LABELS: Record<string, string> = {
  ko: 'K-DRAMA',
  zh: 'C-DRAMA',
  ja: 'J-DRAMA',
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
  const { toggleMyList, isInMyList } = useMuraStreamStore();

  // Build href (anime query params removed with the anime section)
  const baseHref = item.mediaType === 'tv'
    ? `/murastream/tv/${item.id}`
    : `/murastream/movie/${item.id}`;
  const href = baseHref;

  const inList = isInMyList(item.id);

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }} className="ms-card">
      <div className="ms-card-image">
        {item.posterPath ? (
          <img src={item.posterPath} alt={item.title} loading="lazy" />
        ) : (
          <div className="ms-card-noimg">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#333" viewBox="0 0 16 16">
              <path d="M6 3a3 3 0 1 1-6 0 3 3 0 0 1 6 0M1 3a2 2 0 1 0 4 0 2 2 0 0 0-4 0"/>
              <path d="M9 6h.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 7.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 16H2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>
            </svg>
          </div>
        )}

        {/* Rating badge */}
        {(item.voteAverage ?? 0) > 0 && (
          <div className="ms-card-rating">
            <span><Star color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span> {(item.voteAverage ?? 0).toFixed(1)}
          </div>
        )}

        {/* Country-of-origin badge */}
        {item.mediaType === 'tv' && COUNTRY_LABELS[item.originalLanguage || ''] && (
          <div className="ms-card-country">{COUNTRY_LABELS[item.originalLanguage!]}</div>
        )}

        {/* Hover overlay */}
        <div className="ms-card-overlay">
          <div className="ms-card-play">
            <svg width="18" height="18" fill="#fff" viewBox="0 0 16 16">
              <path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/>
            </svg>
          </div>
          <div className="ms-card-actions-row">
            <button
              className="ms-card-action-btn primary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = href;
              }}
            >
              <svg width="10" height="10" fill="currentColor" viewBox="0 0 16 16">
                <path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/>
              </svg>
              Play
            </button>
            <button
              className="ms-card-action-btn secondary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMyList(item);
              }}
            >
              {inList ? <Check className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> : '+'}
            </button>
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
    </Link>
  );
}
