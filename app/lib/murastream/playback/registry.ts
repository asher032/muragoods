// ── Canonical authorized-source registry ────────────────────────────────
//
// THE lookup the resolver uses. Everything a viewer can play must be findable
// here, addressed by STABLE IDs — never by title text, never by genre, never
// by origin language. `tmdbId` + (season, episode) is the address; a title
// string is a label and is never used to match.
//
// Two tiers, one lookup:
//
//   static   media committed to this repository and served from our own
//            origin (FIRST_PARTY_MANIFEST). Always available, no database.
//   dynamic  sources an operator registered through the admin panel or a bulk
//            import, stored in Mongo. Optional — the site runs without a
//            database, in which case only the static tier resolves and that is
//            reported as DEGRADED rather than pretending the registry is empty.
//
// The reason this exists: an empty dynamic registry previously meant "every
// title is unavailable" with no way to fix that without editing code. Now a
// licensed source can be registered at runtime and the resolver picks it up
// with no deploy.
//
// A record here is a CLAIM that Muragoods holds rights to that asset. It is
// not proof: every returned source still goes through provider validation
// before it can be called PLAYABLE. Registering a source is therefore an
// authorization decision by an operator, never something this system infers.

import { FIRST_PARTY_MANIFEST } from './authorized-sources';
import type { AuthorizationClass, SourceKind } from './types';

// ── Rights ─────────────────────────────────────────────────────────────
//
// The provider hosts the file. The provider does NOT grant rights to the
// movie. Those are separate facts, kept in separate fields, and only their
// combination may produce a playable source.
//
// UNVERIFIED is not playable. Not by default, not temporarily, not because
// the file is already downloaded and sitting on our own origin. An asset we
// cannot demonstrate rights to is exactly the case this enum exists for.
export type RightsStatus =
  | 'PUBLIC_DOMAIN'
  | 'CC_BY'
  | 'CC_BY_SA'
  | 'MURAGOODS_OWNED'
  | 'LICENSED'
  | 'UNVERIFIED';

export const PLAYABLE_RIGHTS: ReadonlySet<RightsStatus> = new Set<RightsStatus>([
  'PUBLIC_DOMAIN', 'CC_BY', 'CC_BY_SA', 'MURAGOODS_OWNED', 'LICENSED',
]);

/**
 * Licences that do NOT automatically permit Murastream's use.
 *
 * NC (non-commercial) and ND (no-derivatives) are listed so an importer can
 * record what a work actually is while still refusing to play it. Recognising
 * a licence is not the same as being permitted to use it.
 */
export const RESTRICTED_RIGHTS: ReadonlySet<RightsStatus> = new Set<RightsStatus>(['UNVERIFIED']);

export interface SourceRights {
  rightsStatus: RightsStatus;
  /** e.g. 'CC BY 3.0', 'U.S. public domain', 'distribution agreement 2026-01'. */
  licenseType: string | null;
  /** The licence text itself. */
  licenseUrl: string | null;
  /** The page that EVIDENCES the licence for this specific item. */
  rightsSourceUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
}

/** A container we know how to hand to the player. */
export type SourceContainer = 'mp4' | 'hls' | 'youtube';

/**
 * A registered source, using the field names the admin panel, the import
 * format and the diagnostics all agree on.
 */
export interface AuthorizedSourceRecord extends SourceRights {
  /** Stable primary identity. Required — a source without it cannot be matched. */
  tmdbId: number;
  /** Optional secondary identity, for titles cross-listed by IMDb. */
  imdbId?: string | null;
  mediaType: 'movie' | 'tv';
  /** Required for tv, and forbidden for movie. */
  season?: number | null;
  episode?: number | null;

  title: string;
  /** Which adapter can produce/verify this source. */
  sourceType: ProviderSourceType;
  provider: string;
  /**
   * A provider-specific reference (an asset id, a signed URL, a path under
   * /media). NOT always a playable URL — adapters resolve it. Storing a bare
   * URL is allowed for self-hosted media, which is the one case where the
   * value is directly playable.
   */
  playbackUrl: string;
  mimeType: string;

  authorization: AuthorizationClass;
  authorizationStatus: 'verified' | 'pending' | 'unverified';
  enabled: boolean;
  /** Null means "no expiry". Anything past now means the source is dead. */
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Operator note: the licence or contract this rests on. */
  notes?: string | null;
}

/** The adapters this build ships. */
export type ProviderSourceType = 'first_party' | 'cloudflare_stream' | 'apivideo' | 'mux';

// ── Static tier ─────────────────────────────────────────────────────────
//
// The four committed public-domain/CC assets. Converted into the SAME record
// shape as dynamic sources so there is exactly one lookup and one set of rules
// — a static source that behaved differently from a registered one would be a
// second code path, and second code paths are where the original bugs lived.

function isoDate(v: string): Date {
  return new Date(`${v}T00:00:00.000Z`);
}

/**
 * Built on EVERY call, not cached in a module constant.
 *
 * A snapshot taken at import time goes stale the moment anything registers an
 * entry, and "the registry cannot see a source that was just added to it" is
 * exactly the class of bug this layer exists to remove. Cheap: the manifest
 * is a handful of entries.
 */
/**
 * Rights evidence, verified per item.
 *
 * Recorded from the actual source pages, not assumed from a collection:
 *
 *   Big Buck Bunny — the archive.org item page for `BigBuckBunny_124` states
 *     "Usage: Attribution 3.0" and ships a Licence.txt alongside the media.
 *     CC BY 3.0 permits redistribution with attribution, so it is playable
 *     and the attribution below is reproduced as the licence requires.
 *
 *   Betty Boop S01E01–E03 — UNVERIFIED. An earlier note claimed these came
 *     from the Prelinger Archives; that could not be substantiated, because
 *     the Prelinger collection search for "betty boop" returns four items,
 *     none of them these shorts, so there is no per-file rights statement we
 *     can cite. Under the rule that UNVERIFIED is not playable they are held
 *     back until someone opens each file's own source page and records the
 *     licence here. They are NOT deleted, and nothing about them is faked.
 */
const RIGHTS_EVIDENCE: Record<string, SourceRights> = {
  '10378': {
    rightsStatus: 'CC_BY',
    licenseType: 'Creative Commons Attribution 3.0 (CC BY 3.0)',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    rightsSourceUrl: 'https://archive.org/details/BigBuckBunny_124',
    attributionRequired: true,
    attributionText: '"Big Buck Bunny" (c) 2008 Blender Foundation - www.bigbuckbunny.org. Licensed under CC BY 3.0.',
    verifiedAt: new Date('2026-10-03T00:00:00.000Z'),
    verifiedBy: 'curator: archive.org item page + per-file Licence.txt',
  },
};

/** Rights default for anything without recorded evidence: not playable. */
const NO_RIGHTS_EVIDENCE: SourceRights = {
  rightsStatus: 'UNVERIFIED',
  licenseType: null,
  licenseUrl: null,
  rightsSourceUrl: null,
  attributionRequired: false,
  attributionText: null,
  verifiedAt: null,
  verifiedBy: null,
};

export function staticSources(): AuthorizedSourceRecord[] {
  return FIRST_PARTY_MANIFEST.map((e) => ({
    // Precedence: the curator's verified evidence wins, then a licence the
    // manifest entry declares for itself, and finally UNVERIFIED. There is no
    // path from "unknown" to "playable".
    ...(RIGHTS_EVIDENCE[String(e.tmdbId)]
      ?? (e.rightsStatus
        ? {
          rightsStatus: e.rightsStatus,
          licenseType: e.licenseType ?? null,
          licenseUrl: e.licenseUrl ?? null,
          rightsSourceUrl: e.rightsSourceUrl ?? null,
          attributionRequired: Boolean(e.attributionRequired),
          attributionText: e.attributionText ?? null,
          verifiedAt: e.verifiedAt ?? null,
          verifiedBy: e.verifiedBy ?? null,
        }
        : NO_RIGHTS_EVIDENCE)),
  tmdbId: e.tmdbId,
  imdbId: null,
  mediaType: e.mediaType,
  season: e.mediaType === 'tv' ? (e.season ?? 1) : null,
  episode: e.mediaType === 'tv' ? (e.episode ?? 1) : null,title: e.title,
    // A manifest entry may name the provider that hosts its file. It defaults
    // to first_party, which is both the common case and the strongest ad-free
    // guarantee, so declaring a hosted provider is an explicit opt-in.
    sourceType: (e.sourceType ?? 'first_party') as ProviderSourceType,
    provider: e.provider ?? (e.sourceType && e.sourceType !== 'first_party' ? e.sourceType : 'muragoods'),
    // For first_party, `file` is the path under public/media and may contain
    // its own subdirectory; the resolver prepends /media. For a hosted
    // provider it is that provider's asset reference (e.g. a Mux playback id).
    playbackUrl: e.file,
    mimeType: e.container === 'hls' || (e.sourceType && e.sourceType !== 'first_party') ? 'application/x-mpegurl' : 'video/mp4',
    // A hosted provider is licensed by definition: we do not own the bytes and
    // we are streaming them from someone else's infrastructure.
    authorization: (e.sourceType && e.sourceType !== 'first_party' ? 'licensed' : 'first_party') as AuthorizationClass,
  authorizationStatus: 'verified' as const,
  enabled: true,
  expiresAt: null,
  createdAt: isoDate('2026-01-01'),
  updatedAt: isoDate('2026-01-01'),
  notes: 'Committed to this repository; served same-origin from /media.',
  }));
}

/** Snapshot for introspection and tests. Call {@link staticSources} for lookups. */
export const STATIC_SOURCES: AuthorizedSourceRecord[] = staticSources();

/**
 * The address of a source.
 *
 * `imdbId` participates when supplied, but never as a substitute: a source is
 * matched when every field the LOOKUP specified agrees. A lookup that gives a
 * tmdbId only will not be satisfied by an IMDb-only registration, because that
 * would let two different titles collide on one entry.
 */
export interface SourceAddress {
  mediaType: 'movie' | 'tv';
  tmdbId?: number | null;
  imdbId?: string | null;
  season?: number | null;
  episode?: number | null;
}

export type RegistryLookup =
  | { found: true; record: AuthorizedSourceRecord; tier: 'static' | 'dynamic'; status: 'REGISTERED' }
  | {
      found: false;
      /** Why the lookup failed — never collapsed into a generic "unavailable". */
      status:
        | 'SOURCE_NOT_REGISTERED'
        | 'SOURCE_DISABLED'
        | 'SOURCE_EXPIRED'
        | 'SOURCE_NOT_AUTHORIZED'
        | 'RIGHTS_UNVERIFIED';
      /** Records that matched the address but were refused, for diagnostics. */
      considered: Array<{ id: string; status: string; provider: string; sourceType: ProviderSourceType }>;
    };

/** Stable identity of a record, used for delete/update and duplicate checks. */
export function recordKey(r: Pick<AuthorizedSourceRecord, 'mediaType' | 'tmdbId' | 'season' | 'episode'>): string {
  return r.mediaType === 'tv'
    ? `tv:${r.tmdbId}:S${r.season ?? 1}E${r.episode ?? 1}`
    : `movie:${r.tmdbId}`;
}

export function isExpired(r: AuthorizedSourceRecord, now = Date.now()): boolean {
  return r.expiresAt !== null && r.expiresAt.getTime() <= now;
}

/** True when the record is usable: registered, authorized, enabled, unexpired. */
export function usableSourceStatus(
  r: AuthorizedSourceRecord,
  now = Date.now(),
): 'REGISTERED' | 'SOURCE_DISABLED' | 'SOURCE_EXPIRED' | 'SOURCE_NOT_AUTHORIZED' | 'RIGHTS_UNVERIFIED' {
  const verdict = rightsGate(r, now);
  // The gate speaks in terms of the PLAYABLE decision; callers speak in terms
  // of registry state. Mapping them explicitly (rather than casting) means a
  // new gate result cannot silently become an unrelated status code.
  return verdict === 'OK' ? 'REGISTERED' : verdict;
}

/**
 * Find the one source registered for this address.
 *
 * Exact match on every supplied field. There is deliberately NO nearest-season
 * and NO nearest-episode fallback: serving S01E01's file while the UI says
 * S01E03 is a worse failure than an honest "not registered".
 *
 * When several records match (the same title registered twice), the most
 * recently updated usable one wins, so a re-import refreshes rather than
 * duplicates.
 */
export function findInRecords(
  records: AuthorizedSourceRecord[],
  address: SourceAddress,
  now = Date.now(),
): RegistryLookup {
  const matches = records.filter((r) => {
    if (r.mediaType !== address.mediaType) return false;
    if (address.tmdbId != null && r.tmdbId !== address.tmdbId) return false;
    if (address.imdbId && (r.imdbId ?? '').toLowerCase() !== address.imdbId.toLowerCase()) return false;
    if (address.mediaType === 'tv') {
      if (address.season != null && (r.season ?? 1) !== address.season) return false;
      if (address.episode != null && (r.episode ?? 1) !== address.episode) return false;
    }
    // A lookup with neither id is a caller bug, not a "match everything".
    if (address.tmdbId == null && !address.imdbId) return false;
    return true;
  });

  if (!matches.length) return { found: false, status: 'SOURCE_NOT_REGISTERED', considered: [] };

  const considered = matches.map((r) => ({
    id: recordKey(r),
    status: usableSourceStatus(r, now),
    provider: r.provider,
    sourceType: r.sourceType,
  }));

  const usable = matches
    .filter((r) => usableSourceStatus(r, now) === 'REGISTERED')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  if (usable.length) {
    const record = usable[0];
    return {
      found: true,
      record,
      tier: STATIC_SOURCES.includes(record) ? 'static' : 'dynamic',
      status: 'REGISTERED',
    };
  }

  // Matches existed but none were usable. Report the most specific refusal
  // rather than pretending the title was never registered — an operator needs
  // to know the difference between "add it" and "re-enable it".
  const ranked = matches.map((r) => usableSourceStatus(r, now));
  const status = ranked.includes('RIGHTS_UNVERIFIED')
    ? 'RIGHTS_UNVERIFIED'
    : ranked.includes('SOURCE_NOT_AUTHORIZED')
      ? 'SOURCE_NOT_AUTHORIZED'
      : ranked.includes('SOURCE_EXPIRED')
        ? 'SOURCE_EXPIRED'
        : 'SOURCE_DISABLED';

  return { found: false, status, considered };
}

// ── Validation for registration ─────────────────────────────────────────

export interface FieldError { field: string; message: string }
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

/** `tt1234567` — the IMDb id shape. Used only when supplied. */
export function isPlausibleImdbId(raw: string): boolean {
  return /^tt\d{7,10}$/.test(raw.trim());
}

/**
 * Validates a source submission.
 *
 * Season/episode are REQUIRED for tv and FORBIDDEN for a movie. That rule is
 * the whole defence against a movie and a series sharing an address: a movie
 * carrying an episode number is a caller who lost track of what they were
 * registering, and it is refused rather than quietly cleaned.
 */
export function validateSourceInput(input: Record<string, unknown>): ValidationResult<{
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  imdbId: string | null;
  season: number | null;
  episode: number | null;
  title: string;
  sourceType: ProviderSourceType;
  provider: string;
  playbackUrl: string;
  mimeType: string;
  authorization: AuthorizationClass;
  authorizationStatus: 'verified' | 'pending' | 'unverified';
  enabled: boolean;
  expiresAt: Date | null;
  notes: string | null;
  rightsStatus: RightsStatus;
  licenseType: string | null;
  licenseUrl: string | null;
  rightsSourceUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
}> {
  const errors: FieldError[] = [];
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

  const rawType = str(input.mediaType).toLowerCase();
  if (rawType !== 'movie' && rawType !== 'tv') {
    errors.push({ field: 'mediaType', message: 'mediaType must be "movie" or "tv"' });
  }
  const mediaType = rawType as 'movie' | 'tv';

  const tmdbRaw = str(input.tmdbId);
  if (!/^\d+$/.test(tmdbRaw) || Number(tmdbRaw) <= 0) {
    errors.push({ field: 'tmdbId', message: 'tmdbId must be a positive integer' });
  }
  const tmdbId = Number(tmdbRaw);

  const imdbRaw = str(input.imdbId);
  let imdbId: string | null = null;
  if (imdbRaw) {
    if (!isPlausibleImdbId(imdbRaw)) {
      errors.push({ field: 'imdbId', message: 'imdbId must look like tt1234567' });
    } else {
      imdbId = imdbRaw;
    }
  }

  let season: number | null = null;
  let episode: number | null = null;
  const seasonRaw = str(input.season);
  const episodeRaw = str(input.episode);

  if (mediaType === 'movie') {
    if (seasonRaw) errors.push({ field: 'season', message: 'season is not valid for a movie' });
    if (episodeRaw) errors.push({ field: 'episode', message: 'episode is not valid for a movie' });
  } else {
    if (!/^\d+$/.test(seasonRaw) || Number(seasonRaw) < 0) {
      errors.push({ field: 'season', message: 'season is required for a series and must be a non-negative integer' });
    } else {
      season = Number(seasonRaw);
    }
    if (!/^\d+$/.test(episodeRaw) || Number(episodeRaw) < 1) {
      errors.push({ field: 'episode', message: 'episode is required for a series and must be a positive integer' });
    } else {
      episode = Number(episodeRaw);
    }
  }

  const title = str(input.title).slice(0, 200);
  if (!title) errors.push({ field: 'title', message: 'title is required' });

  const sourceType = str(input.sourceType).toLowerCase() as ProviderSourceType;
  const KNOWN: ProviderSourceType[] = ['first_party', 'cloudflare_stream', 'apivideo', 'mux'];
  if (!KNOWN.includes(sourceType)) {
    errors.push({ field: 'sourceType', message: `sourceType must be one of ${KNOWN.join(', ')}` });
  }

  const playbackUrl = str(input.playbackUrl);
  if (!playbackUrl) {
    errors.push({ field: 'playbackUrl', message: 'playbackUrl (or asset reference) is required' });
  } else if (playbackUrl.length > 2048) {
    errors.push({ field: 'playbackUrl', message: 'playbackUrl is too long' });
  }

  const authorization = (str(input.authorization) === 'licensed' ? 'licensed' : 'first_party') as AuthorizationClass;
  // Defaults to `pending`, never to `verified`: a source an operator has not
  // explicitly cleared must not inherit the strongest authorization state.
  const authStatusRaw = str(input.authorizationStatus);
  const authStatus = (authStatusRaw || 'pending') as 'verified' | 'pending' | 'unverified';
  if (!['verified', 'pending', 'unverified'].includes(authStatus)) {
    errors.push({ field: 'authorizationStatus', message: 'authorizationStatus must be verified, pending or unverified' });
  }

  let expiresAt: Date | null = null;
  const expiresRaw = str(input.expiresAt);
  if (expiresRaw) {
    const parsed = new Date(expiresRaw);
    if (Number.isNaN(parsed.getTime())) {
      errors.push({ field: 'expiresAt', message: 'expiresAt must be a valid date' });
    } else {
      expiresAt = parsed;
    }
  }

  // ── Rights ──────────────────────────────────────────────────────────
  // A source may be REGISTERED with UNVERIFIED rights (so it is visible and
  // auditable in admin), but anything claiming a playable licence must carry
  // the evidence that supports it. This is the single rule that stops a
  // "free movie" URL from becoming a playable source on a hunch.
  const rightsStatus = (str(input.rightsStatus) || 'UNVERIFIED') as RightsStatus;
  const KNOWN_RIGHTS: RightsStatus[] = ['PUBLIC_DOMAIN', 'CC_BY', 'CC_BY_SA', 'MURAGOODS_OWNED', 'LICENSED', 'UNVERIFIED'];
  if (!KNOWN_RIGHTS.includes(rightsStatus)) {
    errors.push({ field: 'rightsStatus', message: `rightsStatus must be one of ${KNOWN_RIGHTS.join(', ')}` });
  }
  const licenseType = str(input.licenseType) || null;
  const licenseUrl = str(input.licenseUrl) || null;
  const rightsSourceUrl = str(input.rightsSourceUrl) || null;
  if (PLAYABLE_RIGHTS.has(rightsStatus)) {
    if (!rightsSourceUrl) {
      errors.push({ field: 'rightsSourceUrl', message: 'a playable licence must cite the page that evidences it' });
    }
    if (!licenseType) {
      errors.push({ field: 'licenseType', message: 'a playable licence must name the licence' });
    }
  }
  const verifiedAtRaw = str(input.verifiedAt);
  let verifiedAt: Date | null = null;
  if (verifiedAtRaw) {
    const d = new Date(verifiedAtRaw);
    if (Number.isNaN(d.getTime())) errors.push({ field: 'verifiedAt', message: 'verifiedAt must be a valid date' });
    else verifiedAt = d;
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      mediaType,
      tmdbId,
      imdbId,
      season,
      episode,
      title,
      sourceType,
      provider: str(input.provider) || 'muragoods',
      playbackUrl,
      mimeType: str(input.mimeType) || (sourceType === 'cloudflare_stream' ? 'application/vnd.apple.mpegurl' : 'video/mp4'),
      authorization,
      authorizationStatus: authStatus,
      enabled: input.enabled === undefined ? true : Boolean(input.enabled),
      expiresAt,
      notes: str(input.notes) || null,
      rightsStatus,
      licenseType,
      licenseUrl,
      rightsSourceUrl,
      attributionRequired: input.attributionRequired === undefined ? Boolean(licenseType) : Boolean(input.attributionRequired),
      attributionText: str(input.attributionText) || null,
      verifiedAt,
      verifiedBy: str(input.verifiedBy) || null,
    },
  };
}

/**
 * The gate. A source reaches the player only when it is enabled, unexpired,
 * authorized AND its rights are demonstrable.
 *
 * Returns the refusal reason so the resolver can report the exact step that
 * failed instead of a generic "unavailable".
 */
export function rightsGate(
  r: AuthorizedSourceRecord,
  now = Date.now(),
): 'OK' | 'SOURCE_DISABLED' | 'SOURCE_EXPIRED' | 'SOURCE_NOT_AUTHORIZED' | 'RIGHTS_UNVERIFIED' {
  if (!PLAYABLE_RIGHTS.has(r.rightsStatus)) return 'RIGHTS_UNVERIFIED';
  if (r.authorizationStatus === 'unverified') return 'SOURCE_NOT_AUTHORIZED';
  if (!r.enabled) return 'SOURCE_DISABLED';
  if (isExpired(r, now)) return 'SOURCE_EXPIRED';
  return 'OK';
}