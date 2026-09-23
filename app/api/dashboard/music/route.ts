import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

// Music bridge: dashboard → this route → bot's REAL player state/controls.
// Auth: dashboard Discord OAuth token (guild permission re-verified against
// Discord here) + bot bridge secret (server-side only, never in the browser).

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

// GET → real player state for the guild
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  if (!(await hasManage(token, guildId))) {
    return NextResponse.json({ success: false, error: 'No permission for this server' }, { status: 403 });
  }

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Bridge not configured' }, { status: 503 });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${BOT_BASE}/music/state/${guildId}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const detail = await resp.json().catch(() => null) as { error?: string } | null;
      // Forward client/auth statuses verbatim — only genuine gateway faults
      // (network/timeout/5xx) become 502. Collapsing a 401/403/404 into 502
      // misattributes the fault to "bot offline".
      const passthrough = [400, 401, 403, 404, 409];
      return NextResponse.json(
        { success: false, error: detail?.error || `Bot returned ${resp.status}` },
        { status: passthrough.includes(resp.status) ? resp.status : 502 },
      );
    }
    const state = await resp.json();
    return NextResponse.json({ success: true, state });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Bot unreachable: ${String(err).slice(0, 120)}` },
      { status: 502 },
    );
  }
}

// POST → real control action on the bot's player
export async function POST(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  let body: { guildId?: string; action?: string; level?: number; position?: number; enabled?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const guildId = String(body.guildId || '');
  const action = String(body.action || '');
  if (!/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  const allowed = [
    'pause', 'resume', 'skip', 'stop', 'volume', 'loop', 'queueLoop',
    'shuffle', 'remove', 'disconnect', 'seek', 'autoplay',
  ];
  if (!allowed.includes(action)) return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  if (!(await hasManage(token, guildId))) {
    return NextResponse.json({ success: false, error: 'No permission for this server' }, { status: 403 });
  }

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, error: 'Bridge not configured' }, { status: 503 });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${BOT_BASE}/music/control/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        level: body.level,
        position: body.position,
        enabled: body.enabled,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!resp.ok || !data?.ok) {
      const passthrough = [400, 401, 403, 404, 409];
      return NextResponse.json(
        { success: false, error: data?.error || `Bot returned ${resp.status}` },
        { status: passthrough.includes(resp.status) ? resp.status : 502 },
      );
    }
    return NextResponse.json({ success: true, result: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Bot unreachable: ${String(err).slice(0, 120)}` },
      { status: 502 },
    );
  }
}
