import { getSession, sessionManagesGuild, type IValidatedSession } from './discord-session';

// ── API-route auth guard ─────────────────────────────────────────────────
// Replaces the old pattern of trusting a raw `x-discord-token` header from
// the browser. Routes call `requireSession(req, guildId?)` first and only
// proceed when it returns success.

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
