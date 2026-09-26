import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Egress preflight runs up to three sequential extractions plus the engine
// resolve; allow a long window so a slow path reports TIMEOUT honestly
// instead of surfacing as a misleading `502 Bot unreachable`.
export const maxDuration = 300;

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

// GET /api/dashboard/music/preflight?guildId=…[&q=…] → bot's egress preflight.
// Auth: dashboard session + guild manage check; bot bridge secret stays server-side.
export async function GET(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!(await hasManage(token, guildId))) {
    return NextResponse.json({ success: false, error: 'No permission for this server' }, { status: 403 });
  }

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Bridge not configured' }, { status: 503 });

  const q = (req.nextUrl.searchParams.get('q') || '').slice(0, 200);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 280000);
    const resp = await fetch(`${BOT_BASE}/music/preflight${q ? `?q=${encodeURIComponent(q)}` : ''}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await resp.json().catch(() => null)) as {
      ok?: boolean;
      paths?: Record<string, { state?: string; note?: string }>;
      error?: string;
    } | null;
    if (!data) {
      return NextResponse.json({ success: false, error: `Bot returned ${resp.status}` }, { status: 502 });
    }
    return NextResponse.json({ success: true, result: data }, { status: data.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Bot unreachable: ${String(err).slice(0, 120)}` },
      { status: 502 },
    );
  }
}
