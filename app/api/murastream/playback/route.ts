import { NextResponse } from 'next/server';
import { resolvePlayback } from '@/app/lib/murastream/playback/resolver';
import { validateResolveParams } from '@/app/lib/murastream/playback/request';
import { REASON_MESSAGE, isRetryable, type ResolveResult } from '@/app/lib/murastream/playback/types';
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
// URL, status line or upstream error. Detail goes to the server log only,
// reachable by an operator through the admin panel via the requestId.
//
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
  // A Try Again button is honest when the fault is a fault rather than a
  // deliberate absence. TEMPORARILY_FAILED means the resolver itself judged
  // this recoverable (a provider blip, or a registered asset that is missing
  // from the current deploy), so it is always worth retrying. A permanent
  // absence is not, and offering retry there would be an endless loop against
  // an answer that cannot change.
  const retryable = result.status === 'TEMPORARILY_FAILED' || isRetryable(result.reason);
  return {
    status: result.status,
    reason: result.reason,
    message,
    retryable,
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

  // The origin that will actually serve first-party assets is threaded through
  // to the validator per request. It was previously module-level state set by
  // whichever request ran last, so two concurrent requests could validate
  // against each other's origin.

  // userId is for logging only; it is derived server-side from the session and
  // never influences which sources are returned.
  const viewer = await getSessionUser(req).catch(() => null);

  // ── Strict validation ────────────────────────────────────────────────
  // A malformed request is a 400 with its own reason, never a coerced
  // resolve. `mediaType` is required (it used to silently default to movie),
  // `tmdbId` must be a positive integer, and season/episode are refused for
  // a movie rather than dropped.
  const outcome = validateResolveParams({
    mediaType: searchParams.get('mediaType'),
    tmdbId: searchParams.get('tmdbId'),
    season: searchParams.get('season'),
    episode: searchParams.get('episode'),
  });

  if (!outcome.ok) {
    logPlaybackFailure({
      requestId,
      userId: viewer?.userId,
      mediaType: outcome.received.mediaType || 'unknown',
      tmdbId: Number(outcome.received.tmdbId) || 0,
      season: outcome.received.season ? Number(outcome.received.season) : null,
      episode: outcome.received.episode ? Number(outcome.received.episode) : null,
      reason: outcome.reason,
      status: 'INVALID',
      responseTimeMs: Date.now() - started,
    });
    return NextResponse.json(
      {
        status: 'UNAVAILABLE',
        reason: outcome.reason,
        message: REASON_MESSAGE[outcome.reason],
        retryable: false,
        sources: [],
        trailers: [],
        canPlay: false,
        requestId,
      },
      { status: 400, headers: noStore },
    );
  }

  const request = outcome.request;
  const result = await resolvePlayback(request, origin, requestId);

  const elapsed = Date.now() - started;
  if (result.status === 'PLAYABLE') {
    logPlaybackResolved({
      requestId,
      userId: viewer?.userId,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
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
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
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