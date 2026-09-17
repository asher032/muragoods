import { sessionToken } from '@/app/lib/require-session';
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

// POST /api/dashboard/tickets/close — close a ticket
export async function POST(req: NextRequest) {
  const token = (await sessionToken());
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;

  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!botToken) return NextResponse.json({ success: false, error: 'Bot token not configured' }, { status: 503 });

  let body: { guildId?: string; channelId?: string; ticketId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  const channelId = String(body.channelId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!channelId || !/^\d{5,25}$/.test(channelId)) return NextResponse.json({ success: false, error: 'Valid channelId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const DISCORD_API = 'https://discord.com/api/v10';

  try {
    // Update ticket status in database
    const collection = await discordConfigCollection();
    await collection.updateOne(
      { guildId, 'tickets_list.channelId': channelId },
      { $set: { 'tickets_list.$.status': 'closed', updatedAt: new Date() } },
    );

    // Send close message to channel
    await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: '🔒 This ticket has been closed.',
      }),
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: `Failed to close ticket: ${err}` }, { status: 500 });
  }
}
