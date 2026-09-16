import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

// Moderation bridge: dashboard → bot → real Discord actions.
// The BOT re-validates everything (hierarchy, permissions, target state);
// this route only verifies the dashboard user may manage this guild and
// forwards the authenticated actor label for case records.

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

async function botUsername(token: string): Promise<string> {
  try {
    const resp = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (resp.ok) {
      const me = await resp.json() as { username?: string };
      if (me.username) return me.username;
    }
  } catch { /* fallback label */ }
  return 'dashboard';
}

// GET ?guildId=&userId= → real member profile + warnings + cases
export async function GET(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const userId = req.nextUrl.searchParams.get('userId') || '';
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(userId)) {
    return NextResponse.json({ success: false, error: 'Valid guildId and userId required' }, { status: 400 });
  }
  if (!(await hasManage(token, guildId))) {
    return NextResponse.json({ success: false, error: 'No permission for this server' }, { status: 403 });
  }
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Bridge not configured' }, { status: 503 });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${BOT_BASE}/mod/member/${guildId}/${userId}`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store', signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!resp.ok || !data?.ok) {
      return NextResponse.json({ success: false, error: data?.error || `Bot returned ${resp.status}` },
        { status: resp.status === 404 ? 404 : 502 });
    }
    return NextResponse.json({ success: true, ...(data as Record<string, unknown>) });
  } catch (err) {
    return NextResponse.json({ success: false, error: `Bot unreachable: ${String(err).slice(0, 120)}` }, { status: 502 });
  }
}

// POST → real moderation action (bot re-checks hierarchy + permissions)
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-discord-token');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  let body: { guildId?: string; userId?: string; action?: string; reason?: string; minutes?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const guildId = String(body.guildId || '');
  const userId = String(body.userId || '');
  const action = String(body.action || '');
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(userId)) {
    return NextResponse.json({ success: false, error: 'Valid guildId and userId required' }, { status: 400 });
  }
  const allowed = ['warn', 'timeout', 'kick', 'ban', 'unban'];
  if (!allowed.includes(action)) {
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  }
  if (!(await hasManage(token, guildId))) {
    return NextResponse.json({ success: false, error: 'No permission for this server' }, { status: 403 });
  }
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Bridge not configured' }, { status: 503 });

  const actor = await botUsername(token);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${BOT_BASE}/mod/action/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action, userId, reason: body.reason || 'Dashboard action',
        minutes: body.minutes, actor,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json().catch(() => null) as { ok?: boolean; error?: string; caseId?: number } | null;
    if (!resp.ok || !data?.ok) {
      return NextResponse.json({ success: false, error: data?.error || `Bot returned ${resp.status}` },
        { status: resp.status });
    }
    return NextResponse.json({ success: true, caseId: data.caseId });
  } catch (err) {
    return NextResponse.json({ success: false, error: `Bot unreachable: ${String(err).slice(0, 120)}` }, { status: 502 });
  }
}
