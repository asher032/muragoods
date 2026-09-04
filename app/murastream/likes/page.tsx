'use client';

import { useState, useEffect } from 'react';
import MuraStreamCard from '../components/MuraStreamCard';
import MuraStreamLoader from '../components/MuraStreamLoader';

type MediaItem = {
  id: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  year: string;
  overview: string;
  genreIds: number[];
  releaseDate: string;
};

export default function MuraStreamLikesPage() {
  const [likes, setLikes] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ms-likes');
      if (stored) setLikes(JSON.parse(stored));
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  const removeLike = (id: number) => {
    const updated = likes.filter(l => l.id !== id);
    setLikes(updated);
    localStorage.setItem('ms-likes', JSON.stringify(updated));
  };

  if (loading) return <MuraStreamLoader text="Loading likes..." />;

  return (
    <div style={{ padding: '24px 28px' }}>
      <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#E5E5E5', margin: '0 0 4px' }}>
        <span style={{ color: '#B85CFF' }}>❤</span> MY LIKES
      </h1>
      <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px', color: '#666', margin: '0 0 24px' }}>
        {likes.length} title{likes.length !== 1 ? 's' : ''} liked
      </p>

      {likes.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {likes.map(item => (
            <div key={item.id} style={{ position: 'relative' }}>
              <MuraStreamCard item={item} />
              <button
                onClick={() => removeLike(item.id)}
                style={{
                  position: 'absolute', top: '6px', right: '6px', zIndex: 2,
                  background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%',
                  width: '24px', height: '24px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#e63946" viewBox="0 0 16 16">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '64px 16px', color: '#555' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="#333" viewBox="0 0 16 16" style={{ marginBottom: '12px' }}>
            <path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01z"/>
          </svg>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', marginBottom: '4px' }}>No likes yet</p>
          <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px' }}>Browse movies and tap ❤️ to add likes</p>
        </div>
      )}
    </div>
  );
}
