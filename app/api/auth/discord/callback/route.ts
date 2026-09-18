import { NextRequest, NextResponse } from 'next/server';
import {
  OAUTH_STATE_COOKIE,
  createSession,
  exchangeCode,
  guildIconUrl,
  sessionCookie,
} from '@/app/lib/discord-session';
import { getRedirectUri } from '../route';

// ── OAuth step 2: Discord redirects here with ?code&state ────────────────
// Verify state → exchange code server-side → fetch user + guilds → create
// Mongo session → set HttpOnly cookie → redirect to /dashboard (or ?next).
// Every failure mode redirects with a readable ?auth_error= message rather
// than silently pretending success.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

function fail(req: NextRequest, message: string) {
  const url = new URL('/dashboard', req.nextUrl.origin);
  url.searchParams.set('auth_error', message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const discordError = req.nextUrl.searchParams.get('error');

  // User denied the authorization on Discord's page.
  if (discordError) {
    return fail(req, discordError === 'access_denied'
      ? 'Authorization was cancelled on Discord.'
      : `Discord returned an error: ${discordError}`);
  }
  if (!code || !state) {
    return fail(req, 'Discord callback was missing the authorization code.');
  }

  // State validation: must match the HttpOnly cookie we set on the way out.
  const jar = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  let flow: { state: string; next: string; guild: string | null } | null = null;
  if (jar) {
    try { flow = JSON.parse(jar); } catch { /* corrupt cookie */ }
  }
  if (!flow || flow.state !== state) {
    return fail(req, 'Login state check failed — please try again (expired or missing OAuth state).');
  }

  // Exchange the authorization code for tokens (server-side only).
  const token = await exchangeCode(code, getRedirectUri(req));
  if (!token.ok) {
    return fail(req, token.error);
  }

  // Fetch the authenticated Discord user.
  const userResp = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    cache: 'no-store',
  });
  if (!userResp.ok) {
    return fail(req, `Could not load your Discord profile (HTTP ${userResp.status}).`);
  }
  const user = (await userResp.json()) as {
    id: string; username: string; global_name?: string; avatar: string | null;
  };

  // Fetch guilds and keep the ones this user may actually manage.
  const guildsResp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    cache: 'no-store',
  });
  if (!guildsResp.ok) {
    return fail(req, `Could not load your Discord servers (HTTP ${guildsResp.status}).`);
  }
  const allGuilds = (await guildsResp.json()) as Array<{
    id: string; name: string; icon: string | null; owner: boolean;
    permissions: string | number; approximate_member_count?: number;
  }>;
  const guilds = allGuilds
    .filter((g) => g.owner || (BigInt(g.permissions) & MANAGE_GUILD) !== BigInt(0) || (BigInt(g.permissions) & ADMINISTRATOR) !== BigInt(0))
    .map((g) => ({
      id: g.id,
      name: g.name,
      icon: guildIconUrl(g.id, g.icon),
      owner: g.owner,
    }));

  // Preselect: explicit ?guild= deep link, else the first manageable guild
  // where the bot is present is decided later by the dashboard's bot check —
  // here we just take the deep link or leave null (UI shows the chooser).
  const selectedGuildId = flow.guild && guilds.some((g) => g.id === flow?.guild)
    ? flow.guild
    : null;

  const session = await createSession({
    discordId: user.id,
    username: user.username,
    globalName: user.global_name ?? '',
    avatar: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : null,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresIn: token.expiresIn,
    guilds,
    selectedGuildId,
  });

  // Set the session cookie ON THIS RESPONSE. This is the redirect Discord's
  // navigation actually follows, so there is no way for the cookie to be
  // dropped between here and /dashboard — a dropped cookie is exactly what
  // produces the "connected but still shows Connect with Discord" loop.
  const target = new URL(flow.next || '/dashboard', req.nextUrl.origin);
  const res = NextResponse.redirect(target);
  const cookie = sessionCookie(session.sessionId);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  // One-time state is spent either way.
  res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
