import type { PlaybackSource, PlaybackReason } from './types';
import { assertAuthorized } from './authorized-sources';

// ── Source validation ───────────────────────────────────────────────────
//
// A source only becomes PLAYABLE after it has been proven to serve the right
// media. This module is the gate: nothing reaches the player without passing
// through `validateSource`.
//
// What is checked depends on the source class:
//
//   first_party  a real ranged HTTP request against OUR OWN origin. Checks the
//                file exists, is a video/* type, and actually returns bytes.
//                Because it is same-origin, a failure is unambiguous — it is
//                our file, not someone else's page.
//
//   licensed     the embed key is well-formed and the site is one we accept.
//                A trailer is not probed for bytes: doing so would mean
//                fetching from a third party on every play, which is both slow
//                and unnecessary for a non-playable extra.

export interface ValidationOutcome {
  ok: boolean;
  reason: PlaybackReason | null;
  httpStatus: number | null;
  contentType: string | null;
  durationMs: number;
}

/**
 * Where to resolve a relative first-party URL.
 *
 * Validation must reach the SAME server that will serve the file. Falling back
 * to a hardcoded localhost would probe the wrong origin whenever the app runs
 * on any other port or host — which is why the origin is passed in from the
 * request instead of guessed.
 */
let originOverride: string | null = null;

export function setValidationOrigin(origin: string): void {
  originOverride = origin;
}

function validationBase(): string {
  if (originOverride) return originOverride;
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured;
  return 'http://localhost:3000';
}

const VALIDATE_TIMEOUT_MS = 8000;

/** A provider timeout is temporary; a 404 on our own file is not. */
function reasonForStatus(status: number): PlaybackReason {
  if (status === 404) return 'SOURCE_NOT_FOUND';
  if (status === 401 || status === 403) return 'REGION_BLOCKED';
  if (status === 408 || status === 504) return 'PROVIDER_TIMEOUT';
  if (status === 429) return 'PLAYBACK_SERVICE_UNAVAILABLE';
  if (status >= 500) return 'PROVIDER_ERROR';
  return 'SOURCE_INVALID';
}

export async function validateSource(source: PlaybackSource): Promise<ValidationOutcome> {
  const started = Date.now();

  // Authorization is re-checked here, at the last gate before the player.
  // A bug elsewhere that invents an unauthorized source still cannot ship.
  if (!assertAuthorized(source)) {
    return { ok: false, reason: 'SOURCE_NOT_AUTHORIZED', httpStatus: null, contentType: null, durationMs: Date.now() - started };
  }

  if (source.authorization === 'licensed') {
    // Shape-only validation: the key was already regex-checked when the
    // source was built, so reaching here means it is well-formed.
    return { ok: true, reason: null, httpStatus: null, contentType: 'text/html', durationMs: Date.now() - started };
  }

  // first_party: prove the bytes exist and are actually video.
  const absolute = source.url.startsWith('http')
    ? source.url
    : new URL(source.url, validationBase()).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    // A ranged GET: enough to learn the status and content type without
    // downloading a whole film.
    const res = await fetch(absolute, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    const durationMs = Date.now() - started;
    const contentType = res.headers.get('content-type');

    // 200 (whole file, range ignored) and 206 (partial) both mean present.
    if (res.status !== 200 && res.status !== 206) {
      return { ok: false, reason: reasonForStatus(res.status), httpStatus: res.status, contentType, durationMs };
    }
    // Our own asset serving HTML means the file is missing and something
    // rewrote it into a page — a misdeploy, not a playable source.
    if (contentType && !/^video\//i.test(contentType) && !/application\/(x-mpegurl|vnd\.apple\.mpegurl|octet-stream)/i.test(contentType)) {
      return { ok: false, reason: 'SOURCE_INVALID', httpStatus: res.status, contentType, durationMs };
    }
    // Drain so the socket is released rather than left half-read.
    await res.arrayBuffer().catch(() => undefined);
    return { ok: true, reason: null, httpStatus: res.status, contentType, durationMs };
  } catch (err) {
    const durationMs = Date.now() - started;
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    // The class and cause code only — never a message, which can embed a URL
    // or a credential.
    const cause = (err as { cause?: { code?: string } } | null)?.cause;
    console.warn(
      `[playback] first-party validation failed origin=${validationBase()} class=${err instanceof Error ? err.name : typeof err} cause=${cause?.code ?? '-'}`,
    );
    return {
      ok: false,
      reason: aborted ? 'PROVIDER_TIMEOUT' : 'PLAYBACK_SERVICE_UNAVAILABLE',
      httpStatus: null,
      contentType: null,
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Playback cache ─────────────────────────────────────────────────────
//
// A temporary provider failure must NOT be remembered as "this title has no
// source" — that is how a transient outage permanently strands a title. The
// three states have deliberately different lifetimes:
//
//   AVAILABLE         the source validated; cached briefly, because a signed
//                     or expiring URL can go stale.
//   TEMPORARILY_FAILED short TTL, then retried. Self-healing.
//   UNAVAILABLE        longer TTL, because it reflects a deliberate absence
//                     rather than a fault.

export type CacheState = 'AVAILABLE' | 'TEMPORARILY_FAILED' | 'UNAVAILABLE';

interface CacheEntry {
  state: CacheState;
  reason: PlaybackReason | null;
  sources: PlaybackSource[];
  storedAt: number;
  expiresAt: number;
}

const TTL_MS: Record<CacheState, number> = {
  AVAILABLE: 5 * 60_000,
  TEMPORARILY_FAILED: 60_000,
  UNAVAILABLE: 15 * 60_000,
};

const CACHE_MAX = 500;
const cache = new Map<string, CacheEntry>();

export function playbackCacheKey(mediaType: string, tmdbId: number, season?: number | null, episode?: number | null): string {
  // Season/episode are part of the key: caching S01E01's answer for S01E02 is
  // precisely the "reuses the previous episode's source" bug.
  return mediaType === 'tv' ? `tv:${tmdbId}:S${season ?? 1}E${episode ?? 1}` : `movie:${tmdbId}`;
}

export function readCache(key: string): CacheEntry | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  // LRU touch so hot keys are not evicted first.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function writeCache(key: string, state: CacheState, reason: PlaybackReason | null, sources: PlaybackSource[] = []): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  const now = Date.now();
  cache.set(key, { state, reason, sources, storedAt: now, expiresAt: now + TTL_MS[state] });
}

/**
 * Cached TEMPORARILY_FAILED results are not served as an answer — they fall
 * through to a fresh resolve. Serving them would make a blip look permanent.
 */
export function readUsableCache(key: string): CacheEntry | null {
  const hit = readCache(key);
  if (!hit) return null;
  if (hit.state === 'TEMPORARILY_FAILED') return null;
  return hit;
}

export function clearPlaybackCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}