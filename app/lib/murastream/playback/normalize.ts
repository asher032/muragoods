// ── Canonical media normalization ──────────────────────────────────────
//
// ONE function decides what kind of thing a request is asking to play. It
// exists because the type used to be decided in three different places — the
// query string, the client state and the detail pages — and each of them
// guessed. Every guess was a way for a TV title to be resolved as a film.
//
// The rules it enforces, each of which was a real defect:
//
//   * `kdrama` must not become "unknown". A K-drama is episodic content in
//     TMDB's own model; it has a season and an episode and is played through
//     the TV resolver like any other series. It is NOT a separate playback
//     system, and it is never routed by genre or origin language.
//   * `series` must not become "movie". Silently defaulting an unrecognised
//     type to `movie` is how a series request ended up in the movie resolver.
//   * An absent or unknown type must produce a NAMED diagnostic, not a
//     best-effort guess. "We could not tell what this was" and "this is a
//     film" are different facts and only one of them is safe to act on.
//
// Genre, country of origin and language are never consulted. They describe a
// title; they do not describe how it is stored or played.

export type CanonicalMediaType = 'movie' | 'tv';

/** Reason codes this module can produce. Both are request-shaped, not source-shaped. */
export type NormalizationFailure = 'INVALID_REQUEST' | 'MEDIA_TYPE_MISMATCH';

/**
 * Alias → canonical type.
 *
 * Split by DESTINATION, not by "looks like a movie". That is the whole point:
 * `kdrama`, `anime` and `drama` are listed under `tv` explicitly so nobody can
 * later "tidy" them into a film bucket because they sound like a film.
 */
const CANONICAL: ReadonlyMap<string, CanonicalMediaType> = new Map([
  // Movies
  ['movie', 'movie'],
  ['movies', 'movie'],
  ['film', 'movie'],
  ['films', 'movie'],
  ['feature', 'movie'],

  // Episodic / series
  ['tv', 'tv'],
  ['tvshow', 'tv'],
  ['tvseries', 'tv'],
  ['series', 'tv'],
  ['show', 'tv'],
  ['shows', 'tv'],
  ['season', 'tv'],
  ['episode', 'tv'],
  ['episodic', 'tv'],

  // K-dramas. Episodic in TMDB, so they use the TV episode resolver. Listed
  // explicitly so the routing is a decision on record, not an accident.
  ['drama', 'tv'],
  ['kdrama', 'tv'],
  ['kdramas', 'tv'],
  ['korean', 'tv'],
  ['koreandrama', 'tv'],

  // Anime. A TV anime is episodic; only an explicitly anime MOVIE is a film.
  ['anime', 'tv'],
  ['anime_series', 'tv'],
  ['animeseries', 'tv'],
  ['anime_tv', 'tv'],
]);

/** Aliases that look generic but carry a specific meaning. */
const FILM_ALIASES = new Set(['anime_movie', 'animemovie', 'animefilm']);

export interface MediaNormalized {
  ok: true;
  mediaType: CanonicalMediaType;
  /** The alias that was supplied, lowercased — kept for the log line. */
  received: string;
}

export interface MediaNotNormalized {
  ok: false;
  reason: NormalizationFailure;
  detail: string;
  received: string;
}

export type MediaNormalization = MediaNormalized | MediaNotNormalized;

/** `"K-Drama"`, `" tv_series "`, `"TV"` all reach the same place. */
function canonicalizeToken(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * The single media-type normalizer. Use this everywhere a type is read from
 * outside the system — query strings, route params, stored user state.
 *
 * Returns a named diagnostic instead of a guess when the type cannot be
 * determined. It never returns `unknown`, never returns `null`, and never
 * falls back to a type.
 */
export function normalizeMediaForPlayback(raw: unknown): MediaNormalization {
  const token = canonicalizeToken(raw);

  if (!token) {
    return {
      ok: false,
      reason: 'INVALID_REQUEST',
      detail: 'mediaType is required and must name a movie or a series',
      received: '',
    };
  }

  // `anime_movie` must be checked before the generic alias map, because
  // `anime` on its own is episodic.
  if (FILM_ALIASES.has(token)) {
    return { ok: true, mediaType: 'movie', received: token };
  }

  const direct = CANONICAL.get(token);
  if (direct) return { ok: true, mediaType: direct, received: token };

  // Compound forms: "k_drama" collapses to "k_drama" above; a few common
  // spaced/hyphenated forms still need their separators removed.
  const compact = token.replace(/_/g, '');
  const viaCompact = CANONICAL.get(compact);
  if (viaCompact) return { ok: true, mediaType: viaCompact, received: token };

  return {
    ok: false,
    reason: 'MEDIA_TYPE_MISMATCH',
    detail: `mediaType "${String(raw)}" is not a recognized movie or series type`,
    received: token,
  };
}

/**
 * Whether this media type is addressed by season/episode.
 *
 * A movie is not — and asking for an episode of a movie is a caller that lost
 * track of what it wanted, which is worth reporting rather than dropping.
 */
export function isEpisodic(mediaType: CanonicalMediaType): boolean {
  return mediaType === 'tv';
}

/**
 * Normalizes a type and validates that its addressing matches.
 *
 * Returns the same discriminated union as `normalizeMediaForPlayback` so a
 * caller cannot accidentally ignore a failure — `ok` must be checked.
 */
export function normalizeWithAddressing(input: {
  mediaType: unknown;
  season: number | null;
  episode: number | null;
}): MediaNormalization {
  const normalized = normalizeMediaForPlayback(input.mediaType);
  // `in` narrowing rather than `!ok`, so this narrows even where
  // strictNullChecks is off (the playback test harness compiles that way).
  if ('reason' in normalized) return normalized;

  const hasSeason = input.season !== null;
  const hasEpisode = input.episode !== null;

  if (!isEpisodic(normalized.mediaType) && (hasSeason || hasEpisode)) {
    return {
      ok: false,
      reason: 'MEDIA_TYPE_MISMATCH',
      detail: `season/episode cannot be supplied for a movie (received season=${input.season}, episode=${input.episode})`,
      received: normalized.received,
    };
  }

  return normalized;
}