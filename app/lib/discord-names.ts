// ── Member display names, resolved live from the guild ─────────────────
//
// Economy rows are keyed by canonical user id. A name is presentation only,
// and it is resolved from the guild on demand rather than from a stored copy,
// so a rename shows up immediately and two members who share a name stay two
// rows.
//
// The failure that motivated this file: when a name could not be resolved, the
// page substituted the site owner's name, so a leaderboard of five rows read
// "muragoods, muragoods, muragoods…". The fallback is now "Unknown User" plus
// the canonical id, which is honest and keeps the rows distinguishable.

const DISCORD_API = 'https://discord.com/api/v10';

const NAME_TTL_MS = 60_000;
const cache = new Map<string, { at: number; names: Map<string, string> }>();
const inflight = new Map<string, Promise<Map<string, string>>>();

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN?.trim() || process.env.DISCORD_TOKEN?.trim() || null;
}

/** The one name a member is shown as: nickname → display name → username. */
function nameOf(member: {
  nick?: string | null; user?: { username?: string; global_name?: string | null };
}): string {
  return member.nick || member.user?.global_name || member.user?.username || 'Unknown User';
}

/**
 * Every member name on the guild, cached for a minute and de-duplicated.
 *
 * One paginated read serves every row on the page. A Discord failure returns an
 * EMPTY map rather than a fabricated name, which the caller renders as
 * "Unknown User" — a real, distinguishable state instead of a wrong one.
 */
export async function guildMemberNames(guildId: string): Promise<Map<string, string>> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < NAME_TTL_MS) return hit.names;
  const running = inflight.get(guildId);
  if (running) return running;

  const promise = (async (): Promise<Map<string, string>> => {
    const token = botToken();
    if (!token) return new Map();
    const names = new Map<string, string>();
    try {
      let after: string | undefined;
      // Guilds cap at 1000 members per page; two pages covers every guild the
      // bot is realistically in, and the loop stops when a page comes back
      // short rather than assuming a size.
      for (let page = 0; page < 3; page++) {
        const url = new URL(`${DISCORD_API}/guilds/${guildId}/members`);
        url.searchParams.set('limit', '1000');
        if (after) url.searchParams.set('after', after);
        const res = await fetch(url, {
          headers: { Authorization: `Bot ${token}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) break;
        const members = (await res.json().catch(() => [])) as Array<{
          user?: { id?: string; username?: string; global_name?: string | null };
          nick?: string | null;
        }>;
        if (!Array.isArray(members) || members.length === 0) break;
        for (const m of members) {
          if (m?.user?.id) names.set(String(m.user.id), nameOf(m));
        }
        after = members[members.length - 1]?.user?.id;
        if (members.length < 1000) break;
      }
    } catch {
      // Leave the map empty: the caller falls back to "Unknown User".
      return new Map();
    }
    cache.set(guildId, { at: Date.now(), names });
    return names;
  })().finally(() => {
    if (inflight.get(guildId) === promise) inflight.delete(guildId);
  });

  inflight.set(guildId, promise);
  return promise;
}

/** Drop the cached names so the next read resolves them again. */
export function invalidateMemberNames(guildId: string): void {
  cache.delete(guildId);
}

/**
 * Attach a display name to rows that carry a canonical user id.
 *
 * A row whose user cannot be resolved keeps its id and is labelled "Unknown
 * User" — it is never dropped, merged or renamed to something else.
 */
export async function withDisplayNames<T extends { canonicalUserId: string; displayName?: string }>(
  guildId: string,
  rows: T[],
): Promise<Array<T & { displayName: string }>> {
  if (!rows.length) return [];
  const names = await guildMemberNames(guildId);
  return rows.map((row) => ({
    ...row,
    displayName: names.get(String(row.canonicalUserId)) ?? 'Unknown User',
  }));
}
