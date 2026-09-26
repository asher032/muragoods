export const dynamic = 'force-dynamic';

// ── Bot-side Discord verification, shared ────────────────────────────────
// Every dashboard route that reports "bot installed / not installed" must go
// through verifyBotInGuild(). The rule is absolute:
//
//   HTTP 404 on GET /guilds/{id}/members/@me  →  'absent' (installed nowhere)
//   anything else non-OK (401/403/429/5xx/timeout, Cloudflare challenge,
//   missing credential)                        →  'unknown' (NEVER 'absent')
//
// A hostile network answer must never become a false "Bot not installed"
// loop with a disabled Manage button. Only a real 404 earns `false`.
// botTokenHealthy() only adds an operator hint; it never flips the verdict.

export type BotPresence = 'installed' | 'absent' | 'unknown';

export function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN?.trim()
    || process.env.DISCORD_TOKEN?.trim()
    || null;
}

interface HealthCache {
  at: number;
  healthy: boolean | null;
}
let healthCache: HealthCache | null = null;
const HEALTH_TTL_MS = 60_000;

/**
 * Is OUR OWN bot credential accepted by Discord right now? Checked against
 * GET /users/@me (identity, not any guild). Cached 60s. null = could not
 * determine (no token configured or network failure) — never a verdict,
 * only a diagnostic hint for logs and the status endpoint.
 */
export async function botTokenHealthy(): Promise<boolean | null> {
  const token = botToken();
  if (!token) return null;
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) {
    return healthCache.healthy;
  }
  let healthy: boolean | null = null;
  try {
    const resp = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    healthy = resp.ok ? true : resp.status === 401 || resp.status === 403 ? false : null;
  } catch {
    healthy = null;
  }
  healthCache = { at: Date.now(), healthy };
  return healthy;
}

/**
 * Authoritative bot-membership verdict for ONE guild, from the bot's own
 * authenticated Discord identity. Never trusts the browser, caches, the
 * gateway list, or config documents.
 */
export async function verifyBotInGuild(guildId: string): Promise<BotPresence> {  const token = botToken();
  if (!token) return 'unknown';
  try {
    const resp = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) return 'installed';
    if (resp.status === 404) return 'absent';
    // 401/403/429/5xx/timeout/Cloudflare: the credential or the network is
    // at fault, NOT proof of absence. Report unknown so the UI shows
    // "status unknown" + retry instead of a false invite loop.
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface BotMemberDoc {
  permissions?: string | number;
  roles?: string[];
  user?: { id: string; username: string; display_name?: string; avatar?: string | null };
}

/**
 * The bot's own member document in ONE guild (permissions, roles), or null
 * when Discord does not resolve it — for ANY reason (absent, rejected
 * credential, rate limit, challenged network). Callers MUST pair this with
 * verifyBotInGuild(): only a 404 there means "not installed".
 */
export async function fetchBotMember(guildId: string): Promise<BotMemberDoc | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const resp = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    return (await resp.json().catch(() => null)) as BotMemberDoc | null;
  } catch {
    return null;
  }
}
