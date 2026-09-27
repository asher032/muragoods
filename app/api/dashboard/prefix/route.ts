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

// GET /api/dashboard/prefix?guildId=xxx — load saved prefix
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId });
  return NextResponse.json({ success: true, prefix: doc?.prefix || 'mg!' });
}

// PATCH /api/dashboard/prefix — save prefix for guild
export async function PATCH(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });

  let body: { guildId?: string; prefix?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  const guildId = String(body.guildId || '');
  const prefix = String(body.prefix || '').trim();
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!prefix || prefix.length > 10) return NextResponse.json({ success: false, error: 'Prefix must be 1-10 characters' }, { status: 400 });
  if (!/^[a-zA-Z0-9_!@#$%^&*()-=.]+$/.test(prefix)) return NextResponse.json({ success: false, error: 'Prefix contains invalid characters' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  const collection = await discordConfigCollection();
  await collection.updateOne({ guildId }, { $set: { prefix, updatedAt: new Date() } }, { upsert: true });

  // Push the value itself to the bot host: the dashboard writes the SITE
  // database, but prefix resolution reads the BOT's guild_config store, so
  // a cache-drop alone would re-read a stale (or empty) value. Best-effort
  // like the cache nudge — the site write above is durable either way.
  const botNotified = await notifyBot(guildId, prefix);

  return NextResponse.json({ success: true, prefix, botNotified });
}

async function notifyBot(guildId: string, prefix: string): Promise<boolean> {
  const secret = process.env.DISCORD_BRIDGE_SECRET;
  if (!secret) return false;
  const base = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '')
    || 'https://murastream-bot-pf11.onrender.com';
  try {
    const resp = await fetch(`${base}/prefix/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ guildId, prefix }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
