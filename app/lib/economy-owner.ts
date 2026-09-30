// ── Who may change economic values ──────────────────────────────────────
//
// The site has no trusted copy of "who owns Murabot". The bot does: it knows
// the application owner, the guild owner, and its own admin list. So the
// question is asked of the bot, over the same authenticated bridge every other
// economy call uses, and the answer is cached briefly.
//
// This module used to also carry a duplicated copy of the owner-only key set.
// That copy is gone: the set now lives in `@/app/lib/economy-schema`, derived
// from the field declarations, so a new setting cannot be added as
// admin-editable by forgetting to update a second list.

export const dynamic = 'force-dynamic';

const BOT_BASE =
  process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

const OWNER_TTL_MS = 30_000;
const ownerCache = new Map<string, { at: number; owner: boolean }>();

export type OwnerVerdict = true | false | 'unknown';

export function invalidateOwnerCheck(guildId: string, actorId: string): void {
  ownerCache.delete(`${guildId}|${actorId}`);
}

/**
 * Ask Murabot whether this Discord account may change economic values.
 *
 * Returns `true`/`false` on a definitive answer and `'unknown'` when the bot
 * could not be reached or the bridge secret is unset. `unknown` is
 * deliberately NOT treated as `false` at the call sites that can retry, and it
 * is never treated as `true` — an unverifiable owner check must fail closed.
 */
export async function isEconomyOwner(guildId: string, actorId: string): Promise<OwnerVerdict> {
  if (!actorId) return false;
  const key = `${guildId}|${actorId}`;
  const hit = ownerCache.get(key);
  if (hit && Date.now() - hit.at < OWNER_TTL_MS) return hit.owner;

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return 'unknown';

  try {
    const resp = await fetch(`${BOT_BASE}/economy/owner-check/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return resp.status === 403 || resp.status === 404 ? false : 'unknown';
    const data = (await resp.json().catch(() => null)) as { ok?: boolean; owner?: boolean } | null;
    if (!data || data.ok !== true || typeof data.owner !== 'boolean') return 'unknown';
    ownerCache.set(key, { at: Date.now(), owner: data.owner });
    return data.owner;
  } catch {
    return 'unknown';
  }
}
