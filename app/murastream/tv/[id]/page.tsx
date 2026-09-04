'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MuraStreamLoader from '../../components/MuraStreamLoader';
import MuraStreamCard from '../../components/MuraStreamCard';
import { useMuraStreamStore } from '../../hooks/useMuraStreamStore';

type SeasonData = { id: number; seasonNumber: number; name: string; overview: string; posterPath: string | null; episodeCount: number; airDate: string };
type EpisodeData = { id: number; episodeNumber: number; name: string; overview: string; stillPath: string | null; airDate: string; voteAverage: number; runtime: number };
type DetailData = {
  id: number; name: string; title?: string; overview: string; posterPath: string | null; backdropPath: string | null;
  voteAverage: number; voteCount: number; firstAirDate: string; lastAirDate: string; status: string;
  genres: Array<{ id: number; name: string }>; seasons: SeasonData[];
  credits: { cast: Array<{ id: number; name: string; character: string; profilePath: string | null }>; crew: Array<{ id: number; name: string; job: string; profilePath: string | null }> };
  videos: Array<{ key: string; name: string; type: string; url: string }>;
  similar: { results: Array<{ id: number; name: string; posterPath: string | null; voteAverage: number; year: string; mediaType: string }> };
  number_of_seasons: number; number_of_episodes: number; mediaType: string; year: string;
};

export default function TvDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tvId = params.id;
  const [show, setShow] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState<EpisodeData[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const { isLiked, toggleLike, isInMyList, toggleMyList } = useMuraStreamStore();

  const fetchShow = useCallback(async () => {
    try {
      const res = await fetch(`/api/murastream/tmdb?action=tv_details&id=${tvId}`);
      if (!res.ok) throw new Error('Failed to fetch show');
      const data = await res.json();
      setShow(data);
    } catch (err) { console.error('TV fetch error:', err); }
    finally { setLoading(false); }
  }, [tvId]);

  useEffect(() => { fetchShow(); }, [fetchShow]);

  useEffect(() => {
    if (!show) return;
    async function loadSeason() {
      setSeasonLoading(true);
      try {
        const res = await fetch(`/api/murastream/tmdb?action=tv_season&id=${tvId}&season=${selectedSeason}`);
        if (res.ok) { const data = await res.json(); setSeasonData(data.episodes || []); }
      } catch { /* empty */ }
      setSeasonLoading(false);
    }
    loadSeason();
  }, [show, selectedSeason, tvId]);

  if (loading) return <MuraStreamLoader text="Loading show..." />;
  if (!show) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '16px', color: '#666' }}>Show not found</p>
        <Link href="/murastream" style={{ color: '#B85CFF', fontSize: '14px', textDecoration: 'none' }}>← Back to MuraStream</Link>
      </div>
    );
  }

  const trailer = show.videos?.find((v: { type: string }) => v.type === 'Trailer') || show.videos?.[0];
  const liked = isLiked(Number(tvId));
  const inList = isInMyList(Number(tvId));
  const mediaItem = { id: show.id, mediaType: 'tv', title: show.name, posterPath: show.posterPath, backdropPath: show.backdropPath, voteAverage: show.voteAverage, year: show.year, overview: show.overview, genreIds: show.genres?.map(g => g.id) || [], releaseDate: show.firstAirDate };

  return (
    <div className="ms-page-enter" style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Backdrop */}
      <div style={{ position: 'relative', width: '100%', height: '500px', overflow: 'hidden' }}>
        {show.backdropPath ? (
          <img src={show.backdropPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0A0A0A 0%, #1A0A2E 50%, #0A0A0A 100%)' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0A0A0A 0%, rgba(10,10,10,0.4) 40%, transparent 70%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(10,10,10,0.9) 0%, transparent 50%)' }} />

        <button onClick={() => router.back()} style={{
          position: 'absolute', top: '20px', left: '20px', zIndex: 10,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
          padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
          fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: '#E5E5E5',
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>
          </svg>
          Back
        </button>
      </div>

      <div style={{ padding: '0 32px', maxWidth: '1100px', margin: '-120px auto 0', position: 'relative' }}>
        <div style={{ display: 'flex', gap: '36px', flexWrap: 'wrap' }}>
          {show.posterPath && (
            <img src={show.posterPath} alt={show.name} style={{
              width: '200px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 12px 48px rgba(0,0,0,0.6)', flexShrink: 0,
            }} />
          )}
          <div style={{ flex: 1, minWidth: '300px', paddingTop: '8px' }}>
            <h1 style={{
              fontFamily: '-apple-system, "SF Pro Display", sans-serif',
              fontSize: '32px', fontWeight: 800, color: '#F5F5F5', margin: '0 0 10px',
              lineHeight: '1.1', letterSpacing: '-0.02em',
            }}>{show.name}</h1>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
              {show.year && <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: '#A0A0A0' }}>{show.year}</span>}
              <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: '#666' }}>· {show.number_of_seasons} Season{show.number_of_seasons !== 1 ? 's' : ''}</span>
              <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: '#666' }}>· {show.number_of_episodes} Episodes</span>
              {show.voteAverage > 0 && <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: '#B85CFF', fontWeight: 600 }}>★ {show.voteAverage.toFixed(1)}</span>}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {show.genres?.map((g: { id: number; name: string }) => (
                <span key={g.id} style={{
                  fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 500,
                  padding: '5px 14px', borderRadius: '8px',
                  border: '1px solid rgba(184,92,255,0.25)', color: '#B85CFF',
                  background: 'rgba(184,92,255,0.08)',
                }}>{g.name}</span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <Link href={`/murastream/watch?type=tv&id=${tvId}&season=1&episode=1`} style={{
                background: '#B85CFF', color: '#FFF', padding: '14px 28px', borderRadius: '12px',
                fontFamily: '-apple-system, sans-serif', fontSize: '14px', fontWeight: 700,
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: '0 4px 20px rgba(184,92,255,0.4)',
              }}>
                <svg width="16" height="16" fill="#fff" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
                Watch S1 E1
              </Link>
              <button onClick={() => toggleMyList(mediaItem)} style={{
                background: inList ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${inList ? 'rgba(184,92,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: inList ? '#B85CFF' : '#A0A0A0',
                padding: '14px 22px', borderRadius: '12px',
                fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>
                {inList ? '✓ In My List' : '+ My List'}
              </button>
              <button onClick={() => toggleLike(mediaItem)} style={{
                background: liked ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${liked ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: liked ? '#ef4444' : '#A0A0A0',
                padding: '14px 22px', borderRadius: '12px',
                fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>
                {liked ? '❤ Liked' : '♡ Like'}
              </button>
              {trailer && (
                <button onClick={() => setShowTrailer(true)} style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#A0A0A0', padding: '14px 22px', borderRadius: '12px',
                  fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}>▶ Trailer</button>
              )}
            </div>

            <p style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '15px', color: '#A0A0A0', lineHeight: '1.7', margin: 0,
            }}>{show.overview}</p>
          </div>
        </div>

        {/* Seasons & Episodes */}
        <div style={{ marginTop: '48px' }}>
          <h3 style={{
            fontFamily: '-apple-system, sans-serif', fontSize: '18px', fontWeight: 700,
            color: '#F5F5F5', margin: '0 0 18px',
          }}>Episodes</h3>

          {/* Season selector */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '20px', paddingBottom: '4px' }} className="ms-scroll">
            {show.seasons?.filter((s: SeasonData) => s.seasonNumber > 0).map((season: SeasonData) => (
              <button key={season.seasonNumber} onClick={() => setSelectedSeason(season.seasonNumber)} style={{
                padding: '8px 18px', borderRadius: '10px', flexShrink: 0,
                border: selectedSeason === season.seasonNumber ? '1px solid rgba(184,92,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
                background: selectedSeason === season.seasonNumber ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.03)',
                color: selectedSeason === season.seasonNumber ? '#B85CFF' : '#888',
                fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s',
              }}>Season {season.seasonNumber}</button>
            ))}
          </div>

          {seasonLoading ? (
            <MuraStreamLoader fullScreen={false} text="Loading episodes..." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {seasonData.map((ep: EpisodeData) => (
                <Link key={ep.id} href={`/murastream/watch?type=tv&id=${tvId}&season=${selectedSeason}&episode=${ep.episodeNumber}`} style={{
                  display: 'flex', gap: '16px', padding: '12px', borderRadius: '12px',
                  textDecoration: 'none', color: 'inherit',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(184,92,255,0.2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                >
                  {ep.stillPath ? (
                    <img src={ep.stillPath} alt="" style={{
                      width: '140px', height: '80px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0,
                    }} />
                  ) : (
                    <div style={{
                      width: '140px', height: '80px', borderRadius: '8px', background: '#141414', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: '#333',
                    }}>▶ {ep.episodeNumber}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: '-apple-system, sans-serif', fontSize: '14px', fontWeight: 600,
                      color: '#E5E5E5', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      E{ep.episodeNumber} · {ep.name}
                    </p>
                    <p style={{
                      fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: '#666',
                      margin: '4px 0 0', lineHeight: '1.4',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {ep.overview || 'No description'}
                    </p>
                  </div>
                  {ep.voteAverage > 0 && (
                    <span style={{
                      fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 600,
                      color: '#B85CFF', flexShrink: 0, alignSelf: 'center',
                    }}>★ {ep.voteAverage.toFixed(1)}</span>
                  )}
                </Link>
              ))}
              {seasonData.length === 0 && (
                <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '14px', color: '#555', textAlign: 'center', padding: '32px' }}>
                  No episodes available for this season.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Cast */}
        {show.credits?.cast?.length > 0 && (
          <div style={{ marginTop: '48px' }}>
            <h3 style={{
              fontFamily: '-apple-system, sans-serif', fontSize: '18px', fontWeight: 700,
              color: '#F5F5F5', margin: '0 0 18px',
            }}>Cast</h3>
            <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }} className="ms-scroll">
              {show.credits.cast.slice(0, 12).map((person: { id: number; name: string; character: string; profilePath: string | null }) => (
                <div key={person.id} style={{ textAlign: 'center', flexShrink: 0, width: '90px' }}>
                  {person.profilePath ? (
                    <img src={person.profilePath} alt="" style={{
                      width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', marginBottom: '8px',
                      border: '2px solid rgba(255,255,255,0.06)',
                    }} />
                  ) : (
                    <div style={{
                      width: '72px', height: '72px', borderRadius: '50%', background: '#141414',
                      margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: '-apple-system, sans-serif', fontSize: '20px', color: '#444',
                      border: '2px solid rgba(255,255,255,0.06)',
                    }}>{person.name.charAt(0)}</div>
                  )}
                  <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 600, color: '#E5E5E5', margin: 0 }}>{person.name}</p>
                  <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '11px', color: '#666', margin: '2px 0 0' }}>{person.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar */}
        {show.similar?.results?.length > 0 && (
          <div style={{ marginTop: '48px', marginBottom: '60px' }}>
            <h3 style={{
              fontFamily: '-apple-system, sans-serif', fontSize: '18px', fontWeight: 700,
              color: '#F5F5F5', margin: '0 0 18px',
            }}>More Like This</h3>
            <div style={{ display: 'flex', gap: '18px', overflowX: 'auto', paddingBottom: '8px' }} className="ms-scroll">
              {show.similar.results.slice(0, 10).map(
                (item: { id: number; name: string; posterPath: string | null; voteAverage: number; year: string; mediaType: string }) => (
                  <MuraStreamCard key={item.id} item={{ ...item, title: item.name }} />
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

        <div style={{ height: '60px' }} />
      </div>
    </div>
  );
}
