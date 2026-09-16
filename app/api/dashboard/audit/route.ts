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

// GET /api/dashboard/audit?guildId=xxx — list audit entries
export async function GET(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const entries = await collection.find({ guildId, config_audit: { $exists: true } }).toArray();
  const doc = entries[0] || { guildId };
  const audit = (doc as Record<string, unknown>).config_audit as Array<Record<string, unknown>> || [];
  return NextResponse.json({ success: true, audit: audit.reverse().slice(0, 100) });
}

// POST /api/dashboard/audit — record an audit entry
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; actor?: string; summary?: string; before?: unknown; after?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const entry = {
    actor: String(body.actor || 'unknown').slice(0, 100),
    summary: String(body.summary || '').slice(0, 500),
    before: body.before,
    after: body.after,
    at: new Date().toISOString(),
  };

  const collection = await discordConfigCollection();
  await collection.updateOne(
    { guildId },
    { $push: { config_audit: entry } as any, $set: { updatedAt: new Date() } },
    { upsert: true },
  );

  return NextResponse.json({ success: true, entry });
}
