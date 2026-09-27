import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';

async function guard(token: string, guildId: string) {
  // Shared cached manage check (30s per token across ALL dashboard routes).
  // The old inline fetch ran uncached on every call and collapsed every
  // Discord failure into a false 'No permission' 403.
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
    { status: check.status },
  );
}

// POST /api/dashboard/tickets/create — create a ticket via bot
export async function POST(req: NextRequest) {
  const token = (await sessionToken());
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  const bridgeSecret = process.env.DISCORD_BRIDGE_SECRET;

  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!botToken) return NextResponse.json({ success: false, error: 'Bot token not configured' }, { status: 503 });

  let body: { guildId?: string; subject?: string; userId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

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
