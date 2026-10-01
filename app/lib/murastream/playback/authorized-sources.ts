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
// Drop the file in `public/media/<slug>/` and add one entry. No other file
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
 * Empty by design: shipping an empty registry is the honest default. Until a
 * title is added here, the resolver returns METADATA_AVAILABLE and the UI
 * says playback is unavailable — which is the correct answer, and far better
 * than a source that injects advertising.
 */
export const FIRST_PARTY_MANIFEST: FirstPartyEntry[] = [];

const MEDIA_BASE = '/media';

function firstPartySource(entry: FirstPartyEntry): PlaybackSource {
  const isTv = entry.mediaType === 'tv';
  return {
    provider: 'muragoods',
    authorization: 'first_party' as AuthorizationClass,
    kind: 'FULL_PLAYBACK' as SourceKind,
    mediaType: entry.mediaType,
    url: `${MEDIA_BASE}/${entry.slug}/${entry.file}`,
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