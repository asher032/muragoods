'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MuraStreamCard from '../../components/MuraStreamCard';
import MuraStreamLoader from '../../components/MuraStreamLoader';
import { useShareLink } from '../../hooks/useShareLink';
import { ShareIcon, CheckIcon } from '../../components/MuraStreamIcons';
import { useMuraStreamStore } from '../../hooks/useMuraStreamStore';
import { Star } from 'lucide-react';
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
  const { shared, copyShareLink } = useShareLink();
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
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: '16px', color: 'var(--ms-text-faint)' }}>Movie not found</p>
        <Link href="/murastream" style={{ color: '#E50914', fontSize: '14px', textDecoration: 'none' }}>← Back to MuraStream</Link>
      </div>
    );
  }

  // videos arrives as a flat array from the API; some cached payloads may
  // still carry the old { results: [] } shape — normalize before reading.
  const videos: Array<{ type: string; url?: string }> = Array.isArray(movie.videos)
    ? movie.videos
    : ((movie.videos as unknown as { results?: Array<{ type: string; url?: string }> } | null)?.results ?? []);
  const trailer = videos.find((v) => v.type === 'Trailer') || videos[0];
  const director = movie.credits?.crew?.find((c: { job: string }) => c.job === 'Director');
  const runtimeH = movie.runtime ? Math.floor(movie.runtime / 60) : 0;
  const runtimeM = movie.runtime ? movie.runtime % 60 : 0;
  const liked = isLiked(Number(movieId));
  const inList = isInMyList(Number(movieId));
  const mediaItem = { id: movie.id, mediaType: 'movie', title: movie.title, posterPath: movie.posterPath, backdropPath: movie.backdropPath, voteAverage: movie.voteAverage, year: movie.year, overview: movie.overview, genreIds: movie.genres?.map(g => g.id) || [], releaseDate: movie.releaseDate };

  return (
    <div className="ms-page-enter" style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Full-width backdrop */}
      <div style={{ position: 'relative', width: '100%', height: '500px', overflow: 'hidden' }}>
        {movie.backdropPath ? (
          <img src={movie.backdropPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--ms-bg) 0%, #1A0A2E 50%, var(--ms-bg) 100%)' }} />
        )}
        {/* Cinematic gradients */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--ms-bg) 0%, rgba(10,10,10,0.4) 40%, transparent 70%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(10,10,10,0.9) 0%, transparent 50%)' }} />

        {/* Back button */}
        <button onClick={() => router.back()} style={{
          position: 'absolute', top: '20px', left: '20px', zIndex: 10,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
          padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: '13px', color: 'var(--ms-text)',
          transition: 'all 0.2s',
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>
          </svg>
          Back
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '0 32px', maxWidth: '1100px', margin: '-120px auto 0', position: 'relative' }}>
        <div style={{ display: 'flex', gap: '36px', flexWrap: 'wrap' }}>
          {/* Poster */}
          {movie.posterPath && (
            <img src={movie.posterPath} alt={movie.title} style={{
              width: '220px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 12px 48px rgba(0,0,0,0.6)', flexShrink: 0,
            }} />
          )}

          {/* Info */}
          <div style={{ flex: 1, minWidth: '300px', paddingTop: '8px' }}>
            <h1 style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              fontSize: '32px', fontWeight: 800, color: 'var(--ms-text-strong)', margin: '0 0 10px',
              lineHeight: '1.1', letterSpacing: '-0.02em',
            }}>
              {movie.title}
            </h1>
            {movie.tagline && (
              <p style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: '14px', color: '#777', fontStyle: 'italic', margin: '0 0 16px',
              }}>
                &ldquo;{movie.tagline}&rdquo;
              </p>
            )}

            {/* Meta row */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
              {movie.year && <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: 'var(--ms-text-muted)' }}>{movie.year}</span>}
              {movie.runtime > 0 && <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: 'var(--ms-text-faint)' }}>· {runtimeH}h {runtimeM}m</span>}
              {movie.voteAverage > 0 && (
                <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: '#E50914', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Star color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {movie.voteAverage.toFixed(1)}
                </span>
              )}
            </div>

            {/* Genres */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {movie.genres?.map((g: { id: number; name: string }) => (
                <span key={g.id} style={{
                  fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 500,
                  padding: '5px 14px', borderRadius: '8px',
                  border: '1px solid rgba(229,9,20,0.25)', color: '#E50914',
                  background: 'rgba(229,9,20,0.08)',
                }}>{g.name}</span>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <Link href={`/murastream/watch?type=movie&id=${movieId}`} style={{
                background: '#E50914', color: '#FFF', padding: '14px 28px', borderRadius: '12px',
                fontFamily: '-apple-system, sans-serif', fontSize: '14px', fontWeight: 700,
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: '0 4px 20px rgba(229,9,20,0.4)',
              }}>
                <svg width="16" height="16" fill="#fff" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
                Watch Now
              </Link>
              <button onClick={() => toggleMyList(mediaItem)} style={{
                background: inList ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${inList ? 'rgba(229,9,20,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: inList ? '#E50914' : 'var(--ms-text-muted)',
                padding: '14px 22px', borderRadius: '12px',
                fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                backdropFilter: 'blur(8px)',
              }}>
                {inList ? 'In My List' : '+ My List'}
              </button>
              <button onClick={() => toggleLike(mediaItem)} style={{
                background: liked ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${liked ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: liked ? '#ef4444' : 'var(--ms-text-muted)',
                padding: '14px 22px', borderRadius: '12px',
                fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>
                {liked ? 'Liked' : 'Like'}
              </button>
              {trailer && (
                <button onClick={() => setShowTrailer(true)} style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--ms-text-muted)', padding: '14px 22px', borderRadius: '12px',
                  fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}>Trailer</button>
              )}
              <button onClick={() => copyShareLink({ id: String(movieId), mediaType: 'movie', title: movie.title || movie.name })} style={{
                background: shared ? 'rgba(6,214,160,0.12)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${shared ? 'rgba(6,214,160,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: shared ? '#06d6a0' : 'var(--ms-text-muted)',
                padding: '14px 22px', borderRadius: '12px',
                fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}>
                {shared ? <CheckIcon size={13} /> : <ShareIcon size={13} />}
                {shared ? 'Link Copied' : 'Share'}
              </button>
            </div>

            {/* Overview */}
            <p style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '15px', color: 'var(--ms-text-muted)', lineHeight: '1.7', margin: 0,
            }}>
              {movie.overview}
            </p>

            {director && (
              <p style={{
                fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: 'var(--ms-text-faint)',
                marginTop: '18px',
              }}>
                Director: <span style={{ color: 'var(--ms-text)', fontWeight: 600 }}>{director.name}</span>
              </p>
            )}
          </div>
        </div>

        {/* Cast */}
        {movie.credits?.cast?.length > 0 && (
          <div style={{ marginTop: '48px' }}>
            <h3 style={{
              fontFamily: '-apple-system, sans-serif', fontSize: '18px', fontWeight: 700,
              color: 'var(--ms-text-strong)', margin: '0 0 18px',
            }}>Cast</h3>
            <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '8px' }} className="ms-scroll">
              {movie.credits.cast.slice(0, 12).map((person: { id: number; name: string; character: string; profilePath: string | null }) => (
                <div key={person.id} style={{ textAlign: 'center', flexShrink: 0, width: '90px' }}>
                  {person.profilePath ? (
                    <img src={person.profilePath} alt={person.name} style={{
                      width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', marginBottom: '8px',
                      border: '2px solid rgba(255,255,255,0.06)',
                    }} />
                  ) : (
                    <div style={{
                      width: '72px', height: '72px', borderRadius: '50%', background: '#141414',
                      margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: '-apple-system, sans-serif', fontSize: '20px', color: '#444',
                      border: '2px solid rgba(255,255,255,0.06)',
                    }}>
                      {person.name.charAt(0)}
                    </div>
                  )}
                  <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 600, color: 'var(--ms-text)', margin: 0 }}>{person.name}</p>
                  <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '11px', color: 'var(--ms-text-faint)', margin: '2px 0 0' }}>{person.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended */}
        {(movie.recommendations?.results?.length > 0 || movie.similar?.results?.length > 0) && (
          <div style={{ marginTop: '48px', marginBottom: '60px' }}>
            <h3 style={{
              fontFamily: '-apple-system, sans-serif', fontSize: '18px', fontWeight: 700,
              color: 'var(--ms-text-strong)', margin: '0 0 18px',
            }}>Recommended</h3>
            <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '8px' }} className="ms-scroll">
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
          <div onClick={() => setShowTrailer(false)} style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '90%', maxWidth: '900px', aspectRatio: '16/9',
              borderRadius: '16px', overflow: 'hidden',
              boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
            }}>
              <iframe src={trailer.url} title="Trailer" style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
