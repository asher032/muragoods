import {
  firstPartyMovie,
  firstPartyEpisode,
  licensedTrailer,
  hasFirstPartyMedia,
  FIRST_PARTY_MANIFEST,
} from './authorized-sources';
import {
  playbackCacheKey,
  readUsableCache,
  writeCache,
} from './validate';
import { validateSource } from './validate';
import { isPlausibleRequest } from './request';
import type {
  PlaybackSource,
  PlaybackStatus,
  PlaybackReason,
  PlaybackDiagnostic,
  ResolveRequest,
  ResolveResult,
} from './types';

// ── The one playback resolver ───────────────────────────────────────────
//
//   resolvePlayback({ mediaType, tmdbId, season, episode })
//
// Movie and TV are separate internal paths on purpose. A movie request never
// receives season/episode, and an episode request can never fall back to a
// movie source — the two paths do not share a code path that would let one
// stand in for the other.
//
// TMDB supplies metadata only. Having a catalog entry is NOT evidence of
// playback rights, so TMDB never contributes a FULL_PLAYBACK source; its
// only contribution is an optional, clearly-labelled trailer.

const TMDB_BASE = 'https://api.themoviedb.org/3';

function emptyResult(
  status: PlaybackStatus,
  reason: PlaybackReason | null,
  mediaType: 'movie' | 'tv',
  tmdbId: number,
  season: number | null = null,
  episode: number | null = null,
): ResolveResult {
  return { status, reason, mediaType, tmdbId, season, episode, sources: [], trailers: [] };
}

/**
 * TMDB's official trailers, offered as an extra when playback is blocked.
 *
 * The API key is read from the environment and used ONLY in this
 * server-side request header. The raw TMDB body is reduced to trailer
 * metadata before it leaves this function, and the key never appears in a
 * response, a log line or the browser.
 */
async function licensedTrailers(
  mediaType: 'movie' | 'tv',
  tmdbId: number,
  title: string,
  season?: number | null,
  episode?: number | null,
): Promise<{ trailers: PlaybackSource[]; diagnostic: PlaybackDiagnostic }> {
  const started = Date.now();
  const apiKey = process.env.TMDB_API_KEY || '';
  if (!apiKey) {
    return {
      trailers: [],
      diagnostic: { provider: 'tmdb', kind: 'TRAILER', outcome: 'skipped', detail: 'no TMDB key configured', durationMs: 0 },
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${TMDB_BASE}/${mediaType}/${tmdbId}/videos`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    const durationMs = Date.now() - started;
    if (!res.ok) {
      return {
        trailers: [],
        diagnostic: { provider: 'tmdb', kind: 'TRAILER', outcome: 'failed', detail: `metadata ${res.status}`, httpStatus: res.status, durationMs },
      };
    }
    const body = (await res.json()) as {
      results?: Array<{ key?: string; site?: string; type?: string; official?: boolean }>;
    };
    const trailers: PlaybackSource[] = [];
    for (const v of body.results || []) {
      if (v.type !== 'Trailer' && v.type !== 'Teaser') continue;
      const source = licensedTrailer({
        key: String(v.key || ''),
        site: String(v.site || ''),
        tmdbId,
        mediaType,
        title,
        season,
        episode,
      });
      if (source) trailers.push(source);
      if (trailers.length >= 3) break;
    }
    return {
      trailers,
      diagnostic: { provider: 'tmdb', kind: 'TRAILER', outcome: 'ok', detail: `${trailers.length} trailer(s)`, httpStatus: 200, durationMs },
    };
  } catch (err) {
    return {
      trailers: [],
      diagnostic: {
        provider: 'tmdb',
        kind: 'TRAILER',
        outcome: 'failed',
        detail: err instanceof DOMException && err.name === 'AbortError' ? 'timeout' : 'network error',
        durationMs: Date.now() - started,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * MOVIE path. No season/episode is consulted, and none can be: the parameter
 * object for a movie is built without them and the lookup is exact by
 * tmdbId alone.
 */
async function resolveMovie(req: ResolveRequest): Promise<ResolveResult> {
  const candidate = firstPartyMovie(req.tmdbId);
  if (!candidate) {
    const { trailers, diagnostic } = await licensedTrailers('movie', req.tmdbId, '');
    return {
      ...emptyResult('METADATA_AVAILABLE', 'SOURCE_NOT_FOUND', 'movie', req.tmdbId),
      // TMDB has the title; Muragoods has no authorized source for it.
      trailers,
      diagnostics: [diagnostic],
    };
  }

  const check = await validateSource(candidate);
  if (!check.ok) {
    return {
      ...emptyResult('TEMPORARILY_FAILED', check.reason, 'movie', req.tmdbId),
      // A failure on our OWN asset is not transient in the provider sense, but
      // it is not a licence decision either — so it is reported honestly and
      // cached as temporary so a redeploy can heal it.
      diagnostics: [{
        provider: candidate.provider,
        kind: candidate.kind,
        outcome: 'failed',
        detail: check.contentType || 'validation failed',
        httpStatus: check.httpStatus,
        durationMs: check.durationMs,
      }],
    };
  }

  return {
    ...emptyResult('PLAYABLE', null, 'movie', req.tmdbId),
    sources: [candidate],
    diagnostics: [{
      provider: candidate.provider,
      kind: candidate.kind,
      outcome: 'ok',
      detail: 'validated',
      httpStatus: check.httpStatus,
      durationMs: check.durationMs,
    }],
  };
}

/**
 * TV path. Series → season → episode, each resolved as its own step so the
 * failure reason names the step that actually failed instead of collapsing
 * to a generic "unavailable".
 */
async function resolveEpisode(req: ResolveRequest): Promise<ResolveResult> {
  // Season 0 is TMDB's specials bucket and is a real season. It is addressed
  // exactly like any other season — never remapped to season 1.
  const season = req.season ?? 0;
  const episode = req.episode ?? 1;

  if (season < 0 || episode < 1) {
    return emptyResult('UNAVAILABLE', 'INVALID_REQUEST', 'tv', req.tmdbId, season, episode);
  }

  // Exact episode match. There is no nearest-episode fallback, because
  // serving S01E01's source while the UI says S01E04 is worse than an honest
  // unavailable.
  const candidate = firstPartyEpisode(req.tmdbId, season, episode);
  if (!candidate) {
    const { trailers, diagnostic } = await licensedTrailers('tv', req.tmdbId, '', season, episode);
    // Distinguish "the series is unknown here" from "that episode is missing".
    const known = hasFirstPartyMedia(req.tmdbId);
    return {
      ...emptyResult(
        'METADATA_AVAILABLE',
        known ? 'EPISODE_NOT_FOUND' : 'SOURCE_NOT_FOUND',
        'tv',
        req.tmdbId,
        season,
        episode,
      ),
      trailers,
      diagnostics: [diagnostic],
    };
  }

  const check = await validateSource(candidate);
  if (!check.ok) {
    return {
      ...emptyResult('TEMPORARILY_FAILED', check.reason, 'tv', req.tmdbId, season, episode),
      diagnostics: [{
        provider: candidate.provider,
        kind: candidate.kind,
        outcome: 'failed',
        detail: check.contentType || 'validation failed',
        httpStatus: check.httpStatus,
        durationMs: check.durationMs,
      }],
    };
  }

  return {
    ...emptyResult('PLAYABLE', null, 'tv', req.tmdbId, season, episode),
    sources: [candidate],
    diagnostics: [{
      provider: candidate.provider,
      kind: candidate.kind,
      outcome: 'ok',
      detail: 'validated',
      httpStatus: check.httpStatus,
      durationMs: check.durationMs,
    }],
  };
}

export async function resolvePlayback(req: ResolveRequest): Promise<ResolveResult> {
  // Validate internally rather than trusting every caller. The API route
  // already validates, but the admin probe and health endpoint call this
  // directly, and a malformed request used to reach the full resolve path.
  if (!isPlausibleRequest(req)) {
    const tmdbId = Number(req?.tmdbId);
    return emptyResult(
      'UNAVAILABLE',
      Number.isSafeInteger(tmdbId) && tmdbId > 0 ? 'INVALID_REQUEST' : 'MEDIA_ID_INVALID',
      req?.mediaType === 'tv' ? 'tv' : 'movie',
      Number.isSafeInteger(tmdbId) && tmdbId > 0 ? tmdbId : 0,
      typeof req?.season === 'number' ? req.season : null,
      typeof req?.episode === 'number' ? req.episode : null,
    );
  }

  const key = playbackCacheKey(req.mediaType, req.tmdbId, req.season, req.episode);
  const cached = readUsableCache(key);
  if (cached && cached.state === 'AVAILABLE') {
    return {
      status: 'PLAYABLE',
      reason: null,
      mediaType: req.mediaType,
      tmdbId: req.tmdbId,
      season: req.mediaType === 'tv' ? (req.season ?? 0) : null,
      episode: req.mediaType === 'tv' ? (req.episode ?? 1) : null,
      sources: cached.sources,
      trailers: [],
    };
  }

  const result = req.mediaType === 'tv'
    ? await resolveEpisode(req)
    : await resolveMovie(req);

  // Cache by real state. PLAYABLE and the honest "no source" answers are
  // remembered; a temporary failure is written as temporary so the next
  // request retries instead of inheriting the fault.
  if (result.status === 'PLAYABLE') writeCache(key, 'AVAILABLE', null, result.sources);
  else if (result.status === 'TEMPORARILY_FAILED') writeCache(key, 'TEMPORARILY_FAILED', result.reason);
  else writeCache(key, 'UNAVAILABLE', result.reason);

  return result;
}

/** Status shown to the user, derived from the real outcome. */
export function statusForDisplay(result: ResolveResult): { headline: string; canPlay: boolean } {
  if (result.status === 'PLAYABLE') return { headline: '', canPlay: true };
  if (result.status === 'TEMPORARILY_FAILED') return { headline: 'Playback service is temporarily unavailable.', canPlay: false };
  return { headline: "This title isn't available for playback right now.", canPlay: false };
}

/** Registered first-party inventory, for the health endpoint. */
export function firstPartyInventory(): { titles: number; episodes: number } {
  const titles = new Set(FIRST_PARTY_MANIFEST.map((e) => e.tmdbId)).size;
  const episodes = FIRST_PARTY_MANIFEST.filter((e) => e.mediaType === 'tv').length;
  return { titles, episodes };
}

export type { PlaybackSource, PlaybackStatus, PlaybackReason, ResolveRequest, ResolveResult };