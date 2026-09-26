import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Resolving + enqueueing can take a minute on a cold extractor.
export const maxDuration = 120;

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

async function hasManage(token: string, guildId: string): Promise<boolean> {
  const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!resp.ok) return false;
  const guilds = (await resp.json()) as Array<{ id: string; permissions: string | number; owner: boolean }>;
  const g = guilds.find((x) => x.id === guildId);
  if (!g) return false;
  return g.owner || (BigInt(g.permissions) & MANAGE_GUILD) !== BigInt(0) || (BigInt(g.permissions) & ADMINISTRATOR) !== BigInt(0);
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
  if (!(await hasManage(token, guildId))) {
    return NextResponse.json({ success: false, error: 'No permission for this server' }, { status: 403 });
  }

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
