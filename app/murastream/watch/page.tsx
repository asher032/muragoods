'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';
import { usePlayback } from '@/app/lib/murastream/playback/client';
import { normalizeMediaForPlayback } from '@/app/lib/murastream/playback/normalize';
import PlaybackStatePanel from '../components/PlaybackStatePanel';
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
// Viewer-facing states map directly to the resolver's real outcome. Nothing is
// relabelled to look more available than it is, and no internal reason code is
// shown to a viewer — that lives in the admin panel.

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // mediaType is read from the URL and normalized through the ONE canonical
  // function. It used to be `rawType === 'tv' ? 'tv' : 'movie'`, which meant
  // a K-drama link, a series link, or a typo silently became a MOVIE request:
  // the single most damaging form of the movie/TV confusion, because it looked
  // like it worked. An undeterminable type now stops here with a specific
  // message instead of guessing.
  const normalizedType = normalizeMediaForPlayback(searchParams.get('type'));
  const type: 'movie' | 'tv' = 'reason' in normalizedType ? 'movie' : normalizedType.mediaType;
  /** Whether we could determine what kind of title this is at all. */
  const typeKnown = !('reason' in normalizedType);
  const id = Number(searchParams.get('id') || 0);
  const season = Number(searchParams.get('season') || 0);
  const episode = Number(searchParams.get('episode') || 1);

  const { addToHistory, episodeProgress, markEpisodeWatched } = useMuraStreamStore();
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [muted, setMuted] = useState(false);
  // PLAYER_INIT_FAILED is its own state, distinct from any resolver outcome.
  // A source that resolved and validated but then failed to start playing is
  // NOT "this title isn't available" — and must never be rendered as one.
  const [playerFault, setPlayerFault] = useState<string | null>(null);

  const { phase, source, trailers, message, answer, reload, retryable, cooldownMs } = usePlayback({
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

  // A NEW source (episode switch, new title) clears any previous player fault,
// so a stale player error cannot survive into the next resolution.
  useEffect(() => { setPlayerFault(null); }, [source?.url]);

  const isHls = source?.container === 'hls';
  const isDirectVideo = source?.container === 'mp4';

  // HLS is only playable natively where the browser supports it (Safari, iOS).
  // Elsewhere the user is told plainly rather than shown a dead black frame
  // that looks like a broken player.
  const [hlsSupported, setHlsSupported] = useState(true);
  useEffect(() => {
    if (!isHls) return;
    setHlsSupported(document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '');
  }, [isHls]);

  const panelPhase = playerFault ? 'error' : (phase === 'ready' ? 'loading' : phase);

  // Every hook above has run, so returning here is safe. A request we cannot
  // classify is never sent to the resolver — guessing is how a series ended up
  // in the movie resolver.
  if (!typeKnown || id <= 0) {
    return (
      <main style={{ minHeight: '100vh', background: '#0b0b0f', color: '#f5f5f5', padding: '16px' }}>
        <PlaybackStatePanel
          phase="error"
          message={typeKnown
            ? 'That title link is missing a valid title id.'
            : 'That link does not say whether it is a movie or a series, so we cannot start the right player.'}
        />
      </main>
    );
  }

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
          {phase !== 'ready' && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 12 }}>
              <PlaybackStatePanel
                phase={panelPhase}
                message={message}
                onRetry={() => void reload()}
                retryable={retryable}
                cooldownMs={cooldownMs}
                trailers={trailers}
                requestId={answer?.requestId}
              />
            </div>
          )}

          {phase === 'ready' && source && playerFault && (
            // The source RESOLVED and validated; the player is what failed.
            // Reported as its own fault with its own retry, never relabelled
            // as an unavailable title.
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 12 }}>
              <PlaybackStatePanel
                phase="error"
                message="Playback couldn't be started. The source loaded but the player could not begin."
                onRetry={() => { setPlayerFault(null); void reload(); }}
                retryable
                requestId={answer?.requestId}
              />
            </div>
          )}

          {phase === 'ready' && source && !playerFault && (
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
                  onError={() => setPlayerFault('PLAYER_INIT_FAILED')}
                />
              )}
              {isHls && hlsSupported && (
                <video
                  key={`${source.mediaType}-${source.season}-${source.episode}-${source.url}`}
                  src={source.url}
                  controls
                  autoPlay
                  playsInline
                  muted={muted}
                  style={{ width: '100%', height: '100%', background: '#000' }}
                  onError={() => setPlayerFault('PLAYER_INIT_FAILED')}
                />
              )}
              {isHls && !hlsSupported && (
                // PLAYER_INCOMPATIBLE, stated honestly. No silent black frame.
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 12 }}>
                  <PlaybackStatePanel
                    phase="error"
                    message="Your browser can't play this video format."
                  />
                </div>
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