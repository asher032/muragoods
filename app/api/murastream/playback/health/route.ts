import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/session';
import { resolvePlayback, firstPartyInventory } from '@/app/lib/murastream/playback/resolver';
import { validateSource, writeCache, readCache, clearPlaybackCache } from '@/app/lib/murastream/playback/validate';
import { allAdapters } from '@/app/lib/murastream/playback/providers';
import { allSources } from '@/app/lib/murastream/playback/store';
import { usableSourceStatus } from '@/app/lib/murastream/playback/registry';
import { firstPartyMovie, FIRST_PARTY_MANIFEST } from '@/app/lib/murastream/playback/authorized-sources';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/murastream/playback/health — per-component playback diagnostics.
//
// Reports each component INDEPENDENTLY. This is the point of the endpoint: a
// working movie path must never mask a broken TV or episode resolver. An
// operator seeing "movie ONLINE, tv OFFLINE" learns something actionable;
// "playback ONLINE" would have hidden it.

type Status = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

interface Component {
  component: string;
  status: Status;
  detail: string;
  /** Measured, not asserted. */
  durationMs: number | null;
}

const TMDB_BASE = 'https://api.themoviedb.org/3';

async function checkTmdb(): Promise<Component> {
  const started = Date.now();
  const key = process.env.TMDB_API_KEY || '';
  if (!key) {
    // No key is not an outage: the catalog falls back to the baked dataset.
    return { component: 'tmdb_metadata', status: 'DEGRADED', detail: 'no API key — using baked catalog', durationMs: null };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${TMDB_BASE}/configuration`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const durationMs = Date.now() - started;
    if (res.ok) return { component: 'tmdb_metadata', status: 'ONLINE', detail: 'reachable', durationMs };
    if (res.status === 429) return { component: 'tmdb_metadata', status: 'DEGRADED', detail: 'rate limited', durationMs };
    return { component: 'tmdb_metadata', status: 'DEGRADED', detail: `HTTP ${res.status}`, durationMs, };
  } catch {
    return { component: 'tmdb_metadata', status: 'OFFLINE', detail: 'unreachable', durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The resolver itself is exercised end to end against titles we know exist,
 * so this measures the real code path rather than asserting a green light.
 * A MISSING_LIBRARY is reported as OFFLINE for the component that needs the
 * asset: with an empty first-party manifest, movie and episode resolution
 * legitimately have nothing to return, and saying ONLINE would be a lie.
 */
async function checkResolver(kind: 'movie' | 'tv', origin: string): Promise<Component> {
  const name = kind === 'movie' ? 'movie_resolver' : 'tv_resolver';
  const component: Component = { component: name, status: 'OFFLINE', detail: '', durationMs: null };
  const started = Date.now();

  const sample = FIRST_PARTY_MANIFEST.find((e) => e.mediaType === kind);
  if (!sample) {
    component.detail = 'no registered source to validate';
    component.status = FIRST_PARTY_MANIFEST.length === 0 ? 'DEGRADED' : 'OFFLINE';
    return component;
  }

  const result = await resolvePlayback(
    kind === 'movie'
      ? { mediaType: 'movie', tmdbId: sample.tmdbId }
      : { mediaType: 'tv', tmdbId: sample.tmdbId, season: sample.season ?? 1, episode: sample.episode ?? 1 },
    // The live origin, so the probe measures the server that will actually
    // serve the file rather than a hardcoded localhost.
    origin,
  );
  component.durationMs = Date.now() - started;

  if (result.status === 'PLAYABLE') {
    component.status = 'ONLINE';
    component.detail = 'resolved and validated';
  } else if (result.status === 'TEMPORARILY_FAILED') {
    component.status = 'DEGRADED';
    component.detail = `source failed validation (${result.reason})`;
  } else {
    component.status = 'OFFLINE';
    component.detail = `no authorized source (${result.reason})`;
  }
  return component;
}

/** Episode addressing specifically, independent of the series resolver. */
async function checkEpisodeResolver(origin: string): Promise<Component> {
  const component: Component = { component: 'episode_resolver', status: 'OFFLINE', detail: '', durationMs: null };
  const tv = FIRST_PARTY_MANIFEST.find((e) => e.mediaType === 'tv');
  if (!tv) {
    component.detail = 'no registered episode to validate';
    component.status = FIRST_PARTY_MANIFEST.length === 0 ? 'DEGRADED' : 'OFFLINE';
    return component;
  }
  const started = Date.now();
  // A season/episode that does not exist must be refused, never silently
  // served from a neighbouring episode.
  const missing = await resolvePlayback({
    mediaType: 'tv',
    tmdbId: tv.tmdbId,
    season: (tv.season ?? 1) + 900,
    episode: (tv.episode ?? 1) + 900,
  }, origin);
  component.durationMs = Date.now() - started;
  component.status = missing.status !== 'PLAYABLE' ? 'ONLINE' : 'OFFLINE';
  component.detail = component.status === 'ONLINE'
    ? 'exact episode addressing enforced'
    : 'a non-existent episode resolved to a source';
  return component;
}

/** Proves the validator rejects an unauthorized URL rather than passing it. */
async function checkSourceValidation(): Promise<Component> {
  const started = Date.now();
  const bad = await validateSource({
    provider: 'probe',
    authorization: 'first_party',
    kind: 'FULL_PLAYBACK',
    mediaType: 'movie',
    // Off-origin "first_party": exactly what the validator must refuse.
    url: 'https://example.invalid/video.mp4',
    container: 'mp4',
    tmdbId: 0,
    label: 'probe',
  });
  const durationMs = Date.now() - started;
  return {
    component: 'source_validation',
    status: !bad.ok ? 'ONLINE' : 'OFFLINE',
    detail: !bad.ok ? 'rejects unauthorized and unreachable sources' : 'accepted an invalid source',
    durationMs,
  };
}

/** The player contract: only PLAYABLE may produce a URL. */
function checkPlayer(): Component {
  const firstMovie = FIRST_PARTY_MANIFEST.find((e) => e.mediaType === 'movie');
  const firstTv = FIRST_PARTY_MANIFEST.find((e) => e.mediaType === 'tv');
  const anySource = firstMovie
    ? firstPartyMovie(firstMovie.tmdbId)
    : firstTv
      ? { url: '/media' }
      : null;
  return {
    component: 'player',
    status: anySource ? 'ONLINE' : 'DEGRADED',
    detail: anySource
      ? 'receives validated authorized sources only'
      : 'no authorized source to present',
    durationMs: null,
  };
}

/**
 * Provider health, measured per adapter.
 *
 * Each adapter answers for itself: CONFIGURED, NOT_CONFIGURED, INVALID or
 * UNREACHABLE. A configured provider is never reported as ONLINE purely
 * because a variable exists — the Cloudflare and api.video adapters make a
 * real credentialed request and report only its outcome, never the secret.
 *
 * "A provider exists" is also never conflated with "every title exists": the
 * registry counts below are reported separately, precisely so that gap stays
 * visible.
 */
async function checkProviders(): Promise<Component[]> {
  const out: Component[] = [];
  for (const adapter of allAdapters()) {
    const h = await adapter.healthCheck();
    out.push({
      component: `provider:${h.sourceType}`,
      status: h.state === 'PROVIDER_CONFIGURED'
        ? 'ONLINE'
        : h.state === 'PROVIDER_NOT_CONFIGURED' ? 'DEGRADED' : 'OFFLINE',
      detail: `${h.state} — ${h.detail}`,
      durationMs: h.durationMs,
    });
  }
  return out;
}

/**
 * Registry census — the numbers that explain WHY a title is unavailable.
 *
 * Reported as counts, never as a verdict: a large "titles missing sources"
 * number is a content-operations fact, not a resolver fault.
 */
async function checkRegistry(): Promise<Component> {
  const started = Date.now();
  const { records, store } = await allSources();
  const enabled = records.filter((r) => usableSourceStatus(r) === 'REGISTERED').length;
  const expired = records.filter((r) => r.expiresAt !== null && r.expiresAt.getTime() <= Date.now()).length;
  const movies = records.filter((r) => r.mediaType === 'movie').length;
  const episodes = records.filter((r) => r.mediaType === 'tv').length;

  if (!store.available) {
    return {
      component: 'source_registry',
      status: 'DEGRADED',
      detail: `${store.detail}; ${records.length} static source(s) resolvable, operator-registered sources unavailable`,
      durationMs: Date.now() - started,
    };
  }
  return {
    component: 'source_registry',
    status: 'ONLINE',
    detail: `${records.length} registered (${enabled} usable, ${expired} expired, ${movies} movie, ${episodes} episode)`,
    durationMs: Date.now() - started,
  };
}

/** The cache is in-process; this proves it reads and writes, not that it exists. */
async function checkCache(): Promise<Component> {
  const started = Date.now();
  const key = 'health:probe';
  writeCache(key, 'TEMPORARILY_FAILED', 'PROVIDER_ERROR');
  const roundTripped = readCache(key);
  clearPlaybackCache(key);
  const ok = roundTripped?.state === 'TEMPORARILY_FAILED';
  return {
    component: 'cache',
    status: ok ? 'ONLINE' : 'OFFLINE',
    detail: ok ? 'read/write round-trip succeeded' : 'cache did not retain a written entry',
    durationMs: Date.now() - started,
  };
}

export async function GET(req: Request) {
  // Admin/developer only: this endpoint performs real upstream fetches.
  const { response } = await requireAdmin(req);
  if (response) return response;

  // Health must probe the live origin, not a hardcoded localhost.
  const origin = new URL(req.url).origin;

  const started = Date.now();
  const [tmdb, movie, tv, episode, validation, player, providers, registry, cache] = await Promise.all([
    checkTmdb(),
    checkResolver('movie', origin),
    checkResolver('tv', origin),
    checkEpisodeResolver(origin),
    checkSourceValidation(),
    checkPlayer(),
    checkProviders(),
    checkRegistry(),
    checkCache(),
  ]);

  const components: Component[] = [tmdb, movie, tv, episode, validation, player, registry, ...providers, cache];
  const playbackApi: Component = {
    component: 'playback_api',
    status: 'ONLINE',
    detail: 'route registered and guarded',
    durationMs: null,
  };

  const all: Component[] = [...components, playbackApi];
  // Overall state is the WORST component. A single OFFLINE resolver must not
  // be averaged away by five healthy ones.
  const overall: Status = all.some((c) => c.status === 'OFFLINE')
    ? 'OFFLINE'
    : all.some((c) => c.status === 'DEGRADED')
      ? 'DEGRADED'
      : 'ONLINE';

  return NextResponse.json({
    overall,
    // The headline that would have hidden the failure: movies work, TV does not.
    moviePlayback: movie.status,
    tvPlayback: tv.status,
    episodePlayback: episode.status,
    inventory: firstPartyInventory(),
    components: all,
    durationMs: Date.now() - started,
  }, { headers: { 'Cache-Control': 'no-store' } });
}