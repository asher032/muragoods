'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/app/components/Sidebar';

type SeasonData = {
  id: number;
  seasonNumber: number;
  name: string;
  overview: string;
  posterPath: string | null;
  episodeCount: number;
  airDate: string;
};

type EpisodeData = {
  id: number;
  episodeNumber: number;
  name: string;
  overview: string;
  stillPath: string | null;
  airDate: string;
  voteAverage: number;
  runtime: number;
};

type DetailData = {
  id: number;
  name: string;
  title?: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  firstAirDate: string;
  lastAirDate: string;
  status: string;
  genres: Array<{ id: number; name: string }>;
  seasons: SeasonData[];
  credits: {
    cast: Array<{ id: number; name: string; character: string; profilePath: string | null }>;
    crew: Array<{ id: number; name: string; job: string; profilePath: string | null }>;
  };
  videos: Array<{ key: string; name: string; type: string; url: string }>;
  similar: { results: Array<{ id: number; name: string; posterPath: string | null; voteAverage: number; year: string; mediaType: string }> };
  number_of_seasons: number;
  number_of_episodes: number;
  mediaType: string;
  year: string;
  created_by: Array<{ name: string }>;
  networks: Array<{ name: string }>;
};

export default function TvDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tvId = params.id;

  const [show, setShow] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState<EpisodeData[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [activeSource, setActiveSource] = useState('vidking');
  const [showTrailer, setShowTrailer] = useState(false);

  const fetchShow = useCallback(async () => {
    try {
      const res = await fetch(`/api/murastream/tmdb?action=tv_details&id=${tvId}`);
      if (!res.ok) throw new Error('Failed to fetch show');
      const data = await res.json();
      setShow(data);
    } catch (err) {
      console.error('TV fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [tvId]);

  useEffect(() => { fetchShow(); }, [fetchShow]);

  // Fetch season data
  useEffect(() => {
    if (!show) return;
    async function loadSeason() {
      setSeasonLoading(true);
      try {
        const res = await fetch(`/api/murastream/tmdb?action=tv_season&id=${tvId}&season=${selectedSeason}`);
        if (res.ok) {
          const data = await res.json();
          setSeasonData(data.episodes || []);
        }
      } catch { /* empty */ }
      setSeasonLoading(false);
    }
    loadSeason();
  }, [show, selectedSeason, tvId]);

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

  if (!show) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: '#666' }}>Show not found.</p>
        <Link href="/murastream" style={{ color: 'var(--mario-yellow)' }}>← Back to MuraStream</Link>
      </div>
    );
  }

  const trailer = show.videos?.find((v: { type: string }) => v.type === 'Trailer') || show.videos?.[0];

  return (
    <>
      <style jsx global>{`
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <button onClick={() => setSidebarOpen(true)} style={{
        position: 'fixed', top: '12px', left: '12px', zIndex: 200,
        background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,214,10,0.2)',
        borderRadius: '8px', padding: '8px', cursor: 'pointer',
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffd60a" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5" />
        </svg>
      </button>

      <button onClick={() => router.back()} style={{
        position: 'fixed', top: '12px', left: '52px', zIndex: 200,
        background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
        fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#999',
      }}>
        ← Back
      </button>

      {/* Backdrop */}
      <div style={{ position: 'relative', width: '100%', height: '400px', overflow: 'hidden' }}>
        {show.backdropPath ? (
          <img src={show.backdropPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          {show.posterPath && (
            <img src={show.posterPath} alt={show.name} style={{
              width: '180px', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', flexShrink: 0,
            }} />
          )}
          <div style={{ flex: 1, minWidth: '280px' }}>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: '#fff', margin: '0 0 8px' }}>
              {show.name}
            </h1>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
              {show.year && (
                <span style={{
                  fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ccc',
                  background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px',
                }}>{show.year}</span>
              )}
              <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ccc' }}>
                {show.number_of_seasons} Season{show.number_of_seasons !== 1 ? 's' : ''}
              </span>
              {show.voteAverage > 0 && (
                <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ffd60a' }}>
                  ★ {show.voteAverage.toFixed(1)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {show.genres?.map((g: { id: number; name: string }) => (
                <span key={g.id} style={{
                  fontFamily: 'var(--font-arcade)', fontSize: '7px', padding: '3px 8px', borderRadius: '6px',
                  border: '1px solid rgba(255,214,10,0.3)', color: 'var(--mario-yellow)',
                  background: 'rgba(255,214,10,0.08)',
                }}>{g.name}</span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <Link href={`/murastream/watch?type=tv&id=${tvId}&source=${activeSource}&season=1&episode=1`} style={{
                background: 'var(--mario-yellow)', color: 'var(--mario-bg)', padding: '10px 20px',
                borderRadius: '10px', fontFamily: 'var(--font-arcade)', fontSize: '9px', textDecoration: 'none',
              }}>▶ WATCH S1 E1</Link>
              {trailer && (
                <button onClick={() => setShowTrailer(true)} style={{
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff', padding: '10px 16px', borderRadius: '10px',
                  fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
                }}>🎬 TRAILER</button>
              )}
            </div>

            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: '#ccc', lineHeight: '1.6', margin: 0 }}>
              {show.overview}
            </p>
          </div>
        </div>

        {/* Source Selector */}
        <div style={{ marginTop: '24px' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#666', margin: '0 0 6px' }}>SOURCE:</p>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['vidking', 'videasy'].map(src => (
              <button key={src} onClick={() => setActiveSource(src)} style={{
                padding: '4px 10px', borderRadius: '6px',
                border: activeSource === src ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
                background: activeSource === src ? 'rgba(255,214,10,0.15)' : 'transparent',
                color: activeSource === src ? 'var(--mario-yellow)' : '#888',
                fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer', textTransform: 'capitalize',
              }}>{src}</button>
            ))}
          </div>
        </div>

        {/* Seasons & Episodes */}
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-yellow)', margin: '0 0 12px' }}>
            SEASONS & EPISODES
          </h3>

          {/* Season tabs */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }}>
            {show.seasons?.map((season: SeasonData) => (
              <button key={season.seasonNumber} onClick={() => setSelectedSeason(season.seasonNumber)} style={{
                padding: '6px 12px', borderRadius: '8px', flexShrink: 0,
                border: selectedSeason === season.seasonNumber ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
                background: selectedSeason === season.seasonNumber ? 'rgba(255,214,10,0.15)' : 'rgba(26,26,46,0.5)',
                color: selectedSeason === season.seasonNumber ? 'var(--mario-yellow)' : '#888',
                fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer',
              }}>
                S{season.seasonNumber}
              </button>
            ))}
          </div>

          {/* Episode list */}
          {seasonLoading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontFamily: 'var(--font-arcade)', fontSize: '8px' }}>
              Loading episodes...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {seasonData.map((ep: EpisodeData) => (
                <Link
                  key={ep.id}
                  href={`/murastream/watch?type=tv&id=${tvId}&source=${activeSource}&season=${selectedSeason}&episode=${ep.episodeNumber}`}
                  style={{
                    display: 'flex', gap: '12px', padding: '8px',
                    borderRadius: '10px', textDecoration: 'none', color: 'inherit',
                    background: 'rgba(26,26,46,0.5)', border: '1px solid rgba(255,255,255,0.05)',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,214,10,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(26,26,46,0.5)'}
                >
                  {ep.stillPath ? (
                    <img src={ep.stillPath} alt="" style={{ width: '120px', height: '68px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: '120px', height: '68px', borderRadius: '6px', background: '#1a1a2e', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#444',
                    }}>▶ {ep.episodeNumber}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#fff', margin: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      E{ep.episodeNumber} • {ep.name}
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: '11px', color: '#888', margin: '4px 0 0',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ep.overview || 'No description'}
                    </p>
                  </div>
                  {ep.voteAverage > 0 && (
                    <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#ffd60a', flexShrink: 0, alignSelf: 'center' }}>
                      ★ {ep.voteAverage.toFixed(1)}
                    </span>
                  )}
                </Link>
              ))}
              {seasonData.length === 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: '#666', textAlign: 'center', padding: '24px' }}>
                  No episodes available for this season.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Cast */}
        {show.credits?.cast?.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-yellow)', margin: '0 0 12px' }}>CAST</h3>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
              {show.credits.cast.slice(0, 10).map((person: { id: number; name: string; character: string; profilePath: string | null }) => (
                <div key={person.id} style={{ textAlign: 'center', flexShrink: 0, width: '80px' }}>
                  {person.profilePath ? (
                    <img src={person.profilePath} alt="" style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', marginBottom: '6px' }} />
                  ) : (
                    <div style={{
                      width: '64px', height: '64px', borderRadius: '50%', background: '#1a1a2e',
                      margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#444',
                    }}>{person.name.charAt(0)}</div>
                  )}
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '6px', color: '#fff', margin: 0 }}>{person.name}</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '9px', color: '#888', margin: 0, marginTop: '2px' }}>{person.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trailer Modal */}
        {showTrailer && trailer && (
          <div onClick={() => setShowTrailer(false)} style={{
            position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '800px', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden' }}>
              <iframe src={trailer.url} title="Trailer" style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen />
            </div>
          </div>
        )}

        <div style={{ height: '80px' }} />
      </div>
    </>
  );
}
