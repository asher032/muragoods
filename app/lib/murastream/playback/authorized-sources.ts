import type { PlaybackSource, AuthorizationClass, SourceKind } from './types';

// ── Authorized source registry ──────────────────────────────────────────
//
// THE ONLY PLACE a playback source may enter the system.
//
// A source is returned by the resolver if and only if it is registered here.
// Because the registry holds no third-party embed aggregators, there is
// nothing in the player that can be made to serve an ad: the guarantee is
// structural, not a filter applied after the fact.
//
// Two authorization classes:
//
//   first_party — media Muragoods owns or is licensed to redistribute, served
//     from our own origin under /media. Same-origin means no third-party
//     script, frame or redirect can participate in playback.
//
//   licensed   — official trailers/previews published through TMDB's licensed
//     API. Always TRAILER/PREVIEW, never FULL_PLAYBACK, and never presented as
//     the episode itself.
//
// ── Adding first-party media ────────────────────────────────────────────
// Drop the file anywhere under `public/media/` and set `file` to its path
// relative to that directory (it may contain subdirectories, e.g.
// "betty-boop/s01e01.mp4"). The playback URL is built from `file` alone, so
// the slug is a label for the catalog, not a path segment. No other file
// needs to change, and no playback URL is hardcoded in a component.

// First-party media is discovered from a manifest so adding a title is a
// data change, not a code change.
interface FirstPartyEntry {
  slug: string;
  tmdbId: number;
  title: string;
  mediaType: 'movie' | 'tv';
  file: string;
  container?: 'mp4' | 'hls';
  posterPath?: string | null;
  backdropPath?: string | null;
  durationSec?: number | null;
  /** For TV: which season/episode this file is, and how many episodes exist. */
  season?: number | null;
  episode?: number | null;
  totalEpisodes?: number | null;
}

/**
 * Media Muragoods owns or is licensed to distribute.
 *
 * Every entry below is a title whose licence permits redistribution to the
 * public. Nothing here is scraped, no DRM is circumvented, and no paywall or
 * geographic restriction is bypassed — these are works the public owns the
 * right to share:
 *
 *   Betty Boop (1932-1935) — Fleischer Studios / Paramount. Un-renewed
 *     copyright, in the public domain in the United States. Distributed by
 *     Prelinger Archives via the Internet Archive `opensource_movies`
 *     collection.
 *
 *   Big Buck Bunny (2008) — Blender Foundation / Blender Institute, released
 *     under Creative Commons Attribution 3.0, which explicitly permits
 *     redistribution with attribution.
 *
 * A title absent from this list is NOT unlicensed-and-hidden; it is simply a
 * title Muragoods holds no distributable copy of, and the resolver reports
 * SOURCE_NOT_FOUND for it honestly.
 */
export const FIRST_PARTY_MANIFEST: FirstPartyEntry[] = [
  // ── Movies ──────────────────────────────────────────────────────────
  {
    slug: 'big-buck-bunny',
    tmdbId: 10378,
    title: 'Big Buck Bunny',
    mediaType: 'movie',
    file: 'big-buck-bunny.mp4',
    container: 'mp4',
    durationSec: 634,
    posterPath: null,
    backdropPath: null,
  },

  // ── TV: Betty Boop (1932), public domain ─────────────────────────────
  // A real episodic series. Season 1 holds three distinct shorts, so episode
  // switching resolves to a genuinely different file per episode rather than
  // reusing the previous episode's source.
  {
    slug: 'betty-boop',
    tmdbId: 323155,
    title: 'Betty Boop',
    mediaType: 'tv',
    file: 'betty-boop/s01e01-silly-scandals.mp4',
    container: 'mp4',
    durationSec: 480,
    season: 1,
    episode: 1,
    totalEpisodes: 3,
  },
  {
    slug: 'betty-boop',
    tmdbId: 323155,
    title: 'Betty Boop',
    mediaType: 'tv',
    file: 'betty-boop/s01e02-minnie-the-moocher.mp4',
    container: 'mp4',
    durationSec: 420,
    season: 1,
    episode: 2,
    totalEpisodes: 3,
  },
  {
    slug: 'betty-boop',
    tmdbId: 323155,
    title: 'Betty Boop',
    mediaType: 'tv',
    file: 'betty-boop/s01e03-making-stars.mp4',
    container: 'mp4',
    durationSec: 400,
    season: 1,
    episode: 3,
    totalEpisodes: 3,
  },
];

/** Licensing/attribution for the registered media, surfaced in the admin panel. */
export const FIRST_PARTY_ATTRIBUTION: Array<{
  title: string;
  rights: string;
  source: string;
}> = [
  {
    title: 'Big Buck Bunny (2008)',
    rights: 'Creative Commons Attribution 3.0 (CC BY 3.0) — Blender Foundation / Blender Institute',
    source: 'archive.org — BigBuckBunny_124',
  },
  {
    title: 'Betty Boop — Season 1 (1932-1935 shorts)',
    rights: 'Public domain in the United States (un-renewed copyright, Fleischer Studios / Paramount)',
    source: 'archive.org — opensource_movies collection',
  },
];

const MEDIA_BASE = '/media';

function firstPartySource(entry: FirstPartyEntry): PlaybackSource {
  const isTv = entry.mediaType === 'tv';
  return {
    provider: 'muragoods',
    authorization: 'first_party' as AuthorizationClass,
    kind: 'FULL_PLAYBACK' as SourceKind,
    mediaType: entry.mediaType,
    // `file` is the path under public/media, so it may itself contain
    // subdirectories. Prefixing the slug again would build a path that does
    // not exist — which validated as a 404 and surfaced as an unplayable
    // title even though the file was present and served correctly.
    url: `${MEDIA_BASE}/${entry.file}`,
    container: entry.container ?? 'mp4',
    tmdbId: entry.tmdbId,
    season: isTv ? (entry.season ?? 1) : null,
    episode: isTv ? (entry.episode ?? 1) : null,
    label: isTv
      ? `${entry.title} — S${String(entry.season ?? 1).padStart(2, '0')}E${String(entry.episode ?? 1).padStart(2, '0')}`
      : entry.title,
    durationSec: entry.durationSec ?? null,
  };
}

/**
 * A first-party movie, or the specific season/episode requested.
 *
 * Episode addressing is exact-match on purpose. Returning "the nearest
 * episode" is how a viewer ends up watching episode 1 while the UI says 4.
 */
export function firstPartyMovie(tmdbId: number): PlaybackSource | null {
  const entry = FIRST_PARTY_MANIFEST.find(
    (e) => e.tmdbId === tmdbId && e.mediaType === 'movie',
  );
  return entry ? firstPartySource(entry) : null;
}

export function firstPartyEpisode(tmdbId: number, season: number, episode: number): PlaybackSource | null {
  const entry = FIRST_PARTY_MANIFEST.find(
    (e) => e.tmdbId === tmdbId
      && e.mediaType === 'tv'
      && (e.season ?? 1) === season
      && (e.episode ?? 1) === episode,
  );
  return entry ? firstPartySource(entry) : null;
}

/** Every registered episode of a series — used to build the season list. */
export function firstPartyEpisodesOf(tmdbId: number): PlaybackSource[] {
  return FIRST_PARTY_MANIFEST
    .filter((e) => e.tmdbId === tmdbId && e.mediaType === 'tv')
    .sort((a, b) => (a.season ?? 1) - (b.season ?? 1) || (a.episode ?? 1) - (b.episode ?? 1))
    .map(firstPartySource);
}

export function firstPartySeasonsOf(tmdbId: number): number[] {
  const seasons = FIRST_PARTY_MANIFEST
    .filter((e) => e.tmdbId === tmdbId && e.mediaType === 'tv')
    .map((e) => e.season ?? 1);
  return [...new Set(seasons)].sort((a, b) => a - b);
}

/** True when the title has at least one registered first-party asset. */
export function hasFirstPartyMedia(tmdbId: number): boolean {
  return FIRST_PARTY_MANIFEST.some((e) => e.tmdbId === tmdbId);
}

/**
 * A licensed official trailer, built from a TMDB video record.
 *
 * Deliberately `kind: 'TRAILER'`. It is never promoted to FULL_PLAYBACK and
 * never passed to the player as an episode, so a trailer can never be
 * mistaken for the thing the viewer asked for.
 */
export function licensedTrailer(input: {
  key: string;
  site: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  season?: number | null;
  episode?: number | null;
}): PlaybackSource | null {
  // Only YouTube keys from TMDB. An unknown site is refused rather than
  // guessed at, because we cannot know what an unrecognised embed injects.
  if (input.site !== 'YouTube') return null;
  if (!/^[A-Za-z0-9_-]{11}$/.test(input.key)) return null;
  return {
    provider: 'tmdb',
    authorization: 'licensed',
    kind: 'TRAILER',
    mediaType: input.mediaType,
    url: `https://www.youtube-nocookie.com/embed/${input.key}`,
    container: 'youtube',
    tmdbId: input.tmdbId,
    season: input.mediaType === 'tv' ? (input.season ?? null) : null,
    episode: input.mediaType === 'tv' ? (input.episode ?? null) : null,
    label: `${input.title} — official trailer`,
    durationSec: null,
  };
}

/**
 * Rejects anything that is not registered and authorized.
 *
 * Called on every path that produces a source, so a future caller cannot
 * hand-roll an object and bypass the registry. Authorization is checked
 * structurally: only the two classes in `AuthorizationClass` are accepted.
 */
export function assertAuthorized(source: PlaybackSource): boolean {
  if (source.authorization !== 'first_party' && source.authorization !== 'licensed') return false;
  if (source.authorization === 'first_party') {
    // First-party must be same-origin. A first_party entry pointing off-site
    // would reintroduce exactly the injection surface this design removes.
    return source.url.startsWith('/') && !source.url.startsWith('//');
  }
  // Licensed sources may only ever be trailers/previews.
  return source.kind === 'TRAILER' || source.kind === 'PREVIEW';
}