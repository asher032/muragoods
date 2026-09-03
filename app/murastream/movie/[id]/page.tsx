'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/app/components/Sidebar';

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
  budget: number;
  revenue: number;
  productionCompanies: Array<{ name: string }>;
};

export default function MovieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const movieId = params.id;

  const [movie, setMovie] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [showTrailer, setShowTrailer] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [inFavorites, setInFavorites] = useState(false);

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



  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{
          width: '100%', height: '400px', borderRadius: '16px',
          background: 'linear-gradient(90deg, #1a1a2e 25%, #252540 50%, #1a1a2e 75%)',
          backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
        }} />
      </div>
    );
  }

  if (!movie) {
    return (
      <div style={{
        padding: '48px 16px', textAlign: 'center',
        fontFamily: 'var(--font-body)', color: '#666',
      }}>
        <p>Movie not found.</p>
        <Link href="/murastream" style={{ color: 'var(--mario-yellow)' }}>← Back to MuraStream</Link>
      </div>
    );
  }

  const trailer = movie.videos?.find((v: { type: string }) => v.type === 'Trailer') || movie.videos?.[0];
  const director = movie.credits?.crew?.find((c: { job: string }) => c.job === 'Director');
  const runtimeH = movie.runtime ? Math.floor(movie.runtime / 60) : 0;
  const runtimeM = movie.runtime ? movie.runtime % 60 : 0;

  return (
    <>
      <style jsx global>{`
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <button
        onClick={() => setSidebarOpen(true)}
        style={{
          position: 'fixed', top: '12px', left: '12px', zIndex: 200,
          background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,214,10,0.2)',
          borderRadius: '8px', padding: '8px', cursor: 'pointer',
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffd60a" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5" />
        </svg>
      </button>

      {/* Back button */}
      <button
        onClick={() => router.back()}
        style={{
          position: 'fixed', top: '12px', left: '52px', zIndex: 200,
          background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
          fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#999',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        ← Back
      </button>

      {/* Backdrop */}
      <div style={{
        position: 'relative', width: '100%', height: '400px',
        overflow: 'hidden',
      }}>
        {movie.backdropPath ? (
          <img src={movie.backdropPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(0deg, #0f0f1a 0%, rgba(15,15,26,0.7) 50%, transparent 100%)',
        }} />
      </div>

      <div style={{ padding: '0 16px', maxWidth: '1200px', margin: '-80px auto 0', position: 'relative' }}>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {/* Poster */}
          {movie.posterPath && (
            <img
              src={movie.posterPath}
              alt={movie.title}
              style={{
                width: '200px', borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                flexShrink: 0,
              }}
            />
          )}

          {/* Info */}
          <div style={{ flex: 1, minWidth: '280px' }}>
            <h1 style={{
              fontFamily: 'var(--font-arcade)', fontSize: '16px',
              color: '#fff', margin: '0 0 8px',
            }}>
              {movie.title}
            </h1>
            {movie.tagline && (
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '12px',
                color: '#999', fontStyle: 'italic', margin: '0 0 8px',
              }}>
                &ldquo;{movie.tagline}&rdquo;
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
              {movie.year && (
                <span style={{
                  fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ccc',
                  background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px',
                }}>
                  {movie.year}
                </span>
              )}
              {movie.runtime > 0 && (
                <span style={{
                  fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ccc',
                }}>
                  {runtimeH}h {runtimeM}m
                </span>
              )}
              {movie.voteAverage > 0 && (
                <span style={{
                  fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ffd60a',
                }}>
                  ★ {movie.voteAverage.toFixed(1)}
                </span>
              )}
            </div>
            {/* Genres */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {movie.genres?.map((g: { id: number; name: string }) => (
                <span key={g.id} style={{
                  fontFamily: 'var(--font-arcade)', fontSize: '7px',
                  padding: '3px 8px', borderRadius: '6px',
                  border: '1px solid rgba(255,214,10,0.3)',
                  color: 'var(--mario-yellow)', background: 'rgba(255,214,10,0.08)',
                }}>
                  {g.name}
                </span>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <Link
                href={`/murastream/watch?type=movie&id=${movieId}`}
                style={{
                  background: 'var(--mario-yellow)', color: 'var(--mario-bg)',
                  padding: '10px 20px', borderRadius: '10px',
                  fontFamily: 'var(--font-arcade)', fontSize: '9px',
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'transform 0.2s',
                }}
              >
                ▶ WATCH
              </Link>
              {trailer && (
                <button
                  onClick={() => setShowTrailer(true)}
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff', padding: '10px 16px', borderRadius: '10px',
                    fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
                  }}
                >
                  🎬 TRAILER
                </button>
              )}
            </div>

            {/* Source info */}
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#666', margin: '0 0 6px' }}>
                STREAMING SOURCES: VidRock • Videasy • Vidzee
              </p>
            </div>

            {/* Overview */}
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '13px',
              color: '#ccc', lineHeight: '1.6', margin: '0 0 16px',
            }}>
              {movie.overview}
            </p>

            {/* Director */}
            {director && (
              <p style={{
                fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#888', margin: 0,
              }}>
                DIRECTOR: <span style={{ color: '#ccc' }}>{director.name}</span>
              </p>
            )}
          </div>
        </div>

        {/* Cast */}
        {movie.credits?.cast?.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <h3 style={{
              fontFamily: 'var(--font-arcade)', fontSize: '10px',
              color: 'var(--mario-yellow)', margin: '0 0 12px',
            }}>
              CAST
            </h3>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
              {movie.credits.cast.slice(0, 10).map((person: { id: number; name: string; character: string; profilePath: string | null }) => (
                <div key={person.id} style={{
                  textAlign: 'center', flexShrink: 0, width: '80px',
                }}>
                  {person.profilePath ? (
                    <img src={person.profilePath} alt={person.name} style={{
                      width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover',
                      marginBottom: '6px',
                    }} />
                  ) : (
                    <div style={{
                      width: '64px', height: '64px', borderRadius: '50%',
                      background: '#1a1a2e', margin: '0 auto 6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#444',
                    }}>
                      {person.name.charAt(0)}
                    </div>
                  )}
                  <p style={{
                    fontFamily: 'var(--font-arcade)', fontSize: '6px',
                    color: '#fff', margin: 0, lineHeight: 1.3,
                  }}>
                    {person.name}
                  </p>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: '9px',
                    color: '#888', margin: 0, marginTop: '2px',
                  }}>
                    {person.character}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar/Recommendations */}
        {(movie.recommendations?.results?.length > 0 || movie.similar?.results?.length > 0) && (
          <div style={{ marginTop: '32px' }}>
            <h3 style={{
              fontFamily: 'var(--font-arcade)', fontSize: '10px',
              color: 'var(--mario-yellow)', margin: '0 0 12px',
            }}>
              YOU MIGHT ALSO LIKE
            </h3>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
              {(movie.recommendations?.results || movie.similar?.results || []).slice(0, 10).map(
                (item: { id: number; title: string; posterPath: string | null; voteAverage: number; year: string; mediaType: string }) => (
                  <Link
                    key={item.id}
                    href={`/murastream/movie/${item.id}`}
                    style={{ textDecoration: 'none', flexShrink: 0, width: '120px' }}
                  >
                    {item.posterPath ? (
                      <img src={item.posterPath} alt={item.title} style={{
                        width: '120px', height: '180px', borderRadius: '8px', objectFit: 'cover',
                      }} />
                    ) : (
                      <div style={{
                        width: '120px', height: '180px', borderRadius: '8px',
                        background: '#1a1a2e',
                      }} />
                    )}
                    <p style={{
                      fontFamily: 'var(--font-arcade)', fontSize: '6px',
                      color: '#ccc', margin: '4px 0 0', lineHeight: 1.3,
                    }}>
                      {item.title}
                    </p>
                  </Link>
                )
              )}
            </div>
          </div>
        )}

        {/* Trailer Modal */}
        {showTrailer && trailer && (
          <div
            onClick={() => setShowTrailer(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 999,
              background: 'rgba(0,0,0,0.9)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <div onClick={e => e.stopPropagation()} style={{
              width: '90%', maxWidth: '800px', aspectRatio: '16/9',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              <iframe
                src={trailer.url}
                title="Trailer"
                style={{ width: '100%', height: '100%', border: 'none' }}
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Bottom padding */}
        <div style={{ height: '80px' }} />
      </div>
    </>
  );
}
