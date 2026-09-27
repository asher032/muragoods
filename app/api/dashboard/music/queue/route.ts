import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Resolving + enqueueing can take a minute on a cold extractor.
export const maxDuration = 120;

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

// POST /api/dashboard/music/queue { guildId, url, front? } → resolve + enqueue.
// Auth: dashboard session + guild manage check; bridge secret stays server-side.
export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  const body = await req.json().catch(() => null) as { guildId?: string; url?: string; front?: boolean } | null;
  const guildId = String(body?.guildId || '');
  const url = String(body?.url || '').slice(0, 300);
  if (!/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!url.startsWith('http')) return NextResponse.json({ success: false, error: 'A result URL is required' }, { status: 400 });
  const denied = await guard(token, guildId);
  if (denied) return denied;

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Bridge not configured' }, { status: 503 });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110000);
    const resp = await fetch(`${BOT_BASE}/music/queue/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, front: Boolean(body?.front) }),
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await resp.json().catch(() => null)) as {
      ok?: boolean; queued?: boolean; started?: boolean; position?: number; title?: string; note?: string; error?: string;
    } | null;
    if (!resp.ok || !data?.ok) {
      const passthrough = [400, 404, 409, 422];
      return NextResponse.json(
        { success: false, error: data?.error || `Bot returned ${resp.status}` },
        { status: passthrough.includes(resp.status) ? resp.status : 502 },
      );
    }
    return NextResponse.json({ success: true, result: data });
  } catch {
    return NextResponse.json({ success: false, error: 'Bot unreachable — is it online?' }, { status: 502 });
  }
}
