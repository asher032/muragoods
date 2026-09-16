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

// GET /api/dashboard/templates?guildId=xxx — list templates
export async function GET(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId });
  const templates = doc?.templates || [];
  return NextResponse.json({ success: true, templates });
}

// POST /api/dashboard/templates — create template
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; name?: string; type?: string; title?: string; description?: string; fields?: Array<{ name: string; value: string; inline?: boolean }>; footer?: string; color?: number; thumbnail?: string; image?: string; enabled?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const template = {
    _id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    guildId,
    name: String(body.name || '').slice(0, 100),
    type: ['welcome', 'goodbye', 'announcement', 'moderation', 'ticket', 'giveaway', 'suggestion', 'level_up', 'reminder', 'custom'].includes(String(body.type)) ? String(body.type) : 'custom',
    title: String(body.title || '').slice(0, 256),
    description: String(body.description || '').slice(0, 4000),
    fields: Array.isArray(body.fields) ? body.fields.slice(0, 25).map((f) => ({
      name: String(f.name || '').slice(0, 256),
      value: String(f.value || '').slice(0, 1024),
      inline: Boolean(f.inline),
    })) : [],
    footer: String(body.footer || '').slice(0, 512),
    color: Number(body.color) || 0,
    thumbnail: String(body.thumbnail || '').slice(0, 512),
    image: String(body.image || '').slice(0, 512),
    enabled: Boolean(body.enabled ?? true),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const collection = await discordConfigCollection();
  await collection.updateOne({ guildId }, { $push: { templates: template } as any, $set: { updatedAt: new Date() } }, { upsert: true });

  return NextResponse.json({ success: true, template });
}

// PATCH /api/dashboard/templates — update template
export async function PATCH(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; templateId?: string; updates?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  const templateId = String(body.templateId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!templateId) return NextResponse.json({ success: false, error: 'templateId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const result = await collection.updateOne(
    { guildId, 'templates._id': templateId },
    { $set: { 'templates.$': { ...body.updates, updatedAt: new Date() } } },
  );

  return NextResponse.json({ success: result.modifiedCount > 0 });
}

// DELETE /api/dashboard/templates — delete template
export async function DELETE(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const templateId = req.nextUrl.searchParams.get('templateId') || '';
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!templateId) return NextResponse.json({ success: false, error: 'templateId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  const collection = await discordConfigCollection();
  const result = await collection.updateOne(
    { guildId },
    { $pull: { templates: { _id: templateId } } as any },
  );

  return NextResponse.json({ success: result.modifiedCount > 0 });
}
