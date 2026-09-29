'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MuraStreamCard from '../../components/MuraStreamCard';
import MuraStreamLoader from '../../components/MuraStreamLoader';
import { useShareLink } from '../../hooks/useShareLink';
import { ShareIcon, CheckIcon } from '../../components/MuraStreamIcons';
import { useMuraStreamStore } from '../../hooks/useMuraStreamStore';
import MuraStreamComments from '../../components/MuraStreamComments';
import MuraStreamIcon from '@/app/components/icons/MuraStreamIcon';
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
  certification?: string;
  original_language?: string;
  originalLanguage?: string;
  release_date?: string;
  production_companies?: Array<{ id: number; name: string; logo_path: string | null }>;
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

function fmtRuntime(min: number): string {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtCount(n: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MovieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const movieId = params.id;

  const [movie, setMovie] = useState<DetailData | null>(null);
  const { shared, copyShareLink } = useShareLink();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { isLiked, toggleLike, isInMyList, toggleMyList } = useMuraStreamStore();
  const [activeVideo, setActiveVideo] = useState<{ key: string; name: string; url: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchMovie = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`/api/murastream/tmdb?action=movie_details&id=${movieId}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('Failed to fetch movie');
      const data = (await res.json().catch(() => null)) as DetailData | null;
      if (!data || (!data.title && !(data as DetailData).name)) throw new Error('Empty movie payload');
      setMovie(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setNotFound(false);
      } else {
        setNotFound(true);
      }
      console.error('Movie fetch error:', err);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [movieId]);

  useEffect(() => { fetchMovie(); }, [fetchMovie]);

  if (loading) return <MuraStreamLoader text="Loading movie..." />;

  if (!movie || notFound) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: '16px', color: 'var(--ms-text-faint)' }}>Movie not found</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
          <button
            type="button"
            onClick={() => void fetchMovie()}
            style={{ color: '#E50914', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Retry
          </button>
          <Link href="/murastream" style={{ color: '#E50914', fontSize: '14px', textDecoration: 'none' }}>← Back to MuraStream</Link>
        </div>
      </div>
    );
  }

  // videos arrives as a flat array from the API; some cached payloads may
  // still carry the old { results: [] } shape — normalize before reading.
  const videos: Array<{ key: string; name: string; type: string; url: string }> = Array.isArray(movie.videos)
    ? movie.videos
    : ((movie.videos as unknown as { results?: Array<{ key: string; name: string; type: string; url: string }> } | null)?.results ?? []);
  const director = movie.credits?.crew?.find((c: { job: string }) => c.job === 'Director');
  const liked = isLiked(Number(movieId));
  const inList = isInMyList(Number(movieId));
  const mediaItem = { id: movie.id, mediaType: 'movie', title: movie.title, posterPath: movie.posterPath, backdropPath: movie.backdropPath, voteAverage: movie.voteAverage, year: movie.year, overview: movie.overview, genreIds: movie.genres?.map(g => g.id) || [], releaseDate: movie.releaseDate };
  const studios = (movie.production_companies || []).filter((s) => s.logo_path).slice(0, 6);
  const runtimeLabel = fmtRuntime(movie.runtime);
  const langLabel = (movie.original_language || movie.originalLanguage || '').toUpperCase();
  const certLabel = (movie.certification || '').trim();
  const ratingLabel = movie.voteAverage > 0 ? movie.voteAverage.toFixed(1) : '';
  const releaseLabel = fmtDate(movie.releaseDate || movie.release_date || '');
  const longOverview = (movie.overview || '').length > 260;

  return (
    <div className="ms-page-enter msmd-root">
      <style>{`
        .msmd-root { position: relative; min-height: 100vh; overflow-x: clip; max-width: 100%; }
        .msmd-hero { position: relative; width: 100%; max-width: 100%; margin-top: -64px; padding-top: 64px; overflow: clip; background: #071014; }
        .msmd-backdrop { position: absolute; inset: 0; overflow: hidden; }
        .msmd-backdrop img { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
        .msmd-shade-v { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(5,10,12,0.35) 45%, #071014 100%); }
        .msmd-shade-h { position: absolute; inset: 0; background: linear-gradient(to right, rgba(4,8,10,0.82) 0%, rgba(4,8,10,0.45) 42%, rgba(4,8,10,0.05) 75%); }
        .msmd-hero-inner { position: relative; z-index: 2; max-width: 1600px; margin: 0 auto; padding: 20px 56px 0; }
        .msmd-navrow { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .msmd-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .msmd-back { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.12); color: #fff; cursor: pointer; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: background 0.2s, transform 0.2s; flex-shrink: 0; }
        .msmd-back:hover { background: rgba(255,255,255,0.14); transform: translateX(-2px); }
        .msmd-logo { display: inline-flex; align-items: center; gap: 8px; color: #E50914; font-family: var(--font-arcade); font-size: 15px; letter-spacing: 0.08em; text-decoration: none; white-space: nowrap; }
        .msmd-pill { display: flex; align-items: center; gap: 4px; background: rgba(8,12,14,0.55); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 6px; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 8px 32px rgba(0,0,0,0.35); max-width: 100%; }
        .msmd-pill a { display: inline-flex; align-items: center; gap: 7px; padding: 9px 18px; border-radius: 999px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13.5px; font-weight: 600; color: rgba(255,255,255,0.72); text-decoration: none; white-space: nowrap; transition: all 0.2s; }
        .msmd-pill a:hover { color: #fff; background: rgba(255,255,255,0.08); }
        .msmd-pill a.on { background: #f4f6f8; color: #0b0e11; }
        .msmd-pill .ic { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; color: rgba(255,255,255,0.72); transition: all 0.2s; }
        .msmd-pill .ic:hover { color: #fff; background: rgba(255,255,255,0.08); }
        .msmd-pill-sep { width: 1px; height: 22px; background: rgba(255,255,255,0.12); margin: 0 4px; flex-shrink: 0; }
        .msmd-grid { display: flex; gap: 48px; align-items: flex-end; justify-content: space-between; padding: 88px 0 64px; }
        .msmd-info { flex: 1 1 auto; min-width: 0; max-width: 780px; }
        .msmd-title { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; font-size: clamp(34px, 4.6vw, 64px); font-weight: 800; line-height: 1.04; letter-spacing: -0.02em; color: #fff; margin: 0; text-wrap: balance; }
        .msmd-genres { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 16px; font-family: -apple-system, sans-serif; font-size: 15px; font-weight: 600; color: #fff; }
        .msmd-genres .dot { color: rgba(255,255,255,0.4); font-weight: 400; }
        .msmd-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 22px; }
        .msmd-play { display: inline-flex; align-items: center; gap: 9px; background: #f4f6f8; color: #0b0e11; border: none; padding: 13px 30px; border-radius: 999px; font-family: -apple-system, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 6px 24px rgba(0,0,0,0.35); }
        .msmd-play:hover { transform: translateY(-1px); box-shadow: 0 10px 30px rgba(0,0,0,0.45); }
        .msmd-circ { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; background: rgba(10,14,16,0.55); border: 1px solid rgba(255,255,255,0.16); color: #fff; cursor: pointer; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: all 0.2s; flex-shrink: 0; }
        .msmd-circ:hover { background: rgba(255,255,255,0.14); transform: translateY(-1px); }
        .msmd-circ.lit { border-color: rgba(229,9,20,0.6); color: #ff5b5b; background: rgba(229,9,20,0.16); }
        .msmd-circ.shared { border-color: rgba(6,214,160,0.6); color: #06d6a0; }
        .msmd-meta { display: flex; gap: 14px; align-items: center; flex-wrap: nowrap; margin-top: 22px; font-family: -apple-system, sans-serif; font-size: 14.5px; color: #fff; font-weight: 600; }
        .msmd-meta .dim { color: rgba(255,255,255,0.66); font-weight: 500; }
        .msmd-meta .cert { border: 1px solid rgba(255,255,255,0.35); border-radius: 5px; padding: 1px 7px; font-size: 12.5px; font-weight: 700; }
        .msmd-meta .star { color: #ffd60a; display: inline-flex; align-items: center; gap: 5px; }
        .msmd-meta .votes { color: rgba(255,255,255,0.55); font-weight: 500; font-size: 13px; }
        .msmd-director { margin-top: 10px; font-family: -apple-system, sans-serif; font-size: 14px; color: rgba(255,255,255,0.55); }
        .msmd-director strong { color: #fff; font-weight: 600; }
        .msmd-overview { margin: 16px 0 0; max-width: 720px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 15.5px; line-height: 1.65; color: rgba(255,255,255,0.78); }
        .msmd-overview.clamped { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .msmd-more { margin-top: 8px; background: none; border: none; padding: 0; color: #fff; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: -apple-system, sans-serif; }
        .msmd-more:hover { text-decoration: underline; }
        .msmd-card { width: 300px; flex-shrink: 0; background: rgba(10,15,18,0.55); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.35); }
        .msmd-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 20px; font-size: 13.5px; }
        .msmd-row + .msmd-row { border-top: 1px solid rgba(255,255,255,0.08); }
        .msmd-row .k { color: rgba(255,255,255,0.5); font-family: -apple-system, sans-serif; }
        .msmd-row .v { color: #fff; font-weight: 600; font-family: -apple-system, sans-serif; text-align: right; }
        .msmd-studios { display: flex; gap: 22px; align-items: center; justify-content: flex-end; flex-wrap: wrap; margin-top: 20px; }
        .msmd-studios img { height: 26px; width: auto; max-width: 120px; object-fit: contain; opacity: 0.62; filter: brightness(0) invert(1); transition: opacity 0.2s; }
        .msmd-studios img:hover { opacity: 1; }
        .msmd-body { max-width: 1600px; margin: 0 auto; padding: 8px 56px 40px; }
        .msmd-sec { margin-top: 64px; }
        .msmd-sec-h { font-family: -apple-system, sans-serif; font-size: 22px; font-weight: 800; color: #fff; margin: 0 0 22px; letter-spacing: -0.01em; }
        .msmd-rail { display: flex; gap: 28px; overflow-x: auto; overflow-y: hidden; padding: 4px 4px 14px; scroll-behavior: smooth; }
        .msmd-rail::-webkit-scrollbar { height: 6px; }
        .msmd-rail::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 3px; }
        .msmd-rail::-webkit-scrollbar-track { background: transparent; }
        .msmd-cast { flex-shrink: 0; width: 104px; text-align: center; }
        .msmd-cast img, .msmd-cast .ph { width: 88px; height: 88px; border-radius: 50%; object-fit: cover; margin: 0 auto 10px; border: 2px solid rgba(255,255,255,0.09); display: block; }
        .msmd-cast .ph { background: #161616; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: #4a4a4a; font-family: -apple-system, sans-serif; }
        .msmd-cast .n { font-size: 13px; font-weight: 700; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: -apple-system, sans-serif; }
        .msmd-cast .c { font-size: 12px; color: var(--ms-text-faint); margin: 3px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: -apple-system, sans-serif; }
        .msmd-trailer { position: relative; flex-shrink: 0; width: min(360px, 78vw); aspect-ratio: 16/9; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.09); cursor: pointer; background: #0d0d0d; padding: 0; text-align: left; transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s; }
        .msmd-trailer:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.22); box-shadow: 0 14px 40px rgba(0,0,0,0.5); }
        .msmd-trailer img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .msmd-trailer .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.1) 100%); }
        .msmd-trailer .play { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 52px; height: 52px; border-radius: 50%; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.3); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px); }
        .msmd-trailer .cap { position: absolute; left: 14px; right: 14px; bottom: 12px; }
        .msmd-trailer .cap .t { font-size: 13.5px; font-weight: 700; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: -apple-system, sans-serif; }
        .msmd-trailer .cap .y { font-size: 11.5px; color: rgba(255,255,255,0.6); margin: 2px 0 0; font-family: -apple-system, sans-serif; }
        @media (max-width: 1100px) {
          .msmd-grid { flex-direction: column; align-items: stretch; gap: 32px; padding-top: 64px; }
          .msmd-info { max-width: 100%; }
          .msmd-card { width: 100%; max-width: 560px; }
          .msmd-studios { justify-content: flex-start; }
        }
        @media (max-width: 767px) {
          .msmd-hero { margin-top: -56px; padding-top: 56px; }
          .msmd-hero-inner { padding: 14px 20px 0; }
          .msmd-body { padding: 8px 20px 32px; }
          .msmd-logo span { display: none; }
          .msmd-pill a { padding: 8px 13px; font-size: 12.5px; }
          .msmd-pill a.hide-m { display: none; }
          .msmd-grid { padding: 56px 0 48px; gap: 26px; }
          .msmd-meta { flex-wrap: wrap; row-gap: 8px; }
          .msmd-overview { font-size: 14.5px; }
          .msmd-sec { margin-top: 48px; }
          .msmd-rail { gap: 20px; }
          .msmd-cast { width: 88px; }
          .msmd-cast img, .msmd-cast .ph { width: 76px; height: 76px; }
        }
      `}</style>

      {/* ─── Cinematic hero ─── */}
      <section className="msmd-hero">
        <div className="msmd-backdrop" aria-hidden>
          {movie.backdropPath ? (
            <img src={movie.backdropPath} alt="" fetchPriority="high" />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #071014 0%, #131a2e 55%, #071014 100%)' }} />
          )}
          <div className="msmd-shade-v" />
          <div className="msmd-shade-h" />
        </div>

        <div className="msmd-hero-inner">
          {/* Floating navigation */}
          <div className="msmd-navrow">
            <div className="msmd-brand">
              <button type="button" className="msmd-back" onClick={() => router.back()} aria-label="Go back">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8" />
                </svg>
              </button>
              <Link href="/murastream" className="msmd-logo" aria-label="Murastream home">
                <MuraStreamIcon size={24} color="#E50914" />
                <span>MURASTREAM</span>
              </Link>
            </div>
            <nav className="msmd-pill" aria-label="Murastream sections">
              <Link href="/murastream">Home</Link>
              <Link href="/murastream?tab=movies" className="on" aria-current="page">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden>
                  <path d="M0 1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm4 0v6h8V1zm8 8H4v6h8zM1 1v2h2V1zm2 3H1v2h2zM1 7v2h2V7zm2 3H1v2h2zm-2 3v2h2v-2zM15 1h-2v2h2zm-2 3h2v2h-2zm2 3h-2v2h2zm-2 3h2v2h-2zm2 3h-2v2h2z" />
                </svg>
                Movies
              </Link>
              <Link href="/murastream?tab=tv" className="hide-m">Shows</Link>
              <Link href="/murastream/my-list">My List</Link>
              <span className="msmd-pill-sep" aria-hidden />
              <Link href="/murastream/search" className="ic" aria-label="Search">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden>
                  <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.442.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10" />
                </svg>
              </Link>
              <Link href="/murastream/settings" className="ic" aria-label="Settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden>
                  <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0" />
                  <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.433-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.292-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.292c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z" />
                </svg>
              </Link>
            </nav>
          </div>

          {/* Hero content */}
          <div className="msmd-grid">
            <div className="msmd-info">
              <h1 className="msmd-title">{movie.title || movie.name}</h1>
              {movie.genres?.length > 0 && (
                <div className="msmd-genres" aria-label="Genres">
                  {movie.genres.slice(0, 3).map((g, i) => (
                    <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      {i > 0 && <span className="dot" aria-hidden>•</span>}
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="msmd-actions">
                <Link href={`/murastream/watch?type=movie&id=${movieId}`} className="msmd-play">
                  <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16" aria-hidden>
                    <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393" />
                  </svg>
                  Play
                </Link>
                <button
                  type="button"
                  className={`msmd-circ${inList ? ' lit' : ''}`}
                  onClick={() => toggleMyList(mediaItem)}
                  aria-label={inList ? 'Remove from My List' : 'Add to My List'}
                  title={inList ? 'In My List' : 'Add to My List'}
                  aria-pressed={inList}
                >
                  {inList ? (
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022" /></svg>
                  ) : (
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden><path fillRule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2" /></svg>
                  )}
                </button>
                <button
                  type="button"
                  className={`msmd-circ${liked ? ' lit' : ''}`}
                  onClick={() => toggleLike(mediaItem)}
                  aria-label={liked ? 'Unlike' : 'Like'}
                  title={liked ? 'Liked' : 'Like'}
                  aria-pressed={liked}
                >
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden>
                    <path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`msmd-circ${shared ? ' shared' : ''}`}
                  onClick={() => copyShareLink({ id: String(movieId), mediaType: 'movie', title: movie.title || movie.name })}
                  aria-label="Share"
                  title={shared ? 'Link copied' : 'Share'}
                >
                  {shared ? <CheckIcon size={15} /> : <ShareIcon size={15} />}
                </button>
              </div>

              <div className="msmd-meta" aria-label="Movie facts">
                {movie.year && <span>{movie.year}</span>}
                {runtimeLabel && <span className="dim">{runtimeLabel}</span>}
                {certLabel && <span className="cert">{certLabel}</span>}
                {ratingLabel && (
                  <span className="star">
                    <Star size={14} color="#ffd60a" fill="#ffd60a" aria-hidden /> {ratingLabel}
                    {movie.voteCount > 0 && <span className="votes">({fmtCount(movie.voteCount)})</span>}
                  </span>
                )}
              </div>

              {director && (
                <p className="msmd-director">
                  Director: <strong>{director.name}</strong>
                </p>
              )}

              {movie.overview && (
                <>
                  <p className={`msmd-overview${!expanded && longOverview ? ' clamped' : ''}`}>
                    {movie.overview}
                  </p>
                  {longOverview && (
                    <button type="button" className="msmd-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                      {expanded ? 'Show less' : 'More'}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Right info card */}
            <div>
              <div className="msmd-card" aria-label="Details">
                <div className="msmd-row"><span className="k">Runtime</span><span className="v">{runtimeLabel || '—'}</span></div>
                <div className="msmd-row"><span className="k">Language</span><span className="v">{langLabel || '—'}</span></div>
                <div className="msmd-row"><span className="k">Release Date</span><span className="v">{releaseLabel}</span></div>
              </div>
              {studios.length > 0 && (
                <div className="msmd-studios" aria-label="Production companies">
                  {studios.map((s) => (
                    <img
                      key={s.id}
                      src={`https://image.tmdb.org/t/p/w200${s.logo_path}`}
                      alt={s.name}
                      title={s.name}
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Body sections ─── */}
      <div className="msmd-body">
        {movie.credits?.cast?.length > 0 && (
          <section className="msmd-sec" aria-label="Cast">
            <h2 className="msmd-sec-h">Cast</h2>
            <div className="msmd-rail ms-scroll">
              {movie.credits.cast.slice(0, 15).map((person) => (
                <div key={person.id} className="msmd-cast">
                  {person.profilePath ? (
                    <img src={person.profilePath} alt={person.name} loading="lazy" />
                  ) : (
                    <span className="ph" aria-hidden>{person.name.charAt(0)}</span>
                  )}
                  <p className="n" title={person.name}>{person.name}</p>
                  <p className="c" title={person.character}>{person.character}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {videos.length > 0 && (
          <section className="msmd-sec" aria-label="Trailers">
            <h2 className="msmd-sec-h">Trailers</h2>
            <div className="msmd-rail ms-scroll">
              {videos.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className="msmd-trailer"
                  onClick={() => setActiveVideo({ key: v.key, name: v.name, url: v.url })}
                  aria-label={`Play ${v.name}`}
                >
                  <img src={`https://i.ytimg.com/vi/${v.key}/hqdefault.jpg`} alt="" loading="lazy" />
                  <span className="shade" aria-hidden />
                  <span className="play" aria-hidden>
                    <svg width="18" height="18" fill="#fff" viewBox="0 0 16 16"><path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393" /></svg>
                  </span>
                  <span className="cap">
                    <p className="t">{v.name}</p>
                    <p className="y">{v.type || 'Video'}</p>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Comments — existing functional system, not mock data */}
        <MuraStreamComments mediaType="movie" tmdbId={Number(movieId)} title={movie.title || 'this movie'} />

        {(movie.recommendations?.results?.length > 0 || movie.similar?.results?.length > 0) && (
          <section className="msmd-sec" aria-label="Recommended" style={{ marginTop: 8 }}>
            <h2 className="msmd-sec-h">Recommended</h2>
            <div className="msmd-rail ms-scroll">
              {(movie.recommendations?.results || movie.similar?.results || []).slice(0, 10).map((item) => (
                <MuraStreamCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* Trailer modal */}
        {activeVideo && (
          <div onClick={() => setActiveVideo(null)} style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '90%', maxWidth: '900px', aspectRatio: '16/9',
              borderRadius: '16px', overflow: 'hidden',
              boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
            }}>
              <iframe src={activeVideo.url} title={activeVideo.name} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
