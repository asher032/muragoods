import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';

async function getManageableGuilds(accessToken: string): Promise<Map<string, { id: string; name: string; icon: string | null; owner: boolean; permissions: string | number }>> {
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);
  const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });
  if (!resp.ok) return new Map();
  const guilds = (await resp.json()) as Array<{ id: string; name: string; icon: string | null; owner: boolean; permissions: string | number }>;
  return new Map(guilds.filter((g) => g.owner || (BigInt(g.permissions) & MANAGE_GUILD) !== BigInt(0) || (BigInt(g.permissions) & ADMINISTRATOR) !== BigInt(0)).map((g) => [g.id, g]));
}

// GET /api/dashboard/prefix?guildId=xxx — load saved prefix
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId });
  return NextResponse.json({ success: true, prefix: doc?.prefix || 'mg!' });
}

// PATCH /api/dashboard/prefix — save prefix for guild
export async function PATCH(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; prefix?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  const prefix = String(body.prefix || '').trim();
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!prefix || prefix.length > 10) return NextResponse.json({ success: false, error: 'Prefix must be 1-10 characters' }, { status: 400 });
  if (!/^[a-zA-Z0-9_!@#$%^&*()-=.]+$/.test(prefix)) return NextResponse.json({ success: false, error: 'Prefix contains invalid characters' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  await collection.updateOne({ guildId }, { $set: { prefix, updatedAt: new Date() } }, { upsert: true });
  return NextResponse.json({ success: true, prefix });
}
