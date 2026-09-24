import { NextResponse } from 'next/server';
import { getSession, guildIconUrl } from '@/app/lib/discord-session';
import dbConnect from '@/app/lib/mongodb';
import DiscordSession from '@/app/lib/models/DiscordSession';

// Who is logged in? Used by the dashboard shell and website header.
// 200 with { authenticated: false } when no valid session — the client
// decides what to render; the server never fakes an authenticated state.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ authenticated: false });
  }

  await dbConnect();
  // Fresh doc so guild snapshot + selection are current.
  const session = await DiscordSession.findOne({ sessionId: auth.session.sessionId, revoked: false });
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  // Real bot status straight from the bot service (never fabricated here).
  let bot: { online: boolean; latency: number | null; guilds: number | null } = {
    online: false, latency: null, guilds: null,
  };
  try {
    const base = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';
    const resp = await fetch(`${base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = (await resp.json()) as {
        ok: boolean; guilds?: number; subsystems?: Record<string, string>;
      };
      bot.online = Boolean(data.ok && data.subsystems?.discord === 'online');
      bot.guilds = data.guilds ?? null;
    }
  } catch { /* bot unreachable → offline, honestly */ }

  // Does the bot sit in the selected guild? Verified against the bot's own
  // authenticated connection (live gateway guild set), not assumed.
  let botInSelectedGuild: boolean | null = null;
  let botGuildIds: string[] | null = null;
  if (bot.online) {
    try {
      const base = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';
      const resp = await fetch(`${base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = (await resp.json().catch(() => null)) as { guild_ids?: string[] } | null;
        if (data && Array.isArray(data.guild_ids)) {
          botGuildIds = data.guild_ids.map(String);
          botInSelectedGuild = session.selectedGuildId
            ? botGuildIds.includes(session.selectedGuildId)
            : null;
        }
      }
    } catch { botInSelectedGuild = null; }
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      discordId: session.discordId,
      username: session.username,
      globalName: session.globalName || session.username,
      avatar: session.avatar,
      avatarUrl: session.avatar,
    },
    guilds: session.guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon ?? guildIconUrl(g.id, g.icon),
      owner: g.owner,
    })),
    selectedGuildId: session.selectedGuildId,
    botInSelectedGuild,
    botGuildIds,
    bot,
    lastAuthAt: session.lastAuthAt.toISOString(),
    sessionExpiresAt: new Date(session.lastSeenAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}
