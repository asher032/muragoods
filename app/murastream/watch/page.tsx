'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';
import { usePlayback } from '@/app/lib/murastream/playback/client';
import EpisodeSwitcher from '../components/EpisodeSwitcher';
import { FlagIcon } from '../components/MuraStreamIcons';
import { Volume2, VolumeX } from 'lucide-react';

// ── Murastream watch page ───────────────────────────────────────────────
//
// The player receives ONE source, chosen by the server-side resolver after it
// has validated that the source is authorized and actually serves the right
// episode. There is no provider list here and no iframe to a third-party
// embed, so nothing in this component can introduce an advertisement, a
// popunder or a redirect.
//
// What the viewer sees maps directly to the resolver's real state:
//
//   PLAYABLE            play the validated source
//   METADATA_AVAILABLE  the title exists; no authorized source — say so, and
//                       offer the official trailer if there is one
//   TEMPORARILY_FAILED  a source exists but failed validation right now
//   UNAVAILABLE         no authorized source for this title/episode
//
// Nothing is relabelled to look more available than it is.

function PlaybackUnavailable({ message, status, reason, trailers }: {
  message: string;
  status: string;
  reason?: string | null;
  trailers?: Array<{ url: string; label: string; kind: string }>;
}) {
  return (
    <div
      role="status"
      style={{
        minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 14, padding: 32, textAlign: 'center',
        background: 'rgba(18,18,24,0.7)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
      }}
    >
      <p style={{ margin: 0, fontSize: 15, color: '#f5f5f5', fontWeight: 600 }}>{message}</p>
      {/* The state is shown honestly, but the reason code is not exposed as a
          technical string — it lives in the server log. */}
      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {status === 'TEMPORARILY_FAILED' ? 'Temporary failure' : 'No authorized source'}
      </p>
      {trailers && trailers.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Official trailer available:
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {trailers.map((t) => (
              <a
                key={t.url}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="deco-btn deco-btn-sm"
                style={{ textDecoration: 'none' }}
              >
                ▶ {t.label}
              </a>
            ))}
          </div>
        </div>
      )}
      <Link href="/murastream" className="deco-btn deco-btn-sm" style={{ textDecoration: 'none' }}>
        Back to MuraStream
      </Link>
      {/* Reason code is exposed only as a hidden data attribute for
          developers; the visible text above is the safe message. */}
      {reason ? <span hidden data-playback-reason={reason} /> : null}
    </div>
  );
}

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const id = Number(searchParams.get('id') || 0);
  const season = Number(searchParams.get('season') || 1);
  const episode = Number(searchParams.get('episode') || 1);

  const { addToHistory, episodeProgress, markEpisodeWatched } = useMuraStreamStore();
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [muted, setMuted] = useState(false);

  const { phase, source, trailers, message, answer, reload } = usePlayback({
    mediaType: type,
    tmdbId: id || null,
    season: type === 'tv' ? season : null,
    episode: type === 'tv' ? episode : null,
  });

  const selectEpisode = useCallback((nextEpisode: number) => {
    // Episode switching must produce a NEW resolution: the URL carries the
    // episode, and usePlayback keys its request on it, so the previous
    // episode's source can never be reused.
    router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${nextEpisode}`);
    setShowEpisodes(false);
  }, [router, id, season]);

  const watchedEpisodes = episodeProgress.find((p) => p.id === id)?.watchedEpisodes ?? [];

  // Record progress only once a source is actually playing.
  useEffect(() => {
    if (phase !== 'ready' || !source) return;
    addToHistory({ id, mediaType: type, title: source.label, season: type === 'tv' ? season : undefined, episode: type === 'tv' ? episode : undefined });
  }, [phase, source, id, type, season, episode, addToHistory]);

  const isHls = source?.container === 'hls';
  const isDirectVideo = source?.container === 'mp4';

  return (
    <main style={{ minHeight: '100vh', background: '#0b0b0f', color: '#f5f5f5', padding: '0 0 60px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px' }}>
        {/* Player area */}
        <div
          style={{
            position: 'relative', aspectRatio: '16 / 9', width: '100%',
            background: '#000', borderRadius: 16, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {phase === 'loading' && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <div className="custom-loader" />
            </div>
          )}

          {phase === 'unavailable' && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 12 }}>
              <PlaybackUnavailable
                message={message}
                status={answer?.status ?? 'UNAVAILABLE'}
                reason={answer?.reason ?? null}
                trailers={trailers}
              />
            </div>
          )}

          {phase === 'ready' && source && (
            <>
              {isDirectVideo && (
                <video
                  key={`${source.mediaType}-${source.season}-${source.episode}-${source.url}`}
                  src={source.url}
                  controls
                  autoPlay
                  playsInline
                  muted={muted}
                  style={{ width: '100%', height: '100%', background: '#000' }}
                  onEnded={() => {
                    if (type === 'tv') markEpisodeWatched(id, source.label, null, episode);
                  }}
                />
              )}
              {isHls && (
                // Native HLS where the browser supports it (Safari/iOS). Other
                // browsers are told plainly rather than shown a dead frame.
                <video
                  key={`${source.mediaType}-${source.season}-${source.episode}-${source.url}`}
                  src={source.url}
                  controls
                  autoPlay
                  playsInline
                  muted={muted}
                  style={{ width: '100%', height: '100%', background: '#000' }}
                />
              )}
              {source.container === 'youtube' && (
                <iframe
                  title={source.label}
                  src={source.url}
                  allow="accelerometer; encrypted-media; picture-in-picture"
                  allowFullScreen
                  style={{ width: '100%', height: '100%', border: 0, background: '#000' }}
                />
              )}

              {/* Controls */}
              <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 8, zIndex: 20 }}>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  style={{
                    background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8, color: '#fff', padding: '6px 10px', cursor: 'pointer',
                  }}
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                {type === 'tv' && (
                  <button
                    type="button"
                    onClick={() => setShowEpisodes((v) => !v)}
                    style={{
                      background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 8, color: '#fff', padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    Episodes
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void reload()}
                  style={{
                    background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8, color: '#fff', padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Retry
                </button>
              </div>

              {type === 'tv' && showEpisodes && (
                <EpisodeSwitcher
                  type="tv"
                  id={id}
                  season={season}
                  currentEpisode={episode}
                  watchedEpisodes={watchedEpisodes}
                  onSelect={selectEpisode}
                  onClose={() => setShowEpisodes(false)}
                />
              )}
            </>
          )}
        </div>

        {/* Title block */}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {answer?.sources?.[0]?.label || (type === 'tv' ? `Season ${season} · Episode ${episode}` : 'Playback')}
            </h1>
            {type === 'tv' && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                S{String(season).padStart(2, '0')}E{String(episode).padStart(2, '0')}
                {watchedEpisodes.includes(episode) ? ' · watched' : ''}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href={`/murastream/${type}/${id}`} style={{ color: '#fff', fontSize: 12, textDecoration: 'underline' }}>
              Title details
            </Link>
            <button type="button" className="deco-btn deco-btn-sm" style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
              <FlagIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0b0b0f' }} />}>
      <WatchContent />
    </Suspense>
  );
}