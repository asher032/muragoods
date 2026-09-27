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

  const denied = await guard(token, guildId);
  if (denied) return denied;

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
