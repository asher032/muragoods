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

// GET /api/dashboard/cases?guildId=xxx — list moderation cases
export async function GET(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId });
  const cases = (doc as Record<string, unknown>).cases as Array<Record<string, unknown>> || [];
  return NextResponse.json({ success: true, cases: cases.reverse().slice(0, 200) });
}

// POST /api/dashboard/cases — create a moderation case
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; targetId?: string; targetName?: string; moderatorId?: string; moderatorName?: string; action?: string; reason?: string; duration?: number; evidence?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const caseEntry = {
    _id: `case-${Date.now()}`,
    guildId,
    targetId: String(body.targetId || '').slice(0, 25),
    targetName: String(body.targetName || '').slice(0, 100),
    moderatorId: String(body.moderatorId || '').slice(0, 25),
    moderatorName: String(body.moderatorName || '').slice(0, 100),
    action: String(body.action || 'warn').slice(0, 50),
    reason: String(body.reason || '').slice(0, 1000),
    duration: Number(body.duration) || 0,
    evidence: String(body.evidence || '').slice(0, 2000),
    status: 'active' as const,
    createdAt: new Date().toISOString(),
  };

  const collection = await discordConfigCollection();
  await collection.updateOne({ guildId }, { $push: { cases: caseEntry } as any, $set: { updatedAt: new Date() } }, { upsert: true });

  return NextResponse.json({ success: true, case: caseEntry });
}

// PATCH /api/dashboard/cases — update a case
export async function PATCH(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; caseId?: string; updates?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  const caseId = String(body.caseId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!caseId) return NextResponse.json({ success: false, error: 'caseId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const result = await collection.updateOne(
    { guildId, 'cases._id': caseId },
    { $set: { 'cases.$': { ...body.updates, updatedAt: new Date() } } },
  );

  return NextResponse.json({ success: result.modifiedCount > 0 });
}
