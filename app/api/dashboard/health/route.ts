import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';

async function getManageableGuilds(accessToken: string): Promise<Map<string, { id: string }>> {
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);
  const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });
  if (!resp.ok) return new Map();
  const guilds = (await resp.json()) as Array<{ id: string; permissions: string | number; owner: boolean }>;
  return new Map(guilds.filter((g) => g.owner || (BigInt(g.permissions) & MANAGE_GUILD) !== BigInt(0) || (BigInt(g.permissions) & ADMINISTRATOR) !== BigInt(0)).map((g) => [g.id, { id: g.id }]));
}

// GET /api/dashboard/health — service health check
export async function GET(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ ok: false, error: 'Discord token required' }, { status: 401 });

  let botStatus = 'unknown';
  let botUptime = null;
  let botGuilds = 0;
  let botError = null;

  if (guildId && /^\d{5,25}$/.test(guildId)) {
    const manageable = await getManageableGuilds(token);
    if (!manageable.has(guildId)) return NextResponse.json({ ok: false, error: 'You do not have permission to manage this server' }, { status: 403 });

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
