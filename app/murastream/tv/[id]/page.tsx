'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MuraStreamLoader from '../../components/MuraStreamLoader';
import MuraStreamCard from '../../components/MuraStreamCard';
import { useMuraStreamStore } from '../../hooks/useMuraStreamStore';

export default function TvDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tvId = params.id;

  const [show, setShow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState<any[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [error, setError] = useState('');
  const { isLiked, toggleLike, isInMyList, toggleMyList } = useMuraStreamStore();

  const fetchShow = useCallback(async () => {
    try {
      const res = await fetch(`/api/murastream/tmdb?action=tv_details&id=${tvId}`);
      if (!res.ok) throw new Error(`TMDB ${res.status}`);
      const data = await res.json();
      if (data && (data.name || data.title)) {
        setShow(data);
      } else {
        setError('Show not found');
      }
    } catch (err) {
      console.error('[TV Detail] TMDB failed:', err);
      setError('Failed to load show');
    }
    setLoading(false);
  }, [tvId]);

  useEffect(() => { fetchShow(); }, [fetchShow]);

  // Load season data from TMDB
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

  if (loading) return <MuraStreamLoader text="Loading show..." />;

  if (error || !show) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '16px', color: '#ef4444' }}>
          {error || 'Show not found'}
        </p>
        <Link href="/murastream" style={{ color: '#B85CFF', fontSize: '14px', textDecoration: 'none' }}>
          ← Back to MuraStream
        </Link>
      </div>
    );
  }

  const epCount = show.number_of_episodes || 0;
  const liked = isLiked(Number(tvId));
  const inList = isInMyList(Number(tvId));

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
              fontFamily: '-apple-system, sans-serif', fontSize: '32px', fontWeight: 800,
              color: '#F5F5F5', margin: '0 0 10px', lineHeight: '1.1',
            }}>{show.name}</h1>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
              {show.year && <span style={{ fontSize: '14px', color: '#A0A0A0' }}>{show.year}</span>}
              {epCount > 0 && <span style={{ fontSize: '14px', color: '#666' }}>· {epCount} Episodes</span>}
              {show.voteAverage > 0 && <span style={{ fontSize: '14px', color: '#B85CFF', fontWeight: 600 }}>★ {(show.voteAverage || 0).toFixed(1)}</span>}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {show.genres?.map((g: any) => (
                <span key={g.id} style={{
                  fontSize: '12px', fontWeight: 500, padding: '5px 14px', borderRadius: '8px',
                  border: '1px solid rgba(184,92,255,0.25)', color: '#B85CFF',
                  background: 'rgba(184,92,255,0.08)',
                }}>{g.name}</span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <Link href={`/murastream/watch?type=tv&id=${tvId}&season=1&episode=1`} style={{
                background: '#B85CFF', color: '#FFF', padding: '14px 28px', borderRadius: '12px',
                fontSize: '14px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: '0 4px 20px rgba(184,92,255,0.4)',
              }}>
                <svg width="16" height="16" fill="#fff" viewBox="0 0 16 16"><path d="M6.271 4.138a.5.5 0 0 1 .78-.172l4 2.8a.5.5 0 0 1 0 .824l-4 2.8A.5.5 0 0 1 6 10.2V5.8a.5.5 0 0 1 .271-.414z"/></svg>
                Watch S1 E1
              </Link>
              <button onClick={() => toggleMyList({ id: Number(tvId), mediaType: 'tv', title: show.name, posterPath: show.posterPath, backdropPath: show.backdropPath, voteAverage: show.voteAverage, year: show.year })} style={{
                background: inList ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${inList ? 'rgba(184,92,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: inList ? '#B85CFF' : '#A0A0A0', padding: '14px 22px', borderRadius: '12px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>{inList ? '✓ In My List' : '+ My List'}</button>
              <button onClick={() => toggleLike({ id: Number(tvId), mediaType: 'tv', title: show.name, posterPath: show.posterPath, backdropPath: show.backdropPath, voteAverage: show.voteAverage, year: show.year })} style={{
                background: liked ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${liked ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: liked ? '#ef4444' : '#A0A0A0', padding: '14px 22px', borderRadius: '12px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>{liked ? '❤ Liked' : '♡ Like'}</button>
            </div>

            {show.overview && (
              <p style={{ fontSize: '15px', color: '#A0A0A0', lineHeight: '1.7', margin: 0 }}>
                {show.overview}
              </p>
            )}
          </div>
        </div>

        {/* Season/Episode list */}
        {show.seasons?.length > 0 && (
          <div style={{ marginTop: '40px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#F5F5F5', margin: '0 0 18px' }}>Episodes</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {show.seasons.filter((s: any) => s.seasonNumber > 0 || s.seasonNumber === 0).map((s: any) => (
                <button key={s.seasonNumber} onClick={() => setSelectedSeason(s.seasonNumber)} style={{
                  padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: selectedSeason === s.seasonNumber ? 700 : 400,
                  border: selectedSeason === s.seasonNumber ? '1px solid #B85CFF' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedSeason === s.seasonNumber ? 'rgba(184,92,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: selectedSeason === s.seasonNumber ? '#B85CFF' : '#888',
                }}>S{s.seasonNumber}</button>
              ))}
            </div>
            {seasonLoading ? (
              <MuraStreamLoader fullScreen={false} text="Loading episodes..." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {seasonData.map((ep: any) => (
                  <Link
                    key={ep.episodeNumber}
                    href={`/murastream/watch?type=tv&id=${tvId}&season=${selectedSeason}&episode=${ep.episodeNumber}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px',
                      borderRadius: '10px', background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(184,92,255,0.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  >
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: 'rgba(184,92,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 700, color: '#B85CFF', flexShrink: 0,
                    }}>{ep.episodeNumber}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#E5E5E5', margin: 0 }}>{ep.name || `Episode ${ep.episodeNumber}`}</p>
                      {ep.overview && <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.overview}</p>}
                    </div>
                  </Link>
                ))}
                {seasonData.length === 0 && !seasonLoading && (
                  <p style={{ fontSize: '13px', color: '#666', textAlign: 'center', padding: '20px' }}>No episodes found</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Recommended */}
        {show.recommendations?.results?.length > 0 && (
          <div style={{ marginTop: '48px', marginBottom: '60px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#F5F5F5', margin: '0 0 18px' }}>Recommended</h3>
            <div style={{ display: 'flex', gap: '18px', overflowX: 'auto', paddingBottom: '8px' }} className="ms-scroll">
              {show.recommendations.results.slice(0, 10).map((item: any) => (
                <MuraStreamCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
