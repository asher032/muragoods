'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Client contract for the ONE playback resolver.
//
// The player never chooses a source. It asks `/api/murastream/playback`,
// which resolves and validates an authorized source server-side, and renders
// exactly what comes back. There is no provider list in the client at all,
// which is why there is nothing here that could select an ad-serving page.

export interface ResolvedSource {
  provider: string;
  authorization: 'first_party' | 'licensed';
  kind: 'FULL_PLAYBACK' | 'TRAILER' | 'PREVIEW';
  mediaType: 'movie' | 'tv';
  url: string;
  container: 'mp4' | 'hls' | 'youtube';
  tmdbId: number;
  season?: number | null;
  episode?: number | null;
  label: string;
  durationSec?: number | null;
}

export interface PlaybackAnswer {
  status: 'METADATA_AVAILABLE' | 'SOURCE_AVAILABLE' | 'PLAYABLE' | 'TEMPORARILY_FAILED' | 'UNAVAILABLE';
  reason: string | null;
  message: string;
  /** Whether offering "Try again" is honest for this specific reason. */
  retryable?: boolean;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  season: number | null;
  episode: number | null;
  sources: ResolvedSource[];
  trailers: Array<Pick<ResolvedSource, 'provider' | 'kind' | 'label' | 'url' | 'container'>>;
  canPlay: boolean;
  requestId?: string;
}

/**
 * The player states, named after what actually happened rather than after
 * the resolver's internal status codes.
 *
 *   loading   a resolution is in flight
 *   ready     a validated source exists and can be played
 *   failed    something went wrong and a retry may genuinely help
 *   blocked   the honest, permanent answer for this title/episode
 *   error     the request itself could not be completed
 *
 * `blocked` and `failed` are deliberately distinct: a title with no licensed
 * source will never start working, so it must not invite an endless retry,
 * while a provider timeout should offer one.
 */
export type PlaybackPhase = 'loading' | 'ready' | 'failed' | 'blocked' | 'error';

/**
 * Bounded retry.
 *
 * An automatic retry loop is the failure mode this guards: a provider that is
 * down would otherwise be re-requested forever, multiplying load and making a
 * transient outage look like a flood. Retries are manual after a short
 * cooldown, and the cooldown grows so a repeatedly failing title is not
 * hammered.
 */
const RETRY_COOLDOWN_MS = [0, 4_000, 15_000, 60_000];

export function usePlayback(params: {
  mediaType: 'movie' | 'tv';
  tmdbId: number | null;
  season?: number | null;
  episode?: number | null;
  enabled?: boolean;
}) {
  const { mediaType, tmdbId, season = null, episode = null, enabled = true } = params;
  const [answer, setAnswer] = useState<PlaybackAnswer | null>(null);
  const [phase, setPhase] = useState<PlaybackPhase>('loading');
  const [cooldownMs, setCooldownMs] = useState(0);

  // Monotonic request id: a slow response for an earlier episode can never
  // overwrite a newer one. This is the "wrong episode plays" fix.
  const requestSeq = useRef(0);
  // One in-flight request at a time. A second call while one is open is
  // dropped rather than duplicated.
  const inFlight = useRef(false);
  const attempt = useRef(0);

  const resolve = useCallback(async () => {
    if (!enabled || !tmdbId || tmdbId <= 0) {
      setPhase('blocked');
      return;
    }
    // Do not stack duplicate requests for the same title.
    if (inFlight.current) return;

    const wait = RETRY_COOLDOWN_MS[Math.min(attempt.current, RETRY_COOLDOWN_MS.length - 1)];
    if (wait > 0) {
      setCooldownMs(wait);
      await new Promise((r) => setTimeout(r, wait));
    }
    setCooldownMs(0);

    inFlight.current = true;
    const seq = ++requestSeq.current;
    setPhase('loading');

    const qs = new URLSearchParams({ mediaType, tmdbId: String(tmdbId) });
    // Season/episode are only ever sent for TV. The movie path is built
    // without them, so it can never accidentally resolve an episode.
    if (mediaType === 'tv') {
      qs.set('season', String(season ?? 0));
      qs.set('episode', String(episode ?? 1));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(`/api/murastream/playback?${qs.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as PlaybackAnswer | null;
      if (seq !== requestSeq.current) return;
      if (!body || !body.status) {
        setAnswer(null);
        setPhase('error');
        return;
      }
      setAnswer(body);
      if (body.canPlay) {
        attempt.current = 0;
        setPhase('ready');
        return;
      }
      // The server decides whether retrying is honest. A title with no
      // licensed source is `blocked`; a provider fault is `failed`.
      if (body.retryable) {
        attempt.current += 1;
        setPhase('failed');
      } else {
        attempt.current = 0;
        setPhase('blocked');
      }
    } catch {
      if (seq !== requestSeq.current) return;
      setAnswer(null);
      setPhase('error');
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
    }
  }, [enabled, tmdbId, mediaType, season, episode]);

  useEffect(() => { void resolve(); }, [resolve]);

  // Re-resolving on episode change is the whole contract; nothing is cached
  // in the client that could outlive the episode it was fetched for.
  const fullPlayback = answer?.sources?.find((s) => s.kind === 'FULL_PLAYBACK') ?? null;

  return {
    phase,
    answer,
    source: fullPlayback,
    trailers: answer?.trailers ?? [],
    // A fallback that is honest and viewer-facing. "No authorized source" is
    // an internal licensing term and is never shown to a viewer.
    message: answer?.message || "This title isn't available for playback right now.",
    retryable: answer?.retryable === true,
    cooldownMs,
    reload: resolve,
  };
}