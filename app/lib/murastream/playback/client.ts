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
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  season: number | null;
  episode: number | null;
  sources: ResolvedSource[];
  trailers: Array<Pick<ResolvedSource, 'provider' | 'kind' | 'label' | 'url' | 'container'>>;
  canPlay: boolean;
  requestId?: string;
}

export type PlaybackPhase = 'loading' | 'ready' | 'unavailable';

/**
 * Resolves playback for one title (and one episode, for TV).
 *
 * `reload` is what makes episode switching correct: changing season/episode
 * produces a new request whose key includes BOTH numbers, so the answer for
 * S01E01 can never be reused for S01E02.
 */
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
  const requestSeq = useRef(0);

  const resolve = useCallback(async () => {
    if (!enabled || !tmdbId || tmdbId <= 0) {
      setPhase('unavailable');
      return;
    }
    const seq = ++requestSeq.current;
    setPhase('loading');

    const qs = new URLSearchParams({ mediaType, tmdbId: String(tmdbId) });
    // Season/episode are only ever sent for TV. The movie path is built
    // without them, so it can never accidentally resolve an episode.
    if (mediaType === 'tv') {
      qs.set('season', String(season ?? 1));
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
      // A slower response for a previous episode must never overwrite the
      // current one — that is the "wrong episode plays" bug.
      if (seq !== requestSeq.current) return;
      if (!body || !body.status) {
        setPhase('unavailable');
        setAnswer(null);
        return;
      }
      setAnswer(body);
      setPhase(body.canPlay ? 'ready' : 'unavailable');
    } catch {
      if (seq !== requestSeq.current) return;
      setPhase('unavailable');
    } finally {
      clearTimeout(timer);
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
    message: answer?.message ?? 'Playback source unavailable.',
    reload: resolve,
  };
}