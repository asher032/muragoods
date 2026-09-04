'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MuraStreamLoader from '../../components/MuraStreamLoader';

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
      <div style={{ padding: '48px', textAlign: 'center', color: '#666' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px' }}>Show not found</p>
        <Link href="/murastream" style={{ color: '#B85CFF', fontFamily: 'var(--font-arcade)', fontSize: '10px', textDecoration: 'none' }}>← Back to MuraStream</Link>
      </div>
    );
  }

  const trailer = show.videos?.find((v: { type: string }) => v.type === 'Trailer') || show.videos?.[0];

  return (
    <div style={{ position: 'relative' }}>
      {/* Backdrop */}
      <div style={{ position: 'relative', width: '100%', height: '400px', overflow: 'hidden' }}>
        {show.backdropPath ? (
          <img src={show.backdropPath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0A0A0A, #1A1A2E)' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, #0A0A0A 0%, rgba(10,10,10,0.7) 50%, transparent 100%)' }} />

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
          {show.posterPath && (
            <img src={show.posterPath} alt={show.name} style={{ width: '180px', borderRadius: '10px', border: '1px solid #2A2A2A', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: '280px' }}>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#E5E5E5', margin: '0 0 8px' }}>{show.name}</h1>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
              {show.year && <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#A0A0A0' }}>{show.year}</span>}
              <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666' }}>{show.number_of_seasons} Season{show.number_of_seasons !== 1 ? 's' : ''}</span>
              {show.voteAverage > 0 && <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#B85CFF' }}>★ {show.voteAverage.toFixed(1)}</span>}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
              {show.genres?.map((g: { id: number; name: string }) => (
                <span key={g.id} style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(184,92,255,0.3)', color: '#B85CFF', background: 'rgba(184,92,255,0.08)' }}>{g.name}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <Link href={`/murastream/watch?type=tv&id=${tvId}&season=1&episode=1`} style={{ background: '#B85CFF', color: '#FFF', padding: '12px 24px', borderRadius: '8px', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" fill="#fff" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
                WATCH S1 E1
              </Link>
              {trailer && (
                <button onClick={() => setShowTrailer(true)} style={{ background: '#171717', border: '1px solid #2A2A2A', color: '#888', padding: '12px 18px', borderRadius: '8px', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>🎬 TRAILER</button>
              )}
            </div>
            <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '14px', color: '#A0A0A0', lineHeight: '1.7', margin: 0 }}>{show.overview}</p>
          </div>
        </div>

        {/* Seasons & Episodes */}
        <div style={{ marginTop: '36px' }}>
          <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#E5E5E5', margin: '0 0 14px' }}>SEASONS & EPISODES</h3>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }} className="ms-scroll">
            {show.seasons?.filter((s: SeasonData) => s.seasonNumber > 0).map((season: SeasonData) => (
              <button key={season.seasonNumber} onClick={() => setSelectedSeason(season.seasonNumber)} style={{
                padding: '6px 14px', borderRadius: '6px', flexShrink: 0,
                border: selectedSeason === season.seasonNumber ? '1px solid #B85CFF' : '1px solid #2A2A2A',
                background: selectedSeason === season.seasonNumber ? 'rgba(184,92,255,0.12)' : '#171717',
                color: selectedSeason === season.seasonNumber ? '#B85CFF' : '#888',
                fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer',
              }}>S{season.seasonNumber}</button>
            ))}
          </div>

          {seasonLoading ? (
            <MuraStreamLoader fullScreen={false} text="Loading episodes..." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {seasonData.map((ep: EpisodeData) => (
                <Link key={ep.id} href={`/murastream/watch?type=tv&id=${tvId}&season=${selectedSeason}&episode=${ep.episodeNumber}`} style={{
                  display: 'flex', gap: '14px', padding: '10px', borderRadius: '10px', textDecoration: 'none', color: 'inherit',
                  background: '#111', border: '1px solid #1A1A1A', transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#2A2A2A'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#1A1A1A'}
                >
                  {ep.stillPath ? (
                    <img src={ep.stillPath} alt="" style={{ width: '120px', height: '68px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '120px', height: '68px', borderRadius: '6px', background: '#1A1A1A', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#444' }}>▶ {ep.episodeNumber}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#E5E5E5', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      E{ep.episodeNumber} • {ep.name}
                    </p>
                    <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '11px', color: '#666', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ep.overview || 'No description'}
                    </p>
                  </div>
                  {ep.voteAverage > 0 && (
                    <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#B85CFF', flexShrink: 0, alignSelf: 'center' }}>★ {ep.voteAverage.toFixed(1)}</span>
                  )}
                </Link>
              ))}
              {seasonData.length === 0 && (
                <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px', color: '#555', textAlign: 'center', padding: '24px' }}>No episodes available for this season.</p>
              )}
            </div>
          )}
        </div>

        {/* Cast */}
        {show.credits?.cast?.length > 0 && (
          <div style={{ marginTop: '36px' }}>
            <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#E5E5E5', margin: '0 0 14px' }}>CAST</h3>
            <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '8px' }} className="ms-scroll">
              {show.credits.cast.slice(0, 12).map((person: { id: number; name: string; character: string; profilePath: string | null }) => (
                <div key={person.id} style={{ textAlign: 'center', flexShrink: 0, width: '80px' }}>
                  {person.profilePath ? (
                    <img src={person.profilePath} alt="" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', marginBottom: '6px' }} />
                  ) : (
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#1A1A1A', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#444' }}>{person.name.charAt(0)}</div>
                  )}
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#E5E5E5', margin: 0 }}>{person.name}</p>
                  <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '10px', color: '#666', margin: '2px 0 0' }}>{person.character}</p>
                </div>
              ))}
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

        <div style={{ height: '60px' }} />
      </div>
    </div>
  );
}
