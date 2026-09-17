import { NextRequest, NextResponse } from 'next/server';
import {
  OAUTH_STATE_COOKIE,
  cookieOptions,
  generateState,
  getSession,
  sessionManagesGuild,
} from '@/app/lib/discord-session';

// ── MuraGoods bot installation ───────────────────────────────────────────
// The website's "+ ADD MURAGOODS BOT" CTA links straight here. Two modes:
//
//   GET /api/auth/discord/install              → public: 307 to Discord's
//     authorize page with the bot scope. Discord itself shows the server
//     picker, so ONLY servers where the visitor may manage apps are offered.
//     After approval Discord returns to the OAuth callback, which signs them
//     in and lands on /dashboard — one continuous flow.
//
//   GET /api/auth/discord/install?guildId=ID   → authenticated: JSON with the
//     per-server invite URL the dashboard uses for its "bot not installed"
//     state. The guild is verified against the live Discord guild list.
//
// OAuth state is random and stored in an HttpOnly cookie the callback checks,
// so a tampered/absent state is rejected instead of silently completing.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Permissions the running bot actually uses. Includes CONNECT (0x100000) and
// SPEAK (0x200000) without which music can never play, plus the moderation,
// channel and message permissions the cogs call.
const PERMISSIONS = '271698944';

function getClientId(): string | null {
  const id = process.env.DISCORD_CLIENT_ID?.trim();
  return id ? id : null;
}

function getRedirectUri(req: NextRequest): string {
  return process.env.DISCORD_REDIRECT_URI?.trim()
    || new URL('/api/auth/discord/callback', req.nextUrl.origin).toString();
}

/** The real Discord authorize URL for this application. */
function authorizeUrl(req: NextRequest, state: string, guildId?: string | null): string {
  const params = new URLSearchParams({
    client_id: getClientId() ?? '',
    permissions: PERMISSIONS,
    // identify+guilds let the callback sign the installer in and list the
    // servers they manage; bot+applications.commands performs the install.
    scope: 'identify guilds bot applications.commands',
    response_type: 'code',
    redirect_uri: getRedirectUri(req),
    state,
  });
  // Preselecting a guild is optional; omitting it makes Discord show its own
  // server picker, which is what the public website CTA wants.
  if (guildId) params.set('guild_id', guildId);
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Stores the one-time OAuth state the callback will validate. */
function setStateCookie(res: NextResponse, state: string, guildId: string | null): NextResponse {
  res.cookies.set(OAUTH_STATE_COOKIE, JSON.stringify({
    state,
    next: '/dashboard',
    guild: guildId,
  }), { ...cookieOptions(10 * 60), httpOnly: true });
  return res;
}

/** Honest failure surface: the dashboard gate renders this message verbatim. */
function fail(req: NextRequest, message: string): NextResponse {
  const url = new URL('/dashboard', req.nextUrl.origin);
  url.searchParams.set('auth_error', message);
  return NextResponse.redirect(url);
}

/** Live bot presence per guild, from the bot service. null = unknown. */
async function botGuildIds(): Promise<Set<string> | null> {
  try {
    const base = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '')
      || 'https://murastream-bot-pf11.onrender.com';
    const resp = await fetch(`${base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { ok?: boolean; guild_ids?: string[] };
    if (!data.ok) return null;
    return new Set(data.guild_ids ?? []);
  } catch {
    return null; // bot service unreachable — reported as unknown, never faked
  }
}

export async function GET(req: NextRequest) {
  const guildId = req.nextUrl.searchParams.get('guildId') || '';

  if (!getClientId()) {
    return fail(req, 'Bot installation is not configured on the server (missing DISCORD_CLIENT_ID).');
  }

  // ── Public mode: the website CTA. Redirect into Discord's own flow. ──
  if (!guildId) {
    const state = generateState();
    const res = NextResponse.redirect(authorizeUrl(req, state));
    return setStateCookie(res, state, null);
  }

  // ── Per-guild mode: the dashboard asks for this server's install link. ──
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  }

  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Sign in with Discord to continue' }, { status: 401 });
  }

  const check = await sessionManagesGuild(auth.accessToken, guildId);
  if (!check.ok) {
    return NextResponse.json(
      { success: false, error: check.error || 'Not allowed to manage that server' },
      { status: check.status || 403 },
    );
  }

  const botGuilds = await botGuildIds();
  const state = generateState();
  const res = NextResponse.json({
    success: true,
    guildId,
    inviteUrl: authorizeUrl(req, state, guildId),
    // null = bot service unreachable (unknown), true/false = live detection
    botInstalled: botGuilds ? botGuilds.has(guildId) : null,
  });
  return setStateCookie(res, state, guildId);
}
