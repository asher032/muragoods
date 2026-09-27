import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// The bot-side staged test can take up to ~60s (real yt-dlp resolve).
// Without this the platform default (10-15s) cuts the run and every test
// surfaces as a misleading `502 Bot unreachable`.
export const maxDuration = 90;

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

// POST /api/dashboard/music/test-audio { guildId } → bot's [ ▶ Test Audio ] stages.
// Auth: dashboard session + guild manage check; bot bridge secret stays server-side.
export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });
  let body: { guildId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const guildId = String(body.guildId || '');
  if (!/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  const denied = await guard(token, guildId);
  if (denied) return denied;

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Bridge not configured' }, { status: 503 });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    const resp = await fetch(`${BOT_BASE}/music/test-audio`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await resp.json().catch(() => null)) as {
      ok?: boolean;
      stages?: Record<string, string>;
      detail?: Record<string, unknown>;
      error?: string;
    } | null;
    if (!data) {
      return NextResponse.json({ success: false, error: `Bot returned ${resp.status}` }, { status: 502 });
    }
    return NextResponse.json({ success: true, result: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Bot unreachable: ${String(err).slice(0, 120)}` },
      { status: 502 },
    );
  }
}
