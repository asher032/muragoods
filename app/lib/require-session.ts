import { getSession, sessionManagesGuild, type IValidatedSession } from './discord-session';

// ── API-route auth guard ─────────────────────────────────────────────────
// Replaces the old pattern of trusting a raw `x-discord-token` header from
// the browser. Routes call `requireSession(req, guildId?)` first and only
// proceed when it returns success.

/**
 * The Discord access token that belongs to the current server-side session.
 * Routes use this INSTEAD of a browser-supplied `x-discord-token` header —
 * the credential lives only in the HttpOnly session, never in the client.
 * Returns null when there is no valid session.
 */

// ── Token liveness (kills the false-permission loop) ─────────────────────
// Every dashboard route gates on "user manages this guild" by fetching the
// live guild list with this token. When the token is DEAD (expired/rotated/
// revoked and refresh failed), Discord answers 401 — and twenty copy-pasted
// helpers turned that into `false`/empty → "No permission for this server"
// on a perfectly correct server. Central fix: verify liveness here (cached
// 60s per token hash) and return null on a real 401, so every route takes
// its 401 "sign in again" branch instead of its 403 branch. Any other
// outcome (network blip, 5xx, rate limit) passes through unchanged — a
// transient Discord fault must never read as "signed out".
interface LivenessCache {
  at: number;
  alive: boolean;
}
const livenessByToken = new Map<string, LivenessCache>();
const LIVENESS_TTL_MS = 60_000;

function tokenFingerprint(token: string): string {
  // FNV-1a hash — the cache key must never be the credential itself.
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `t${(h >>> 0).toString(36)}`;
}

async function tokenAliveRemotely(token: string): Promise<boolean | null> {
  const key = tokenFingerprint(token);
  const hit = livenessByToken.get(key);
  if (hit && Date.now() - hit.at < LIVENESS_TTL_MS) return hit.alive;
  let alive: boolean | null = null;
  try {
    // Cheapest authenticated read: /users/@me. 401 = dead token, full stop.
    const resp = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 401) alive = false;
    else if (resp.ok) alive = true;
    // else: null (transient — caller keeps prior behavior)
  } catch {
    alive = null;
  }
  if (alive !== null) {
    livenessByToken.set(key, { at: Date.now(), alive });
    if (livenessByToken.size > 500) {
      const oldest = livenessByToken.keys().next().value;
      if (oldest) livenessByToken.delete(oldest);
    }
  }
  return alive;
}

export async function sessionToken(): Promise<string | null> {
  const auth = await getSession();
  if (!auth) return null;
  const alive = await tokenAliveRemotely(auth.accessToken);
  if (alive === false) return null; // dead token → every route answers 401, never 403
  return auth.accessToken;
}

export interface SessionGuardOk {
  ok: true;
  accessToken: string;
  discordId: string;
  username: string;
  session: IValidatedSession['session'];
}

export interface SessionGuardFail {
  ok: false;
  status: number;
  error: string;
}

export async function requireSession(
  guildId?: string | null,
): Promise<SessionGuardOk | SessionGuardFail> {
  const auth = await getSession();
  if (!auth) {
    return { ok: false, status: 401, error: 'Sign in with Discord to continue' };
  }
  if (guildId) {
    const manages = await sessionManagesGuild(auth.accessToken, guildId);
    if (!manages.ok) {
      return { ok: false, status: manages.status || 403, error: manages.error || 'Not allowed to manage that server' };
    }
  }
  return {
    ok: true,
    accessToken: auth.accessToken,
    discordId: auth.discordId,
    username: auth.session.username,
    session: auth.session,
  };
}
