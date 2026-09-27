import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';

async function guard(token: string, guildId: string) {
  // Shared cached manage check — distinct codes instead of a collapsed Map
  // lookup that turned every Discord outage into a false 403.
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { ok: false, code: check.code, error: check.error, retryable: check.retryable },
    { status: check.status },
  );
}

// GET /api/dashboard/health — service health check
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ ok: false, error: 'Discord token required' }, { status: 401 });

  let botStatus = 'unknown';
  let botUptime = null;
  let botGuilds = 0;
  let botError = null;

  if (guildId && /^\d{5,25}$/.test(guildId)) {
    const denied = await guard(token, guildId);
    if (denied) return denied;

    try {
      const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
      if (botToken) {
        const [healthResp, botGuildsResp] = await Promise.all([
          fetch('https://murastream-bot-pf11.onrender.com/health', { next: { revalidate: 10 } }),
          fetch(`https://discord.com/api/v10/users/@me/guilds`, {
            headers: { Authorization: `Bot ${botToken}` },
          }).then((r) => (r.ok ? r.json() : [])),
        ]);
        if (healthResp.ok) {
          const health = await healthResp.json();
          botStatus = health.ok ? 'online' : 'degraded';
          botGuilds = health.guilds || 0;
        } else {
          botStatus = 'offline';
          botError = `Health check returned ${healthResp.status}`;
        }
        botUptime = 'via Render';
      } else {
        botStatus = 'offline';
        botError = 'Bot token not configured in dashboard environment';
      }
    } catch (err) {
      botStatus = 'offline';
      botError = String(err);
    }
  }

  return NextResponse.json({
    status: 'ok',
    service: 'muragoods-bot',
    timestamp: new Date().toISOString(),
    uptime: botUptime,
    bot: {
      status: botStatus,
      guilds: botGuilds,
      error: botError,
    },
  });
}
