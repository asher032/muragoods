import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';
import type { UpdateFilter, Document } from 'mongodb';
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

// GET /api/dashboard/audit?guildId=xxx — list audit entries
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const collection = await discordConfigCollection();
  const entries = await collection.find({ guildId, config_audit: { $exists: true } }).toArray();
  const doc = entries[0] || { guildId };
  const audit = (doc as Record<string, unknown>).config_audit as Array<Record<string, unknown>> || [];
  return NextResponse.json({ success: true, audit: audit.reverse().slice(0, 100) });
}

// POST /api/dashboard/audit — record an audit entry
export async function POST(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; actor?: string; summary?: string; before?: unknown; after?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const entry = {
    actor: String(body.actor || 'unknown').slice(0, 100),
    summary: String(body.summary || '').slice(0, 500),
    before: body.before,
    after: body.after,
    at: new Date().toISOString(),
  };

  const collection = await discordConfigCollection();
  // Capped like the dashboard-audit.ts path (100): an uncapped $push on the
  // same guild_config doc lets one busy guild grow its document without bound.
  const auditPush: { $push: { config_audit: { $each: typeof entry[]; $slice: number } }; $set: { updatedAt: Date } } = {
    $push: { config_audit: { $each: [entry], $slice: -100 } },
    $set: { updatedAt: new Date() },
  };
  await collection.updateOne(
    { guildId },
    auditPush as unknown as UpdateFilter<Document>,
    { upsert: true },
  );

  return NextResponse.json({ success: true, entry });
}
