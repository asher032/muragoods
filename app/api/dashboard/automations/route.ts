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

// GET /api/dashboard/automations?guildId=xxx — list automations
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const automations = await collection.find({ guildId, 'automations': { $exists: true } }).toArray();
  const doc = automations[0] || { guildId, automations: [] };
  return NextResponse.json({ success: true, automations: doc.automations || [] });
}

// POST /api/dashboard/automations — create automation
export async function POST(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; name?: string; action?: string; channelId?: string; message?: string; schedule?: Record<string, unknown>; timezone?: string; enabled?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const automation = {
    name: String(body.name || '').slice(0, 100),
    action: ['send_message', 'start_giveaway', 'send_reminder', 'reset_stats', 'announcement', 'post_content', 'maintenance'].includes(String(body.action)) ? String(body.action) : 'send_message',
    channelId: String(body.channelId || '').slice(0, 25),
    message: String(body.message || '').slice(0, 2000),
    schedule: body.schedule || {},
    timezone: String(body.timezone || 'UTC').slice(0, 50),
    enabled: Boolean(body.enabled ?? true),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRun: null as string | null,
    lastSuccess: null as string | null,
    runCount: 0,
    errorCount: 0,
  };

  const collection = await discordConfigCollection();
  const result = await collection.updateOne(
    { guildId },
    { $push: { automations: automation } as any, $set: { updatedAt: new Date() } },
    { upsert: true },
  );

  return NextResponse.json({ success: true, automation });
}

// PATCH /api/dashboard/automations — update automation
export async function PATCH(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; automationId?: string; updates?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  const automationId = String(body.automationId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!automationId) return NextResponse.json({ success: false, error: 'automationId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const result = await collection.updateOne(
    { guildId, 'automations._id': automationId },
    { $set: { 'automations.$.updatedAt': new Date(), 'automations.$': { ...body.updates, updatedAt: new Date() } } },
  );

  return NextResponse.json({ success: result.modifiedCount > 0 });
}

// DELETE /api/dashboard/automations — delete automation
export async function DELETE(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const automationId = req.nextUrl.searchParams.get('automationId') || '';
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!automationId) return NextResponse.json({ success: false, error: 'automationId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const result = await collection.updateOne(
    { guildId },
    { $pull: { automations: { _id: automationId } } as any },
  );

  return NextResponse.json({ success: result.modifiedCount > 0 });
}
