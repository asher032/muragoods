import {
  licensedTrailer,
  FIRST_PARTY_MANIFEST,
} from './authorized-sources';
import {
  findInRecords,
  usableSourceStatus,
  type AuthorizedSourceRecord,
  type RegistryLookup,
  type SourceAddress,
} from './registry';
import { allSources } from './store';
import { adapterFor } from './providers';
import {
  playbackCacheKey,
  readUsableCache,
  writeCache,
} from './validate';
import { validateSource } from './validate';
import { isPlausibleRequest } from './request';
import { logPlaybackStage } from './log';
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
// ── What changed and why ───────────────────────────────────────────────
//
// The lookup used to be `firstPartyMovie(tmdbId)` / `firstPartyEpisode(...)`
// against a hardcoded array in the resolver's own module. Adding a title
// therefore meant editing this file and redeploying, which is why the catalog
// could never grow past four entries and every other title collapsed to one
// indistinguishable "unavailable".
//
// It now asks the canonical REGISTRY, addressed by stable IDs, and hands the
// matched record to the PROVIDER ADAPTER that can actually serve it:
//
//   address → registry lookup → adapter.getSource() → validateSource() → PLAYABLE
//
// TMDB supplies metadata only. Having a catalog entry is NOT evidence of
// playback rights, so TMDB never contributes a FULL_PLAYBACK source; its only
// contribution is an optional, clearly-labelled trailer.

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
 * Turn a registry hit into a validated PLAYABLE source, or a classified
 * refusal. Shared by the movie and episode paths — the ADDRESS is what
 * differs, not the mechanics, so there is one implementation of "can this
 * registered source actually be played".
 */
async function materialize(
  lookup: RegistryLookup,
  address: SourceAddress,
  mediaType: 'movie' | 'tv',
  tmdbId: number,
  season: number | null,
  episode: number | null,
  origin: string | null | undefined,
  traceId: string,
): Promise<ResolveResult> {
  if ('considered' in lookup) {
    // The address resolved but nothing usable is registered there. This is a
    // specific, actionable state — NOT a resolver fault, and deliberately not
    // retryable.
    logPlaybackStage({
      requestId: traceId, event: 'SOURCE_LOOKUP_FAILED',
      mediaType, tmdbId, season, episode, detail: lookup.status,
    });
    return emptyResult('UNAVAILABLE', lookup.status, mediaType, tmdbId, season, episode);
  }

  const record: AuthorizedSourceRecord = lookup.record;
  const adapter = adapterFor(record.sourceType);

  const resolved = await adapter.getSource(record);
  if (!resolved) {
    // The source IS registered but this provider cannot serve it — usually
    // because the provider is not configured in this deployment. That is a
    // provider answer and must not read as "no source exists".
    logPlaybackStage({
      requestId: traceId, event: 'PROVIDER_CANNOT_SERVE',
      mediaType, tmdbId, season, episode, provider: record.provider, detail: record.sourceType,
    });
    return emptyResult('METADATA_AVAILABLE', 'PROVIDER_NOT_CONFIGURED', mediaType, tmdbId, season, episode);
  }

  const candidate: PlaybackSource = {
    provider: record.provider,
    authorization: resolved.authorization,
    kind: resolved.kind,
    mediaType: record.mediaType,
    url: resolved.url,
    container: resolved.container,
    tmdbId: record.tmdbId,
    season: record.mediaType === 'tv' ? (record.season ?? 1) : null,
    episode: record.mediaType === 'tv' ? (record.episode ?? 1) : null,
    label: resolved.label,
    durationSec: null,
  };

  const eventPrefix = mediaType === 'tv' ? 'TV' : 'MOVIE';
  logPlaybackStage({
    requestId: traceId, event: `${eventPrefix}_SOURCE_RESOLVED`,
    mediaType, tmdbId, season, episode,
    provider: candidate.provider, detail: `${record.sourceType}:${candidate.url}`,
  });

  // Every registered source is still proven before it can be called playable.
  // Registering a source is an authorization claim, not proof.
  const check = await validateSource(candidate, origin);
  logPlaybackStage({
    requestId: traceId,
    event: check.ok ? `${eventPrefix}_SOURCE_VALIDATED` : `${eventPrefix}_SOURCE_REJECTED`,
    mediaType, tmdbId, season, episode,
    provider: candidate.provider, httpStatus: check.httpStatus, detail: check.contentType,
  });

  if (!check.ok) {
    return {
      ...emptyResult('TEMPORARILY_FAILED', check.reason, mediaType, tmdbId, season, episode),
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

  logPlaybackStage({
    requestId: traceId, event: `${eventPrefix}_PLAYBACK_READY`,
    mediaType, tmdbId, season, episode, provider: candidate.provider,
  });

  return {
    ...emptyResult('PLAYABLE', null, mediaType, tmdbId, season, episode),
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
 * TMDB's official trailers, offered as an extra when playback is blocked.
 *
 * The API key is read from the environment and used ONLY in this server-side
 * request header. The raw TMDB body is reduced to trailer metadata before it
 * leaves this function, and the key never appears in a response, a log line or
 * the browser.
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

/** MOVIE path. No season/episode is consulted, and none can be. */
async function resolveMovie(
  req: ResolveRequest,
  origin?: string | null,
  traceId = '-',
): Promise<ResolveResult> {
  logPlaybackStage({
    requestId: traceId, event: 'MOVIE_RESOLVER_SELECTED',
    mediaType: 'movie', tmdbId: req.tmdbId,
    detail: 'movie resolver entered (no season/episode consulted)',
  });

  const { records } = await allSources();
  const lookup = findInRecords(records, { mediaType: 'movie', tmdbId: req.tmdbId });

  if ('considered' in lookup) {
    const { trailers, diagnostic } = await licensedTrailers('movie', req.tmdbId, '');
    logPlaybackStage({
      requestId: traceId, event: 'MOVIE_PLAYBACK_FAILED',
      mediaType: 'movie', tmdbId: req.tmdbId, detail: lookup.status,
    });
    return {
      // Spec: an address with no registered source is UNAVAILABLE with an
      // exact reason. It is never reported as a resolver fault, and never as
      // a generic "unavailable" that hides which step failed.
      ...emptyResult('UNAVAILABLE', lookup.status, 'movie', req.tmdbId),
      // TMDB has the title; no authorized source is registered for it.
      trailers,
      diagnostics: [diagnostic],
    };
  }

  return materialize(lookup, { mediaType: 'movie', tmdbId: req.tmdbId }, 'movie', req.tmdbId, null, null, origin, traceId);
}

/**
 * TV path. Series → season → episode, each resolved as its own step so the
 * failure reason names the step that actually failed instead of collapsing
 * to a generic "unavailable".
 */
async function resolveEpisode(
  req: ResolveRequest,
  origin?: string | null,
  traceId = '-',
): Promise<ResolveResult> {
  // Season 0 is TMDB's specials bucket and is a real season. It is addressed
  // exactly like any other season — never remapped to season 1.
  const season = req.season ?? 0;
  const episode = req.episode ?? 1;

  if (season < 0 || episode < 1) {
    return emptyResult('UNAVAILABLE', 'INVALID_REQUEST', 'tv', req.tmdbId, season, episode);
  }

  logPlaybackStage({
    requestId: traceId, event: 'TV_RESOLVER_SELECTED',
    mediaType: 'tv', tmdbId: req.tmdbId, season, episode,
    detail: 'episode resolver entered with exact season/episode match',
  });

  const { records } = await allSources();
  const lookup = findInRecords(records, { mediaType: 'tv', tmdbId: req.tmdbId, season, episode });

  if ('considered' in lookup) {
    // Distinguish "we hold no episodes for this series at all" from "we hold
    // some, just not this one". They need different operator action — add
    // the series, versus add that episode — so they must not collapse into
    // one another.
    const seriesKnown = records.some(
      (r) => r.mediaType === 'tv' && r.tmdbId === req.tmdbId && usableSourceStatus(r) === 'REGISTERED',
    );
    // "we hold no episodes for this series" and "we hold some, just not this
    // one" need different operator action — add the series, versus add that
    // episode — so they must not collapse into one another.
    const reason: PlaybackReason =
      lookup.status === 'SOURCE_NOT_REGISTERED' && seriesKnown ? 'EPISODE_NOT_FOUND' : lookup.status;
    const { trailers, diagnostic } = await licensedTrailers('tv', req.tmdbId, '', season, episode);
    logPlaybackStage({
      requestId: traceId, event: 'TV_PLAYBACK_FAILED',
      mediaType: 'tv', tmdbId: req.tmdbId, season, episode, detail: reason,
    });
    return {
      ...emptyResult('UNAVAILABLE', reason, 'tv', req.tmdbId, season, episode),
      trailers,
      diagnostics: [diagnostic],
    };
  }

  return materialize(lookup, { mediaType: 'tv', tmdbId: req.tmdbId, season, episode }, 'tv', req.tmdbId, season, episode, origin, traceId);
}

export async function resolvePlayback(
  req: ResolveRequest,
  origin?: string | null,
  traceId = '-',
): Promise<ResolveResult> {
  logPlaybackStage({
    requestId: traceId,
    event: req.mediaType === 'tv' ? 'TV_PLAYBACK_START' : 'MOVIE_PLAYBACK_START',
    mediaType: req.mediaType,
    tmdbId: req?.tmdbId ?? null,
    season: req.mediaType === 'tv' ? (req.season ?? 0) : null,
    episode: req.mediaType === 'tv' ? (req.episode ?? 1) : null,
  });

  // Validate internally rather than trusting every caller.
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
  logPlaybackStage({
    requestId: traceId, event: 'PLAYBACK_CACHE_LOOKUP',
    mediaType: req.mediaType, tmdbId: req.tmdbId,
    cacheState: cached ? cached.state : 'MISS', detail: key,
  });
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
    ? await resolveEpisode(req, origin, traceId)
    : await resolveMovie(req, origin, traceId);

  // Cache by real state. A REGISTERED-but-unplayable answer is cached long
  // enough to be cheap, a temporary failure briefly, and never a transient
  // fault as a permanent absence.
  if (result.status === 'PLAYABLE') writeCache(key, 'AVAILABLE', null, result.sources);
  else if (result.status === 'TEMPORARILY_FAILED') writeCache(key, 'TEMPORARILY_FAILED', result.reason);
  else writeCache(key, 'UNAVAILABLE', result.reason);

  logPlaybackStage({
    requestId: traceId, event: 'PLAYBACK_CACHE_WRITE',
    mediaType: req.mediaType, tmdbId: req.tmdbId, cacheState: result.status, detail: key,
  });

  return result;
}

/** Status shown to the user, derived from the real outcome. */
export function statusForDisplay(result: ResolveResult): { headline: string; canPlay: boolean } {
  if (result.status === 'PLAYABLE') return { headline: '', canPlay: true };
  if (result.status === 'TEMPORARILY_FAILED') return { headline: 'Playback service is temporarily unavailable.', canPlay: false };
  return { headline: "Playback for this title hasn't been added to the library yet.", canPlay: false };
}

/** Registered inventory, for the health endpoint and admin diagnostics. */
export function firstPartyInventory(): { titles: number; episodes: number } {
  const titles = new Set(FIRST_PARTY_MANIFEST.map((e) => e.tmdbId)).size;
  const episodes = FIRST_PARTY_MANIFEST.filter((e) => e.mediaType === 'tv').length;
  return { titles, episodes };
}

/** Re-exported so the admin panel and diagnostics share one definition. */
export { usableSourceStatus };

export type { PlaybackSource, PlaybackStatus, PlaybackReason, ResolveRequest, ResolveResult };