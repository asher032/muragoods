import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/dashboard/messages — send a Discord message
export async function POST(req: NextRequest) {
  const token = (await sessionToken());
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!botToken) return NextResponse.json({ success: false, error: 'Bot token not configured' }, { status: 503 });

  let body: { guildId?: string; channelId?: string; content?: string; embeds?: Array<Record<string, unknown>>; target?: { type: string; id: string } };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  const channelId = String(body.channelId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!channelId || !/^\d{5,25}$/.test(channelId)) return NextResponse.json({ success: false, error: 'Valid channelId required' }, { status: 400 });

  // Authorize: verify caller can manage this guild
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);
  const userGuilds = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => (r.ok ? r.json() : []));
  const guild = userGuilds.find((g: { id: string; owner: boolean; permissions: string | number }) => g.id === guildId);
  if (!guild || !(guild.owner || (BigInt(guild.permissions) & MANAGE_GUILD) !== BigInt(0) || (BigInt(guild.permissions) & ADMINISTRATOR) !== BigInt(0))) {
    return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });
  }

  const payload: Record<string, unknown> = {};
  if (body.content) payload.content = String(body.content).slice(0, 2000);
  if (body.embeds && Array.isArray(body.embeds)) {
    payload.embeds = body.embeds.map((e: Record<string, unknown>) => ({
      title: e.title ? String(e.title).slice(0, 256) : undefined,
      description: e.description ? String(e.description).slice(0, 4096) : undefined,
      color: Number(e.color) || 0,
      footer: e.footer ? { text: String(e.footer).slice(0, 2048) } : undefined,
      timestamp: e.timestamp ? new Date(String(e.timestamp)) : undefined,
      thumbnail: e.thumbnail ? { url: String(e.thumbnail).slice(0,512) } : undefined,
      image: e.image ? { url: String(e.image).slice(0,512) } : undefined,
      fields: Array.isArray(e.fields) ? e.fields.slice(0, 25).map((f: Record<string, unknown>) => ({
        name: String(f.name || '').slice(0, 256),
        value: String(f.value || '').slice(0, 1024),
        inline: Boolean(f.inline),
      })) : undefined,
    }));
  }

  try {
    const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return NextResponse.json({ success: false, error: `Discord API: ${resp.status} ${err.message || resp.statusText}` }, { status: resp.status });
    }

    const message = await resp.json();
    return NextResponse.json({ success: true, channelId, messageId: message.id });
  } catch (err) {
    return NextResponse.json({ success: false, error: `Failed to send message: ${err}` }, { status: 500 });
  }
}
