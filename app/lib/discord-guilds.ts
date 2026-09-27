export const dynamic = 'force-dynamic';

// ── User-side Discord guild authorization, shared ────────────────────────
// Every dashboard route that gates on "user manages this guild" must go
// through fetchUserGuilds(). The critical distinction this preserves:
//
//   Discord 401 on /users/@me/guilds  →  the SESSION TOKEN is dead
//                                        (expired/rotated/revoked) → caller
//                                        must answer 401 "sign in again",
//                                        NEVER 403 "no permission".
//   Discord 200 without the guild    →  NOT_GUILD_MEMBER territory.
//   Guild present but unmanaged      →  INSUFFICIENT_GUILD_PERMISSION.
//
// Collapsing a dead token into "No permission for this server" is exactly
// the false-permission loop: the server is correct, the user is a manager,
// but every module insists otherwise until a fresh login.

export interface UserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | number;
}

export type UserGuildsResult =
  | { ok: true; guilds: UserGuild[] }
  | { ok: false; authFailed: true }
  | { ok: false; authFailed: false; status: number; retryAfterMs?: number };

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

/** Pure permission-bit check, exported for CI unit tests. */
export function hasManageBits(owner: boolean, perms: string | number): boolean {
  if (owner) return true;
  try {
    const p = BigInt(perms);
    return (p & MANAGE_GUILD) !== BigInt(0) || (p & ADMINISTRATOR) !== BigInt(0);
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Structured operational log for the guild-list read. Token fingerprints
 * (never the token), status codes and counts only — no secrets, no user
 * data beyond the session owner's id supplied by the caller for correlation.
 */
export function logGuilds(
  outcome: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  try {
    const parts = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${String(v)}`);
    console.log(`[DiscordGuilds] ${outcome}${parts.length ? ` ${parts.join(' ')}` : ''}`);
  } catch {
    /* logging must never break the request */
  }
}

/** Live guild list for the OAuth identity behind accessToken. */
export async function fetchUserGuilds(accessToken: string, discordId?: string): Promise<UserGuildsResult> {
  // 429s carry Retry-After: honor it (plus one capped backoff retry) instead
  // of instantly failing the whole dashboard. Other transient faults
  // (5xx/timeout) get a single quick retry; 401 is final (dead token).
  const logCtx = { token: tokenFingerprint(accessToken), ...(discordId ? { userId: discordId } : {}) };
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(attempt === 1 ? 1500 : 4000);
    }
    try {
      const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (resp.status === 401) {
        logGuilds('guilds 401', { ...logCtx, reason: 'oauth_token_invalid' });
        return { ok: false, authFailed: true };
      }
      if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get('retry-after') || 0);
        const waitMs = Math.max(0, Math.min(15000, (Number.isFinite(retryAfter) ? retryAfter * 1000 : 2000)));
        logGuilds('guilds 429', { ...logCtx, reason: 'discord_rate_limited', retryAfterMs: waitMs, attempt: attempt + 1 });
        if (attempt < 2) {
          await sleep(waitMs);
          continue;
        }
        return { ok: false, authFailed: false, status: 429, retryAfterMs: waitMs };
      }
      if (!resp.ok) {
        logGuilds('guilds error', { ...logCtx, discordStatus: resp.status, attempt: attempt + 1 });
        if (resp.status >= 500 && attempt < 2) continue;
        return { ok: false, authFailed: false, status: resp.status };
      }
      const guilds = (await resp.json()) as UserGuild[];
      const list = Array.isArray(guilds) ? guilds : [];
      logGuilds('guilds ok', { ...logCtx, discordStatus: 200, guildCount: list.length });
      return { ok: true, guilds: list };
    } catch (err) {
      lastStatus = 0;
      logGuilds('guilds exception', {
        ...logCtx,
        reason: err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network',
        attempt: attempt + 1,
      });
      if (attempt >= 2) return { ok: false, authFailed: false, status: 0 };
    }
  }
  return { ok: false, authFailed: false, status: lastStatus };
}

/** Manageable guild ids for the OAuth identity. null = token dead/unreachable. */
export async function manageableGuildIds(accessToken: string): Promise<Set<string> | null> {
  const res = await fetchUserGuilds(accessToken);
  if (!res.ok) return null;
  return new Set(res.guilds.filter((g) => hasManageBits(g.owner, g.permissions)).map((g) => g.id));
}

// ── Cached guild-list reads (kills the 429 → false-403 storm) ─────────────
// A dashboard page load fires resources + overview + bans + servers + config
// concurrently — one uncached /users/@me/guilds call per route, each retried
// up to 4× on 429/5xx. Discord rate-limits that burst, and every pre-existing
// local helper turned ANY non-OK answer into "no permission". Cache the list
// 30s per token fingerprint: same request-second burst shares one Discord
// call, and a 429 serves the fresh cache instead of a false 403.
interface GuildsCacheEntry {
  at: number;
  guilds: UserGuild[];
}
const guildsCache = new Map<string, GuildsCacheEntry>();
const GUILDS_TTL_MS = 30_000;

function tokenFingerprint(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `g${(h >>> 0).toString(36)}`;
}

/** fetchUserGuilds with a 30s per-token cache. 429/5xx serve stale cache. */
export async function fetchUserGuildsCached(accessToken: string): Promise<UserGuildsResult> {
  const key = tokenFingerprint(accessToken);
  const hit = guildsCache.get(key);
  if (hit && Date.now() - hit.at < GUILDS_TTL_MS) {
    return { ok: true, guilds: hit.guilds };
  }
  const res = await fetchUserGuilds(accessToken);
  if (res.ok) {
    guildsCache.set(key, { at: Date.now(), guilds: res.guilds });
    if (guildsCache.size > 500) {
      const oldest = guildsCache.keys().next().value;
      if (oldest) guildsCache.delete(oldest);
    }
    return res;
  }
  // Transient Discord fault (429/5xx/timeout, NOT 401): serve the last good
  // list if we have one — a rate limit is never "no permission".
  if (!res.ok && !res.authFailed && hit) {
    return { ok: true, guilds: hit.guilds };
  }
  return res;
}

export type ManageCheck =
  | { ok: true; guild: UserGuild }
  | {
      ok: false;
      code:
        | 'AUTH_REQUIRED'
        | 'NOT_GUILD_MEMBER'
        | 'INSUFFICIENT_GUILD_PERMISSION'
        | 'RATE_LIMITED'
        | 'DISCORD_API_ERROR';
      status: number;
      error: string;
      retryable: boolean;
      retryAfterMs?: number;
      debug: {
        guildId: string;
        userMember: boolean | null;
        userCanManage: boolean | null;
        discordStatus: number | null;
      };
    };

/**
 * Authoritative "may this OAuth identity manage this guild" check. Every
 * dashboard data route must use this instead of a local copy — the codes are
 * never conflated:
 *   dead session token            → 401 AUTH_REQUIRED (sign in again)
 *   guild absent from user list   → 403 NOT_GUILD_MEMBER
 *   present but unmanaged         → 403 INSUFFICIENT_GUILD_PERMISSION
 *   Discord 429/5xx/timeout       → 502 DISCORD_API_ERROR (retryable, and
 *                                   served from 30s cache when available)
 */
export async function requireGuildManage(
  accessToken: string,
  guildId: string,
): Promise<ManageCheck> {
  const debugBase = {
    guildId,
    userMember: null as boolean | null,
    userCanManage: null as boolean | null,
    discordStatus: null as number | null,
  };
  const res = await fetchUserGuildsCached(accessToken);
  if (!res.ok && res.authFailed) {
    return {
      ok: false, code: 'AUTH_REQUIRED', status: 401,
      error: 'Discord rejected the session — sign in again',
      retryable: false, debug: { ...debugBase },
    };
  }
  if (!res.ok) {
    // 429 keeps its own code so the UI can say "rate limited — retrying"
    // instead of the generic outage message.
    if (!res.authFailed && res.status === 429) {
      return {
        ok: false, code: 'RATE_LIMITED', status: 429,
        error: 'Discord rate-limited the request — retrying automatically',
        retryable: true, retryAfterMs: res.retryAfterMs,
        debug: { ...debugBase, discordStatus: 429 },
      };
    }
    return {
      ok: false, code: 'DISCORD_API_ERROR', status: 502,
      error: 'Discord did not answer the permission check — retry in a moment',
      retryable: true,
      debug: { ...debugBase, discordStatus: res.status },
    };
  }
  const guild = res.guilds.find((g) => g.id === guildId);
  if (!guild) {
    return {
      ok: false, code: 'NOT_GUILD_MEMBER', status: 403,
      error: 'You are not a member of that server',
      retryable: false,
      debug: { ...debugBase, userMember: false, userCanManage: false },
    };
  }
  if (!hasManageBits(guild.owner, guild.permissions)) {
    return {
      ok: false, code: 'INSUFFICIENT_GUILD_PERMISSION', status: 403,
      error: 'You need Manage Server permission on that server',
      retryable: false,
      debug: { ...debugBase, userMember: true, userCanManage: false },
    };
  }
  return { ok: true, guild };
}
