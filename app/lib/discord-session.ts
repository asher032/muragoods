import { cookies } from 'next/headers';
import crypto from 'crypto';
import type { HydratedDocument } from 'mongoose';
import dbConnect from '@/app/lib/mongodb';
import DiscordSession, { type IDiscordSession } from '@/app/lib/models/DiscordSession';

/** A live Mongo document (has .save()), not just the plain interface. */
type SessionDoc = HydratedDocument<IDiscordSession>;

// ── Server-side session core ─────────────────────────────────────────────
// The browser holds ONLY an opaque HttpOnly cookie. Access/refresh tokens
// and guild context live server-side in Mongo. Every helper here runs on
// the server only — none of it is reachable from client bundles.

export const SESSION_COOKIE = 'mg_session';
export const OAUTH_STATE_COOKIE = 'mg_oauth_state';

const SESSION_TTL_DAYS = 30;

/** Sliding session lifetime, also used by the OAuth callback's response. */
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

/**
 * The session cookie as a plain descriptor. The OAuth callback must set this
 * DIRECTLY on the redirect response it runs — writing it through the
 * `cookies()` jar and then returning a separately-constructed NextResponse is
 * the kind of ambiguity that silently produces a logged-out redirect loop.
 */
export function sessionCookie(sessionId: string): {
  name: string;
  value: string;
  options: ReturnType<typeof cookieOptions>;
} {
  return {
    name: SESSION_COOKIE,
    value: sessionId,
    options: cookieOptions(SESSION_TTL_SECONDS),
  };
}

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
}): Promise<SessionDoc> {
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

// ── OAuth client configuration ──────────────────────────────────────────
//
// The single place Discord OAuth credentials are read. Every caller goes
// through here, so there is no longer one route that trims and another that
// does not.
//
// `.trim()` is not cosmetic. These values are copied out of the Discord
// Developer Portal and pasted into Vercel/Render, and a stray newline or
// space survives the paste. Discord then rejects the token exchange with
// HTTP 401 `invalid_client`, which looks exactly like "the client id and
// secret are from different applications" — so the operator goes hunting in
// the portal when the value was dirty all along.

export function discordClientId(): string {
  return process.env.DISCORD_CLIENT_ID?.trim() ?? '';
}

export function discordClientSecret(): string {
  return process.env.DISCORD_CLIENT_SECRET?.trim() ?? '';
}

/**
 * Structured internal code for a rejected client id / client secret pair.
 *
 * Carried on the error object and in the redirect query so the failure is
 * machine-readable in logs and in the URL, instead of only being prose that
 * has to be string-matched. See `DISCORD_OAUTH_CONFIG_ERROR` for the copy.
 */
export const DISCORD_OAUTH_INVALID_CLIENT = 'DISCORD_OAUTH_INVALID_CLIENT';

/**
 * Operator-facing detail, logged server-side.
 *
 * Deliberately names the cause instead of forwarding Discord's terse body,
 * because `invalid_client` otherwise reads like a login failure and sends
 * people to re-authorize a session that was never the problem. The id and
 * secret must belong to the SAME Discord application.
 */
export const DISCORD_OAUTH_CONFIG_ERROR =
  'Discord OAuth client credentials are invalid. Verify DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET '
  + 'belong to the same Discord application, then redeploy.';

/**
 * What the visitor is shown.
 *
 * `invalid_client` is a server-side deployment fault — a stale/rotated secret,
 * or an id and secret from two different Discord applications. Nothing about
 * the person's Discord account is implicated, so this copy must never imply
 * that their account or login was rejected.
 */
export const DISCORD_OAUTH_INVALID_CLIENT_MESSAGE =
  'Discord connection is temporarily unavailable. Please try again later.';

/**
 * Diagnostic line for a failed token exchange.
 *
 * Emits only the allowed fields: provider, whether each credential is
 * present, whether the redirect URI is configured and matches, the exchange
 * status, and Discord's error code. The secret, the authorization code and
 * the access token are never included — only the boolean presence flags.
 *
 * Discord exposes no endpoint for reading an app's registered redirect URIs,
 * so `redirect_uri_match` can only be INFERRED: Discord rejects a mismatch as
 * `invalid_grant`, never `invalid_client`. Anything we did not reach Discord
 * for is reported as 'unknown' rather than guessed.
 */
function logTokenExchangeDiagnostics(detail: {
  client_id_present: boolean;
  client_secret_present: boolean;
  redirect_uri_configured: boolean;
  redirect_uri_match: boolean | 'unknown';
  token_exchange_status: number | 'network_error';
  discord_error: string | null;
}) {
  const fields = {
    oauth_provider: 'discord',
    client_id_present: detail.client_id_present,
    client_secret_present: detail.client_secret_present,
    redirect_uri_configured: detail.redirect_uri_configured,
    redirect_uri_match: detail.redirect_uri_match,
    token_exchange_status: detail.token_exchange_status,
    discord_error: detail.discord_error,
  };
  console.error('[discord-oauth] token exchange failed', JSON.stringify(fields));
}

/** Discord OAuth: exchange an authorization code for tokens. Server-only. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{
  ok: true;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | { ok: false; error: string; status: number; code?: string }> {
  const clientId = discordClientId();
  const clientSecret = discordClientSecret();
  const redirectUriConfigured = Boolean(process.env.DISCORD_REDIRECT_URI?.trim());
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
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const text = await resp.text();
      // Discord answers an unknown id/secret pair with a body containing no
      // useful detail; extract just the error code for logging.
      const discordError = (() => {
        try {
          const parsed = JSON.parse(text) as { error?: unknown };
          return typeof parsed.error === 'string' ? parsed.error : null;
        } catch {
          return /invalid_client/.test(text) ? 'invalid_client' : null;
        }
      })();

      // `invalid_client` is a deployment misconfiguration, not a bad user
      // session: Discord is rejecting our client_id/client_secret pair.
      // Reporting that as a raw token-exchange failure is what made this read
      // as "login is broken" and sent the operator looking at the wrong layer.
      if (resp.status === 401 || discordError === 'invalid_client') {
        logTokenExchangeDiagnostics({
          client_id_present: true,
          client_secret_present: true,
          redirect_uri_configured: redirectUriConfigured,
          // Discord rejects a redirect mismatch with invalid_grant, not
          // invalid_client, so reaching here means the URI was accepted.
          redirect_uri_match: discordError !== 'invalid_grant',
          token_exchange_status: resp.status,
          discord_error: discordError ?? 'invalid_client',
        });
        return {
          ok: false,
          error: DISCORD_OAUTH_CONFIG_ERROR,
          status: 500,
          code: DISCORD_OAUTH_INVALID_CLIENT,
        };
      }
      logTokenExchangeDiagnostics({
        client_id_present: true,
        client_secret_present: true,
        redirect_uri_configured: redirectUriConfigured,
        redirect_uri_match: discordError !== 'invalid_grant',
        token_exchange_status: resp.status,
        discord_error: discordError,
      });
      // 400 invalid_grant covers expired/used/revoked codes.
      return { ok: false, error: `Discord token exchange failed (HTTP ${resp.status}): ${text.slice(0, 200)}`, status: resp.status };
    }
    const data = (await resp.json()) as { access_token: string; refresh_token: string; expires_in: number };
    return { ok: true, accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  } catch (err) {
    logTokenExchangeDiagnostics({
      client_id_present: true,
      client_secret_present: true,
      redirect_uri_configured: redirectUriConfigured,
      // Discord was never reached, so the redirect URI was never checked.
      redirect_uri_match: 'unknown',
      token_exchange_status: 'network_error',
      discord_error: null,
    });
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
async function refreshSessionToken(session: SessionDoc): Promise<boolean> {
  const clientId = discordClientId();
  const clientSecret = discordClientSecret();
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
      signal: AbortSignal.timeout(10000),
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
  session: SessionDoc;
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
): Promise<{ ok: boolean; guild?: { id: string; name: string; icon: string | null; owner: boolean }; error?: string; status?: number; retryAfterMs?: number }> {
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);
  try {
    const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 401) {
      return { ok: false, error: 'Discord rejected the session token', status: 401 };
    }
    if (!resp.ok) {
      if (resp.status === 429) {
        // Rate limited: say so, and tell the caller when to come back instead
        // of returning a generic 502 that invites an immediate retry.
        const retryAfter = Number(resp.headers.get('retry-after') ?? '1');
        return {
          ok: false, error: 'Discord is rate limiting dashboard requests',
          status: 429, retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000,
        };
      }
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
  const { name, value, options } = sessionCookie(sessionId);
  const jar = await cookies();
  jar.set(name, value, options);
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
