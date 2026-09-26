import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Metadata-only search can take ~30s on a cold extractor; give it room so
// results arrive instead of a misleading `502 Bot unreachable`.
export const maxDuration = 60;

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

// POST /api/dashboard/music/search { guildId, query } → top metadata results.
// Auth: dashboard session + guild manage check; bridge secret stays server-side.
export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  const body = await req.json().catch(() => null) as { guildId?: string; query?: string } | null;
  const guildId = String(body?.guildId || '');
  const query = String(body?.query || '').slice(0, 200);
  if (!/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (query.trim().length < 2) return NextResponse.json({ success: false, error: 'Search for at least 2 characters' }, { status: 400 });
  if (!(await hasManage(token, guildId))) {
    return NextResponse.json({ success: false, error: 'No permission for this server' }, { status: 403 });
  }

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Bridge not configured' }, { status: 503 });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    const resp = await fetch(`${BOT_BASE}/music/search/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await resp.json().catch(() => null)) as { ok?: boolean; results?: unknown[]; error?: string } | null;
    if (!resp.ok || !data?.ok) {
      return NextResponse.json({ success: false, error: data?.error || `Bot returned ${resp.status}` }, { status: 502 });
    }
    return NextResponse.json({ success: true, results: data.results || [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Bot unreachable — is it online?' }, { status: 502 });
  }
}
