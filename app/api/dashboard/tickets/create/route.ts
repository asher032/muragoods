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

// POST /api/dashboard/tickets/create — create a ticket via bot
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  const bridgeSecret = process.env.DISCORD_BRIDGE_SECRET;

  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!botToken) return NextResponse.json({ success: false, error: 'Bot token not configured' }, { status: 503 });

  let body: { guildId?: string; subject?: string; userId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  // Get ticket settings from database
  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId });
  const ticketSettings = doc?.tickets || {};
  const categoryId = ticketSettings.categoryId || '';
  const supportRoleId = ticketSettings.supportRoleId || '';

  if (!categoryId) {
    return NextResponse.json({ success: false, error: 'Ticket category is not configured for this server. Please configure it in the Tickets settings.' }, { status: 400 });
  }

  // Create ticket channel via Discord API
  const DISCORD_API = 'https://discord.com/api/v10';
  const overwrites = [
    { id: guildId, type: 0, deny: BigInt(0x400) }, // @everyone cannot view
    { id: supportRoleId, type: 0, allow: BigInt(0x400) }, // support role can view
  ];
  // Bot needs view + send
  if (process.env.BOT_USER_ID) {
    overwrites.push({ id: process.env.BOT_USER_ID, type: 0, allow: BigInt(0x400 | 0x800) }); // bot can view + send
  }
  // Creator can view + send
  if (body.userId) {
    overwrites.push({ id: body.userId, type: 0, allow: BigInt(0x400 | 0x800 | 0x10) }); // view + send + read history
  }

  try {
    const createResp = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `ticket-${body.subject || 'support'}`.slice(0, 100),
        type: 0, // text channel
        parent_id: categoryId,
        permission_overwrites: overwrites.map((o) => ({
          id: o.id,
          type: o.type,
          allow: o.allow ? o.allow.toString() : undefined,
          deny: o.deny ? o.deny.toString() : undefined,
        })),
      }),
    });

    if (!createResp.ok) {
      const errData = await createResp.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: `Failed to create ticket channel: ${createResp.status} ${errData.message || createResp.statusText}`,
      }, { status: createResp.status });
    }

    const channel = await createResp.json();

    // Save ticket to database
  await collection.updateOne({ guildId }, { $push: { tickets_list: { channelId: channel.id, subject: body.subject || 'Support', userId: body.userId || '', status: 'open', createdAt: new Date().toISOString() } } as any, $set: { updatedAt: new Date() } }, { upsert: true });

    return NextResponse.json({ success: true, channelId: channel.id, channelName: channel.name });
  } catch (err) {
    return NextResponse.json({ success: false, error: `Failed to create ticket: ${err}` }, { status: 500 });
  }
}
