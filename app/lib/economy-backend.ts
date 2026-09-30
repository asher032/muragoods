import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage, type UserGuild } from '@/app/lib/discord-guilds';

// ── Single gateway to the Murabot economy backend ───────────────────────
// Every economy number the dashboard shows is produced by the bot against the
// same MongoDB collections the slash commands use. This module is the ONLY
// place the dashboard talks to that backend, which is what makes it
// impossible for the site to grow a second, divergent economy.
//
// It also owns the request discipline the economy page needs:
//
//   * one cache per (endpoint, guild) with a short TTL,
//   * one in-flight promise per key, so N mounted components share one call,
//   * exponential backoff with jitter on 429/5xx, bounded and finite,
//   * cache invalidation after a legitimate save,
//   * NO polling. A cache entry is served until it expires or is invalidated.
//
// The prior failure ("Discord rate-limited configuration loading. Retry in 1s")
// was not a retry-count problem: several mounted panels each independently
// requested the same configuration, and every mount repeated the request on
// re-render. The fix is deduplication and caching, not more retries.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE =
  process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

const SECRET = process.env.DISCORD_BRIDGE_SECRET || '';

/** Per-endpoint cache TTL. Reads that drive the page are short; the leaderboard
 *  and catalog barely change within a minute. */
const TTL_MS: Record<string, number> = {
  overview: 20_000,
  config: 20_000,
  leaderboard: 20_000,
  health: 20_000,
  audit: 30_000,
  shop: 20_000,
  transactions: 0, // filtered/paginated: never cached without a full key
};

interface CacheEntry {
  at: number;
  payload: Record<string, unknown>;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Record<string, unknown>>>();

/** Drop every cached economy read for one guild after a legitimate save. */
export function invalidateEconomy(guildId: string) {
  for (const key of cache.keys()) {
    if (key.endsWith(`|${guildId}`)) cache.delete(key);
  }
}

export interface BotResult {
  ok: boolean;
  data?: Record<string, unknown>;
  code?: string;
  error?: string;
  status: number;
  retryAfterSec?: number;
  /** True when the value was served from cache with no upstream call. */
  cached?: boolean;
}

/** Retry-After on a 429 tells the caller exactly when to come back. */
function readRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get('retry-after');
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(60, Math.ceil(secs));
  return undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One cached, deduplicated, backoff-aware call to the bot's economy API.
 *
 * `attempts` is deliberately small and bounded (default 3). Retrying harder is
 * not the answer to a rate limit — serving a cached value is.
 */
async function callBot(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  attempts = 3,
): Promise<BotResult> {
  if (!SECRET) {
    return {
      ok: false, status: 503, code: 'BRIDGE_NOT_CONFIGURED',
      error: 'The Murabot backend is not configured. Add DISCORD_BRIDGE_SECRET.',
    };
  }
  let last: BotResult = { ok: false, status: 502, code: 'BOT_OFFLINE', error: 'Murabot did not respond.' };
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      // Exponential backoff with jitter. Jitter stops a fleet of dashboard
      // tabs from retrying in lockstep and re-creating the thundering herd.
      const base = Math.min(4000, 400 * 2 ** (attempt - 1));
      await sleep(base + Math.floor(Math.random() * 250));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const onAbort = () => controller.abort();
    init.signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(`${BOT_BASE}${path}`, {
        method: init.method || 'GET',
        headers: {
          Authorization: `Bearer ${SECRET}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = (await res.json().catch(() => null)) as
        | (Record<string, unknown> & { ok?: boolean; error?: string; code?: string })
        | null;
      if (res.ok && payload && payload.ok) {
        return { ok: true, data: payload as Record<string, unknown>, status: res.status };
      }
      // The bot's own structured refusal (unauthorized / not in guild /
      // owner-only) must reach the dashboard unchanged — these are real
      // answers, not transport failures, so they are never retried.
      if (payload && payload.code && payload.code !== 'ECONOMY_RATE_LIMITED') {
        return {
          ok: false, status: res.status,
          code: String(payload.code),
          error: typeof payload.error === 'string' ? payload.error : 'Request refused.',
          retryAfterSec: readRetryAfter(res),
        };
      }
      if (res.status === 429 || res.status >= 500) {
        last = {
          ok: false, status: res.status, code: 'RATE_LIMITED',
          error: 'Murabot is busy — retrying.',
          retryAfterSec: readRetryAfter(res),
        };
        continue;
      }
      return {
        ok: false, status: res.status,
        code: (payload?.code as string) || 'ECONOMY_DATA_FAILED',
        error: typeof payload?.error === 'string' ? payload.error : 'Economy data could not be loaded.',
      };
    } catch {
      // A transport failure. An external abort is a cancellation, not an
      // outage, and must not be reported as the backend being down.
      if (init.signal?.aborted) {
        return { ok: false, status: 499, code: 'REQUEST_ABORTED', error: 'Request cancelled.' };
      }
      last = {
        ok: false, status: 502, code: 'BOT_OFFLINE',
        error: 'Murabot is currently offline — retry in a moment.',
      };
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }
  }
  return {
    ...last,
    status: 503,
    code: 'RATE_LIMITED',
    error: 'Murabot is rate-limiting requests — retry shortly.',
    retryAfterSec: last.retryAfterSec ?? 5,
  };
}

/**
 * Cached + single-flight wrapper around {@link callBot}.
 *
 * Concurrent callers for the same key share ONE upstream request. A fresh
 * cache entry is served with zero network calls.
 */
export async function botEconomyGet(
  endpoint: string,
  guildId: string,
  query: Record<string, string | number | undefined> = {},
): Promise<BotResult> {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  const path = `/economy/${endpoint}/${guildId}${qs ? `?${qs}` : ''}`;
  const key = `${endpoint}|${guildId}${qs ? `|${qs}` : ''}`;
  const ttl = TTL_MS[endpoint];

  if (ttl > 0) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) {
      return { ok: true, data: hit.payload, status: 200, cached: true } as BotResult;
    }
  }
  const running = inflight.get(key);
  if (running) {
    try {
      return { ok: true, data: await running, status: 200 } as BotResult;
    } catch {
      /* fall through to a fresh call below */
    }
  }
  const promise = callBot(path).then((res) => {
    if (res.ok && res.data) cache.set(key, { at: Date.now(), payload: res.data });
    if (!res.ok) {
      // A failed share must not poison later callers: drop it so the next
      // request can retry instead of replaying a stale failure.
      throw res;
    }
    return res.data ?? {};
  });
  inflight.set(key, promise as Promise<Record<string, unknown>>);
  try {
    return { ok: true, data: await promise, status: 200 };
  } catch (err) {
    const failed = err as BotResult;
    return {
      ok: false,
      status: failed?.status || 502,
      code: failed?.code || 'ECONOMY_DATA_FAILED',
      error: failed?.error || 'Economy data could not be loaded.',
      retryAfterSec: failed?.retryAfterSec,
    };
  } finally {
    if (inflight.get(key) === promise) inflight.delete(key);
  }
}

/** Write through to the bot. Never cached; invalidates the guild's reads. */
export async function botEconomyWrite(
  endpoint: string,
  guildId: string,
  body: Record<string, unknown>,
): Promise<BotResult> {
  const res = await callBot(`/economy/${endpoint}/${guildId}`, { method: 'POST', body }, 1);
  if (res.ok) invalidateEconomy(guildId);
  return res;
}

export type { UserGuild };
export { requireGuildManage, sessionToken };