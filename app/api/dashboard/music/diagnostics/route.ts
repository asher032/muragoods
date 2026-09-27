import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

async function guard(token: string, guildId: string) {
  // Shared cached manage check (30s per token across ALL dashboard routes).
  // The old inline fetch ran uncached on every call: a page load fired a
  // burst of identical calls that ate Discord's rate limit and collapsed
  // into false 'No permission for this server' 403s.
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
    { status: check.status },
  );
}

// GET /api/dashboard/music/diagnostics?guildId=… → bot's ⚙️ Music Diagnostics aggregate.
// Auth: dashboard session + guild manage check; bot bridge secret stays server-side.
export async function GET(req: NextRequest) {
  const token = await sessionToken();
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });
  if (!/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  const denied = await guard(token, guildId);
  if (denied) return denied;

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Bridge not configured' }, { status: 503 });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${BOT_BASE}/music/diagnostics`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data) {
      return NextResponse.json(
        { success: false, error: (data as { error?: string } | null)?.error || `Bot returned ${resp.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, diagnostics: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Bot unreachable: ${String(err).slice(0, 120)}` },
      { status: 502 },
    );
  }
}
