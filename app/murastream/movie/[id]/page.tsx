'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MuraStreamCard from '../../components/MuraStreamCard';
import MuraStreamLoader from '../../components/MuraStreamLoader';
import { useMuraStreamStore } from '../../hooks/useMuraStreamStore';

type DetailData = {
  id: number;
  title: string;
  name?: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  releaseDate: string;
  runtime: number;
  status: string;
  tagline: string;
  genres: Array<{ id: number; name: string }>;
  credits: {
    cast: Array<{ id: number; name: string; character: string; profilePath: string | null }>;
    crew: Array<{ id: number; name: string; job: string; profilePath: string | null }>;
  };
  videos: Array<{ key: string; name: string; type: string; url: string }>;
  similar: { results: Array<{ id: number; title: string; posterPath: string | null; voteAverage: number; year: string; mediaType: string }> };
  recommendations: { results: Array<{ id: number; title: string; posterPath: string | null; voteAverage: number; year: string; mediaType: string }> };
  mediaType: string;
  year: string;
};

export default function MovieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const movieId = params.id;

  const [movie, setMovie] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const { isLiked, toggleLike, isInMyList, toggleMyList } = useMuraStreamStore();
  const [showTrailer, setShowTrailer] = useState(false);

  const fetchMovie = useCallback(async () => {
    try {
      const res = await fetch(`/api/murastream/tmdb?action=movie_details&id=${movieId}`);
      if (!res.ok) throw new Error('Failed to fetch movie');
      const data = await res.json();
      setMovie(data);
    } catch (err) {
      console.error('Movie fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [movieId]);

  useEffect(() => { fetchMovie(); }, [fetchMovie]);



  if (loading) return <MuraStreamLoader text="Loading movie..." />;

  if (!movie) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#666' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px' }}>Movie not found</p>
        <Link href="/murastream" style={{ color: '#B85CFF', fontFamily: 'var(--font-arcade)', fontSize: '10px', textDecoration: 'none' }}>← Back to MuraStream</Link>
      </div>
    );
  }

  const trailer = movie.videos?.find((v: { type: string }) => v.type === 'Trailer') || movie.videos?.[0];
  const director = movie.credits?.crew?.find((c: { job: string }) => c.job === 'Director');
  const runtimeH = movie.runtime ? Math.floor(movie.runtime / 60) : 0;
  const runtimeM = movie.runtime ? movie.runtime % 60 : 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Backdrop */}
      <div style={{ position: 'relative', width: '100%', height: '400px', overflow: 'hidden' }}>
        {movie.backdropPath ? (
          <img src={movie.backdropPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0A0A0A, #1A1A2E)' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, #0A0A0A 0%, rgba(10,10,10,0.7) 50%, transparent 100%)' }} />

        {/* Back button */}
        <button onClick={() => router.back()} style={{
          position: 'absolute', top: '16px', left: '16px', zIndex: 10,
          background: 'rgba(0,0,0,0.6)', border: '1px solid #2A2A2A', borderRadius: '8px',
          padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#E5E5E5',
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>
          </svg>
          Back
        </button>
      </div>

      <div style={{ padding: '0 28px', maxWidth: '1100px', margin: '-80px auto 0', position: 'relative' }}>
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
          {/* Poster */}
          {movie.posterPath && (
            <img src={movie.posterPath} alt={movie.title} style={{
              width: '200px', borderRadius: '10px', border: '1px solid #2A2A2A',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', flexShrink: 0,
            }} />
          )}

          {/* Info */}
          <div style={{ flex: 1, minWidth: '280px' }}>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#E5E5E5', margin: '0 0 8px' }}>
              {movie.title}
            </h1>
            {movie.tagline && (
              <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px', color: '#666', fontStyle: 'italic', margin: '0 0 12px' }}>
                &ldquo;{movie.tagline}&rdquo;
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
              {movie.year && <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#A0A0A0' }}>{movie.year}</span>}
              {movie.runtime > 0 && <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666' }}>{runtimeH}h {runtimeM}m</span>}
              {movie.voteAverage > 0 && (
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#B85CFF', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  ★ {movie.voteAverage.toFixed(1)}
                </span>
              )}
            </div>

            {/* Genres */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
              {movie.genres?.map((g: { id: number; name: string }) => (
                <span key={g.id} style={{
                  fontFamily: 'var(--font-arcade)', fontSize: '8px', padding: '4px 10px', borderRadius: '6px',
                  border: '1px solid rgba(184,92,255,0.3)', color: '#B85CFF', background: 'rgba(184,92,255,0.08)',
                }}>{g.name}</span>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <Link href={`/murastream/watch?type=movie&id=${movieId}`} style={{
                background: '#B85CFF', color: '#FFF', padding: '12px 24px', borderRadius: '8px',
                fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <svg width="14" height="14" fill="#fff" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
                WATCH NOW
              </Link>
              <button onClick={() => { if (movie) toggleMyList({ id: movie.id, mediaType: 'movie', title: movie.title, posterPath: movie.posterPath, backdropPath: movie.backdropPath, voteAverage: movie.voteAverage, year: movie.year, overview: movie.overview, genreIds: movie.genres?.map(g => g.id) || [], releaseDate: movie.releaseDate }); }} style={{
                background: isInMyList(Number(movieId)) ? 'rgba(184,92,255,0.12)' : 'rgba(184,92,255,0.06)',
                border: `1px solid ${isInMyList(Number(movieId)) ? '#B85CFF' : '#2A2A2A'}`, color: isInMyList(Number(movieId)) ? '#B85CFF' : '#A0A0A0',
                padding: '12px 18px', borderRadius: '8px', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer',
              }}>
                {isInMyList(Number(movieId)) ? '✓ IN MY LIST' : '+ MY LIST'}
              </button>
              <button onClick={() => { if (movie) toggleLike({ id: movie.id, mediaType: 'movie', title: movie.title, posterPath: movie.posterPath, backdropPath: movie.backdropPath, voteAverage: movie.voteAverage, year: movie.year, overview: movie.overview, genreIds: movie.genres?.map(g => g.id) || [], releaseDate: movie.releaseDate }); }} style={{
                background: isLiked(Number(movieId)) ? 'rgba(230,57,70,0.12)' : 'rgba(230,57,70,0.06)',
                border: `1px solid ${isLiked(Number(movieId)) ? '#e63946' : '#2A2A2A'}`, color: isLiked(Number(movieId)) ? '#e63946' : '#A0A0A0',
                padding: '12px 18px', borderRadius: '8px', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer',
              }}>
                {isLiked(Number(movieId)) ? '❤ LIKED' : '♡ LIKE'}
              </button>
              {trailer && (
                <button onClick={() => setShowTrailer(true)} style={{
                  background: '#171717', border: '1px solid #2A2A2A', color: '#888',
                  padding: '12px 18px', borderRadius: '8px', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer',
                }}>🎬 TRAILER</button>
              )}
            </div>

            {/* Overview */}
            <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '14px', color: '#A0A0A0', lineHeight: '1.7', margin: 0 }}>
              {movie.overview}
            </p>

            {director && (
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#666', marginTop: '16px', margin: '16px 0 0' }}>
                DIRECTOR: <span style={{ color: '#E5E5E5' }}>{director.name}</span>
              </p>
            )}
          </div>
        </div>

        {/* Cast */}
        {movie.credits?.cast?.length > 0 && (
          <div style={{ marginTop: '36px' }}>
            <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#E5E5E5', margin: '0 0 14px' }}>CAST</h3>
            <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '8px' }} className="ms-scroll">
              {movie.credits.cast.slice(0, 12).map((person: { id: number; name: string; character: string; profilePath: string | null }) => (
                <div key={person.id} style={{ textAlign: 'center', flexShrink: 0, width: '80px' }}>
                  {person.profilePath ? (
                    <img src={person.profilePath} alt={person.name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', marginBottom: '6px' }} />
                  ) : (
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#1A1A1A', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#444' }}>
                      {person.name.charAt(0)}
                    </div>
                  )}
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#E5E5E5', margin: 0 }}>{person.name}</p>
                  <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '10px', color: '#666', margin: '2px 0 0' }}>{person.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended */}
        {(movie.recommendations?.results?.length > 0 || movie.similar?.results?.length > 0) && (
          <div style={{ marginTop: '36px', marginBottom: '48px' }}>
            <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#E5E5E5', margin: '0 0 14px' }}>RECOMMENDED</h3>
            <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }} className="ms-scroll">
              {(movie.recommendations?.results || movie.similar?.results || []).slice(0, 10).map(
                (item: { id: number; title: string; posterPath: string | null; voteAverage: number; year: string; mediaType: string }) => (
                  <MuraStreamCard key={item.id} item={item} />
                )
              )}
            </div>
          </div>
        )}

        {/* Trailer Modal */}
        {showTrailer && trailer && (
          <div onClick={() => setShowTrailer(false)} style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '800px', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden' }}>
              <iframe src={trailer.url} title="Trailer" style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
