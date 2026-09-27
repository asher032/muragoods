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

// GET /api/dashboard/templates?guildId=xxx — list templates
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId });
  const templates = doc?.templates || [];
  return NextResponse.json({ success: true, templates });
}

// POST /api/dashboard/templates — create template
export async function POST(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; name?: string; type?: string; title?: string; description?: string; fields?: Array<{ name: string; value: string; inline?: boolean }>; footer?: string; color?: number; thumbnail?: string; image?: string; enabled?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

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
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; templateId?: string; updates?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  const templateId = String(body.templateId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!templateId) return NextResponse.json({ success: false, error: 'templateId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const collection = await discordConfigCollection();
  const result = await collection.updateOne(
    { guildId, 'templates._id': templateId },
    { $set: { 'templates.$': { ...body.updates, updatedAt: new Date() } } },
  );

  return NextResponse.json({ success: result.modifiedCount > 0 });
}

// DELETE /api/dashboard/templates — delete template
export async function DELETE(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const templateId = req.nextUrl.searchParams.get('templateId') || '';
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!templateId) return NextResponse.json({ success: false, error: 'templateId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const collection = await discordConfigCollection();
  const result = await collection.updateOne(
    { guildId },
    { $pull: { templates: { _id: templateId } } as any },
  );

  return NextResponse.json({ success: result.modifiedCount > 0 });
}
