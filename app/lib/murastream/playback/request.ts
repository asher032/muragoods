import type { PlaybackReason, ResolveRequest } from './types';
import { normalizeMediaForPlayback, type CanonicalMediaType } from './normalize';

// ── Server-side request validation ──────────────────────────────────────
//
// The resolver's contract is only as strong as what it is handed. This module
// is the gate that decides whether a request is well-formed BEFORE it reaches
// the resolver, and it returns a precise reason instead of coercing.
//
// Coercion is what produced two real defects:
//
//   season=abc   -> Number('abc') is NaN -> JSON.stringify writes null
//                   NaN < 1 is FALSE (every NaN comparison is), so the
//                   resolver's `season < 1` guard did not fire and a
//                   malformed request walked the full resolve path.
//
//   mediaType=x  -> silently became 'movie', so a caller asking for TV could
//                   be handed a movie lookup under a movie identity.
//
// Both now fail loudly with their own reason code, which is what lets the
// admin panel say what is actually wrong instead of guessing.

export interface ValidatedRequest {
  ok: true;
  request: ResolveRequest;
}

export interface InvalidRequest {
  ok: false;
  reason: Extract<
    PlaybackReason,
    'MEDIA_ID_INVALID' | 'MEDIA_TYPE_MISMATCH' | 'INVALID_REQUEST'
  >;
  detail: string;
  /** Echoed so the admin panel can show what was actually attempted. */
  received: { mediaType: string; tmdbId: string; season: string | null; episode: string | null };
}

export type ValidationOutcome = ValidatedRequest | InvalidRequest;

function fail(
  reason: InvalidRequest['reason'],
  detail: string,
  received: InvalidRequest['received'],
): InvalidRequest {
  return { ok: false, reason, detail, received };
}

/**
 * A TMDB id is a positive integer. `603`, `"603"` are valid; `0`, `-5`,
 * `"abc"`, `6.5`, `1e3` and an empty value are not.
 *
 * The integer check matters: TMDB ids are used as cache-key segments, and a
 * fractional or exponential id would produce a key that collides with, or is
 * distinct from, the same logical title reached another way.
 */
function parseTmdbId(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/** Season/episode are positive integers when present. */
function parseEpisodeNumber(raw: string | null): number | null | undefined {
  if (raw === null || raw === '') return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined; // explicit "invalid"
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1 || n > 10000) return undefined;
  return n;
}

/**
 * Validates raw query parameters into a ResolveRequest.
 *
 * Season and episode are only ACCEPTED for tv. Supplying them for a movie is
 * reported as MEDIA_TYPE_MISMATCH rather than quietly dropped, because it
 * almost always means a caller confused a series with a film — which is
 * exactly the ID confusion this is meant to catch.
 */
export function validateResolveParams(params: {
  mediaType: string | null;
  tmdbId: string | null;
  season: string | null;
  episode: string | null;
}): ValidationOutcome {
  const received = {
    mediaType: params.mediaType ?? '',
    tmdbId: params.tmdbId ?? '',
    season: params.season,
    episode: params.episode,
  };

  // ── mediaType: one canonical normalizer, never a guess ───────────────
  // Defaulting an unknown type to 'movie' is how a TV request became a movie
  // lookup. Equally, refusing to understand `kdrama` or `series` is how a
  // K-drama reached a hard error and the UI reported "everything is
  // unavailable". So: aliases are resolved through the ONE normalizer, and an
  // absent or unrecognized type is still a hard, NAMED error.
  const normalized = normalizeMediaForPlayback(params.mediaType);
  // Narrowed with `in` rather than `!normalized.ok`: boolean-literal
  // discrimination depends on strictNullChecks, and this module is also
  // compiled without it by the playback test harness. `in` narrows under
  // both, so the CI harness cannot drift from the app build.
  if ('reason' in normalized) {
    return fail(normalized.reason, normalized.detail, received);
  }
  const mediaType: CanonicalMediaType = normalized.mediaType;

  // ── tmdbId ────────────────────────────────────────────────────────────
  const tmdbId = parseTmdbId(params.tmdbId);
  if (tmdbId === null) {
    return fail(
      'MEDIA_ID_INVALID',
      `tmdbId must be a positive integer, received ${JSON.stringify(params.tmdbId ?? '')}`,
      received,
    );
  }

  // ── season / episode ──────────────────────────────────────────────────
  const rawSeason = params.season;
  const rawEpisode = params.episode;

  if (mediaType === 'movie') {
    // A movie with an episode number is a caller that lost track of what it
    // was asking for. Refuse rather than drop it.
    if (rawSeason !== null && rawSeason !== '') {
      return fail('MEDIA_TYPE_MISMATCH', 'season is not valid for a movie', received);
    }
    if (rawEpisode !== null && rawEpisode !== '') {
      return fail('MEDIA_TYPE_MISMATCH', 'episode is not valid for a movie', received);
    }
    return { ok: true, request: { mediaType: 'movie', tmdbId } };
  }

  const season = parseEpisodeNumber(rawSeason);
  if (season === undefined) {
    return fail(
      'INVALID_REQUEST',
      `season must be a positive integer, received ${JSON.stringify(rawSeason)}`,
      received,
    );
  }
  const episode = parseEpisodeNumber(rawEpisode);
  if (episode === undefined) {
    return fail(
      'INVALID_REQUEST',
      `episode must be a positive integer, received ${JSON.stringify(rawEpisode)}`,
      received,
    );
  }

  // Season 0 is TMDB's specials bucket. It is a real season, so it is
  // allowed — but it is resolved through the same exact-match path as any
  // other season, never silently remapped to season 1.
  return {
    ok: true,
    request: { mediaType: 'tv', tmdbId, season: season ?? 0, episode: episode ?? 1 },
  };
}

/**
 * Guards the resolver's own entry point.
 *
 * The resolver is exported and used by the admin panel and the health
 * endpoint too, so it validates internally rather than trusting every caller
 * to have gone through `validateResolveParams` first.
 */
export function isPlausibleRequest(req: ResolveRequest): boolean {
  if (req.mediaType !== 'movie' && req.mediaType !== 'tv') return false;
  if (!Number.isSafeInteger(req.tmdbId) || req.tmdbId <= 0) return false;
  if (req.mediaType === 'movie') {
    // Season/episode must be absent for a movie, or the request is confused.
    return (req.season === null || req.season === undefined)
      && (req.episode === null || req.episode === undefined);
  }
  for (const n of [req.season, req.episode]) {
    if (n === null || n === undefined) continue;
    if (!Number.isSafeInteger(n) || n < 0 || n > 10000) return false;
  }
  // An episode number with no season is meaningless.
  if ((req.episode ?? 0) > 0 && (req.season === null || req.season === undefined)) return false;
  return true;
}