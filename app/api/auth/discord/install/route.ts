import { NextRequest, NextResponse } from 'next/server';
import { getSession, sessionManagesGuild } from '@/app/lib/discord-session';

// ── Bot installation helper ──────────────────────────────────────────────
// GET  ?guildId= → { inviteUrl, botInstalled } for the real MuraGoods app.
// The invite URL is the standard Discord bot-install link for the EXISTING
// application (same client id / credentials as the running bot) — we never
// create a second bot. botInstalled is detected live from the bot service:
// no pretending the bot is somewhere it isn't.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1549395794853888020';
// Permissions the bot actually uses (same value documented in its README).
const PERMISSIONS = '271698944';

async function botGuildIds(): Promise<Set<string> | null> {
  try {
    const base = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';
    const resp = await fetch(`${base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { ok?: boolean; guilds?: number; guild_ids?: string[] };
    if (!data.ok) return null;
    return new Set(data.guild_ids ?? []);
  } catch {
    return null; // bot service unreachable — caller reports honestly
  }
}

export async function GET(req: NextRequest) {
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  }

  const check = await sessionManagesGuild(auth.accessToken, guildId);
  if (!check.ok) {
    return NextResponse.json({ success: false, error: check.error }, { status: check.status || 403 });
  }

  const botGuilds = await botGuildIds();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    permissions: PERMISSIONS,
    scope: 'bot applications.commands',
    guild_id: guildId,
    // After install, Discord can drop the user back into our OAuth so the
    // dashboard opens with that server selected — one continuous flow.
    response_type: 'code',
    redirect_uri: process.env.DISCORD_REDIRECT_URI?.trim()
      || new URL('/api/auth/discord/callback', req.nextUrl.origin).toString(),
    state: `install:${guildId}`,
  });

  return NextResponse.json({
    success: true,
    guildId,
    inviteUrl: `https://discord.com/oauth2/authorize?${params.toString()}`,
    // null = bot service unreachable (unknown), true/false = live detection
    botInstalled: botGuilds ? botGuilds.has(guildId) : null,
  });
}
