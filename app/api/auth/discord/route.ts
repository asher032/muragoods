import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_STATE_COOKIE, cookieOptions, generateState } from '@/app/lib/discord-session';

// ── OAuth step 1: redirect the user to Discord's authorize URL ───────────
// Authorization-code flow (NOT response_type=token). State is random, stored
// in an HttpOnly cookie, and verified by the callback before any exchange.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const DISCORD_SCOPES = 'identify guilds';

export function getRedirectUri(req: NextRequest): string {
  const configured = process.env.DISCORD_REDIRECT_URI?.trim();
  if (configured) return configured;
  // Derive from the actual request origin so preview deployments and local
  // dev work without extra config; production pins via env.
  return new URL('/api/auth/discord/callback', req.nextUrl.origin).toString();
}

export function botInviteUrl(clientId: string, guildId?: string | null): string {
  // Real MuraGoods bot install: bot + applications.commands with the
  // permissions the bot actually needs (calculated from the verified perms).
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: '271698944',
    scope: 'bot applications.commands',
  });
  if (guildId && /^\d{5,25}$/.test(guildId)) params.set('guild_id', guildId);
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { success: false, error: 'OAuth not configured: DISCORD_CLIENT_ID missing' },
      { status: 500 },
    );
  }

  const state = generateState();
  const redirectUri = getRedirectUri(req);

  // Guild deep-link support: /api/auth/discord?guild=<id> returns straight to
  // the dashboard with that server preselected after Discord finishes.
  const guildParam = req.nextUrl.searchParams.get('guild');
  const install = req.nextUrl.searchParams.get('install') === 'bot';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DISCORD_SCOPES,
    state,
    prompt: 'consent',
  });

  const next = new URL('/', req.nextUrl.origin).toString();
  const withState = {
    state,
    next: install ? '/dashboard' : (req.nextUrl.searchParams.get('next') || next),
    guild: guildParam && /^\d{5,25}$/.test(guildParam) ? guildParam : null,
  };

  const res = NextResponse.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  res.cookies.set(OAUTH_STATE_COOKIE, JSON.stringify(withState), {
    ...cookieOptions(10 * 60),
    httpOnly: true,
  });
  return res;
}
