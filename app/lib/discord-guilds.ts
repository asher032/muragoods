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
  | { ok: false; authFailed: false; status: number };

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

/** Live guild list for the OAuth identity behind accessToken. */
export async function fetchUserGuilds(accessToken: string): Promise<UserGuildsResult> {
  try {
    const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 401) return { ok: false, authFailed: true };
    if (!resp.ok) return { ok: false, authFailed: false, status: resp.status };
    const guilds = (await resp.json()) as UserGuild[];
    return { ok: true, guilds: Array.isArray(guilds) ? guilds : [] };
  } catch {
    return { ok: false, authFailed: false, status: 0 };
  }
}

/** Manageable guild ids for the OAuth identity. null = token dead/unreachable. */
export async function manageableGuildIds(accessToken: string): Promise<Set<string> | null> {
  const res = await fetchUserGuilds(accessToken);
  if (!res.ok) return null;
  return new Set(res.guilds.filter((g) => hasManageBits(g.owner, g.permissions)).map((g) => g.id));
}
