import { cookies } from 'next/headers';
import crypto from 'crypto';
import dbConnect from '@/app/lib/mongodb';
import DiscordSession, { type IDiscordSession } from '@/app/lib/models/DiscordSession';

// ── Server-side session core ─────────────────────────────────────────────
// The browser holds ONLY an opaque HttpOnly cookie. Access/refresh tokens
// and guild context live server-side in Mongo. Every helper here runs on
// the server only — none of it is reachable from client bundles.

export const SESSION_COOKIE = 'mg_session';
export const OAUTH_STATE_COOKIE = 'mg_oauth_state';

const SESSION_TTL_DAYS = 30;

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function generateState(): string {
  return crypto.randomBytes(24).toString('hex');
}

export async function createSession(params: {
  discordId: string;
  username: string;
  globalName?: string;
  avatar: string | null;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  guilds: { id: string; name: string; icon: string | null; owner: boolean }[];
  selectedGuildId?: string | null;
}): Promise<IDiscordSession> {
  await dbConnect();
  const now = new Date();
  const doc = await DiscordSession.create({
    sessionId: crypto.randomBytes(32).toString('hex'),
    discordId: params.discordId,
    username: params.username,
    globalName: params.globalName ?? '',
    avatar: params.avatar,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    tokenExpiresAt: new Date(now.getTime() + params.expiresIn * 1000),
    guilds: params.guilds,
    selectedGuildId: params.selectedGuildId ?? null,
    lastAuthAt: now,
    lastSeenAt: now,
    revoked: false,
  });
  return doc;
}

export function guildIconUrl(guildId: string, icon: string | null): string | null {
  return icon ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.png` : null;
}

/** Discord OAuth: exchange an authorization code for tokens. Server-only. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{
  ok: true;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | { ok: false; error: string; status: number }> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'OAuth is not configured (missing DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)', status: 500 };
  }
  try {
    const resp = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      cache: 'no-store',
    });
    if (!resp.ok) {
      const text = await resp.text();
      // 400 invalid_grant covers expired/used/revoked codes.
      return { ok: false, error: `Discord token exchange failed (HTTP ${resp.status}): ${text.slice(0, 200)}`, status: resp.status };
    }
    const data = (await resp.json()) as { access_token: string; refresh_token: string; expires_in: number };
    return { ok: true, accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Token exchange network error', status: 502 };
  }
}

export interface DashUser {
  discordId: string;
  username: string;
  globalName: string;
  avatar: string | null;
  avatarUrl: string | null;
  guilds: { id: string; name: string; icon: string | null; owner: boolean; members: number | null }[];
  selectedGuildId: string | null;
  lastAuthAt: string;
  sessionExpiresAt: string;
}

/** Refresh the Discord access token using the stored refresh token. */
async function refreshSessionToken(session: IDiscordSession): Promise<boolean> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return false;
  try {
    const resp = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
      }),
      cache: 'no-store',
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { access_token: string; refresh_token: string; expires_in: number };
    session.accessToken = data.access_token;
    session.refreshToken = data.refresh_token; // Discord rotates it
    session.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    await session.save();
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate the session cookie and return the live session. Refreshes the
 * Discord token when near expiry. Returns null for missing/expired/revoked
 * sessions — the caller decides what the UI shows (never a fake state).
 */
export async function getSession(): Promise<IValidatedSession | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid || sid.length < 32) return null;

  await dbConnect();
  const session = await DiscordSession.findOne({ sessionId: sid, revoked: false });
  if (!session) return null;

  // Slide the idle window.
  session.lastSeenAt = new Date();
  await session.save().catch(() => { /* non-fatal */ });

  // Refresh token when < 2h of life remains so long dashboard sessions
  // keep working against the Discord API.
  const msLeft = session.tokenExpiresAt.getTime() - Date.now();
  if (msLeft < 2 * 60 * 60 * 1000) {
    const ok = await refreshSessionToken(session);
    if (!ok && msLeft <= 0) {
      return null; // token dead and unrefreshable → force re-auth
    }
  }

  return {
    session,
    accessToken: session.accessToken,
    discordId: session.discordId,
  };
}

export interface IValidatedSession {
  session: IDiscordSession;
  accessToken: string;
  discordId: string;
}

/**
 * Server-side permission check: does this session's Discord identity
 * actually manage the given guild RIGHT NOW? Re-verified against the
 * Discord API on every call — never trusted from the browser or from the
 * login-time snapshot.
 */
export async function sessionManagesGuild(
  accessToken: string,
  guildId: string,
): Promise<{ ok: boolean; guild?: { id: string; name: string; icon: string | null; owner: boolean }; error?: string; status?: number }> {
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);
  try {
    const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (resp.status === 401) {
      return { ok: false, error: 'Discord rejected the session token', status: 401 };
    }
    if (!resp.ok) {
      return { ok: false, error: `Discord API error ${resp.status}`, status: 502 };
    }
    const guilds = (await resp.json()) as Array<{ id: string; name: string; icon: string | null; owner: boolean; permissions: string | number; approximate_member_count?: number }>;
    const g = guilds.find((x) => x.id === guildId);
    if (!g) {
      return { ok: false, error: 'You are not a member of that server', status: 403 };
    }
    const manages = g.owner || (BigInt(g.permissions) & MANAGE_GUILD) !== BigInt(0) || (BigInt(g.permissions) & ADMINISTRATOR) !== BigInt(0);
    if (!manages) {
      return { ok: false, error: 'You need Manage Server permission there', status: 403 };
    }
    return { ok: true, guild: { id: g.id, name: g.name, icon: g.icon, owner: g.owner } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Discord API unreachable', status: 502 };
  }
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionId, cookieOptions(SESSION_TTL_DAYS * 24 * 60 * 60));
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
}

/** Sign out: revoke server-side, then clear the cookie. */
export async function revokeSession(): Promise<boolean> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) {
    await dbConnect();
    await DiscordSession.updateOne({ sessionId: sid }, { $set: { revoked: true } });
  }
  await clearSessionCookie();
  return Boolean(sid);
}
