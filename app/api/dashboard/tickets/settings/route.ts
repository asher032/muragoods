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

// GET /api/dashboard/tickets/settings?guildId=xxx — load ticket settings
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId });
  const tickets = doc?.tickets || {};
  return NextResponse.json({
    success: true,
    settings: {
      categoryId: tickets.categoryId || '',
      supportRoleId: tickets.supportRoleId || '',
    },
  });
}

// PATCH /api/dashboard/tickets/settings — save ticket settings
export async function PATCH(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; categoryId?: string; supportRoleId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const collection = await discordConfigCollection();
  await collection.updateOne({ guildId }, {
    $set: {
      tickets: {
        categoryId: String(body.categoryId || '').slice(0, 25),
        supportRoleId: String(body.supportRoleId || '').slice(0, 25),
      },
      updatedAt: new Date(),
    },
  }, { upsert: true });

  return NextResponse.json({ success: true });
}
