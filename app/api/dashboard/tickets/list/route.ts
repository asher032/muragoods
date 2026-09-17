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

// GET /api/dashboard/tickets/list?guildId=xxx — list tickets
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const tickets = await collection.find({ guildId, 'tickets.channelId': { $exists: true } }).toArray();
  return NextResponse.json({ success: true, tickets: tickets || [] });
}
