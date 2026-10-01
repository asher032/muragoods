import { NextResponse } from 'next/server';
import { resolvePlayback } from '@/app/lib/murastream/playback/resolver';
import { setValidationOrigin } from '@/app/lib/murastream/playback/validate';
import { REASON_MESSAGE, type ResolveResult } from '@/app/lib/murastream/playback/types';
import { logPlaybackFailure, logPlaybackResolved, newRequestId } from '@/app/lib/murastream/playback/log';
import { getSessionUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/murastream/playback?mediaType=tv&tmdbId=1399&season=1&episode=4
//
// The single playback entry point. Returns a structured, honest answer:
// PLAYABLE with validated authorized sources, or a real reason code.
//
// The response deliberately OMITS `diagnostics` and never echoes a provider
// URL, status line or upstream error. Detail goes to the server log only.

// No caching at the HTTP layer: the resolver owns cache state, and a cached
// HTTP response would resurrect a failure the resolver has already recovered
// from.
const noStore = { 'Cache-Control': 'no-store' } as const;

function publicView(result: ResolveResult) {
  // A playable result has nothing to report, so `message` is empty rather than
  // the failure text — otherwise a working source ships a "unavailable"
  // string alongside it and any consumer rendering both looks broken.
  const message = result.status === 'PLAYABLE' || !result.reason
    ? ''
    : REASON_MESSAGE[result.reason];
  return {
    status: result.status,
    reason: result.reason,
    message,
    mediaType: result.mediaType,
    tmdbId: result.tmdbId,
    season: result.season,
    episode: result.episode,
    // Only populated on PLAYABLE. A trailer is never handed over as a
    // playable source; it is a separate, clearly-labelled field.
    sources: result.status === 'PLAYABLE' ? result.sources : [],
    trailers: result.trailers.map((t) => ({
      provider: t.provider,
      kind: t.kind,
      label: t.label,
      url: t.url,
      container: t.container,
    })),
    canPlay: result.status === 'PLAYABLE',
  };
}

export async function GET(req: Request) {
  const requestId = newRequestId();
  const started = Date.now();
  const { searchParams, origin } = new URL(req.url);

  // Validate first-party assets against the origin that will actually serve
  // them. Without this the validator probes a hardcoded localhost and reports
  // a healthy asset as unavailable on every host but that one.
  setValidationOrigin(origin);

  const mediaType: 'movie' | 'tv' = searchParams.get('mediaType') === 'tv' ? 'tv' : 'movie';
  const tmdbId = Number(searchParams.get('tmdbId') || 0);
  const seasonRaw = searchParams.get('season');
  const episodeRaw = searchParams.get('episode');
  const season = seasonRaw === null ? null : Number(seasonRaw);
  const episode = episodeRaw === null ? null : Number(episodeRaw);

  // userId is for logging only; it is derived server-side from the session and
  // never influences which sources are returned.
  const viewer = await getSessionUser(req).catch(() => null);

  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    logPlaybackFailure({
      requestId,
      userId: viewer?.userId,
      mediaType,
      tmdbId,
      season,
      episode,
      reason: 'INVALID_REQUEST',
      status: 'UNAVAILABLE',
      responseTimeMs: Date.now() - started,
    });
    return NextResponse.json(
      { status: 'UNAVAILABLE', reason: 'INVALID_REQUEST', message: REASON_MESSAGE.INVALID_REQUEST, sources: [], trailers: [], canPlay: false },
      { status: 400, headers: noStore },
    );
  }

  // Season/episode are only meaningful for TV, and are dropped for a movie so
  // the movie path can never receive them.
  const request = mediaType === 'tv'
    ? { mediaType, tmdbId, season, episode }
    : { mediaType, tmdbId };

  const result = await resolvePlayback(request);

  const elapsed = Date.now() - started;
  if (result.status === 'PLAYABLE') {
    logPlaybackResolved({
      requestId,
      userId: viewer?.userId,
      mediaType,
      tmdbId,
      season: result.season,
      episode: result.episode,
      source: result.sources[0]?.provider ?? null,
      httpStatus: null,
      status: result.status,
      responseTimeMs: elapsed,
      reason: null,
    });
  } else {
    logPlaybackFailure({
      requestId,
      userId: viewer?.userId,
      mediaType,
      tmdbId,
      season: result.season,
      episode: result.episode,
      source: result.diagnostics?.[0]?.provider ?? null,
      reason: result.reason ?? 'UNAVAILABLE',
      httpStatus: result.diagnostics?.[0]?.httpStatus ?? null,
      status: result.status,
      responseTimeMs: elapsed,
    });
  }

  // METADATA_AVAILABLE is a normal answer, not an error: TMDB knows the title
  // and Murastream simply has no authorized source for it. 200 with an
  // honest status, so the UI can render the distinction rather than a
  // failure.
  return NextResponse.json({ ...publicView(result), requestId }, { status: 200, headers: noStore });
}