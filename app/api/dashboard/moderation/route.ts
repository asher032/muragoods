import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

// Moderation bridge: dashboard → bot → real Discord actions.
// The BOT re-validates everything (hierarchy, permissions, target state);
// this route only verifies the dashboard user may manage this guild and
// forwards the authenticated actor label for case records.

async function guard(token: string, guildId: string) {
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
    { status: check.status },
  );
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
  const token = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const userId = req.nextUrl.searchParams.get('userId') || '';
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(userId)) {
    return NextResponse.json({ success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId and userId required' }, { status: 400 });
  }
  const deniedGet = await guard(token, guildId);
  if (deniedGet) return deniedGet;
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, code: 'BRIDGE_NOT_CONFIGURED', error: 'Bridge not configured' }, { status: 503 });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${BOT_BASE}/mod/member/${guildId}/${userId}`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store', signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!resp.ok || !data?.ok) {
      const passthrough = [400, 401, 403, 404, 409];
      const code = resp.status === 404 ? 'MEMBER_FETCH_FAILED' : resp.status === 403 ? 'BOT_FORBIDDEN' : 'MEMBER_FETCH_FAILED';
      return NextResponse.json({ success: false, code, error: data?.error || `Bot returned ${resp.status}` },
        { status: passthrough.includes(resp.status) ? resp.status : 502 });
    }
    return NextResponse.json({ success: true, ...(data as Record<string, unknown>) });
  } catch (err) {
    return NextResponse.json({ success: false, code: 'BOT_OFFLINE', error: `Bot unreachable: ${String(err).slice(0, 120)}` }, { status: 502 });
  }
}

// POST → real moderation action (bot re-checks hierarchy + permissions)
export async function POST(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });
  let body: { guildId?: string; userId?: string; action?: string; reason?: string; minutes?: number; duration?: string | number; deleteMessageDays?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Invalid JSON' }, { status: 400 });
  }
  const guildId = String(body.guildId || '');
  const userId = String(body.userId || '');
  const action = String(body.action || '');
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(userId)) {
    return NextResponse.json({ success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId and userId required' }, { status: 400 });
  }
  // Full punishment matrix — same actions as the /moderation slash group,
  // executed by the same bot-side service.
  const allowed = ['warn', 'timeout', 'removetimeout', 'mute', 'hardmute', 'unmute', 'kick', 'ban', 'softban', 'tempban', 'unban'];
  if (!allowed.includes(action)) {
    return NextResponse.json({ success: false, code: 'INVALID_OP', error: 'Unknown action' }, { status: 400 });
  }
  const deniedPost = await guard(token, guildId);
  if (deniedPost) return deniedPost;
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return NextResponse.json({ success: false, code: 'BRIDGE_NOT_CONFIGURED', error: 'Bridge not configured' }, { status: 503 });

  const actor = await botUsername(token);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${BOT_BASE}/mod/action/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action, userId, reason: body.reason || 'Dashboard action',
        minutes: body.minutes,
        duration: body.duration,
        deleteMessageDays: Math.max(0, Math.min(7, Number(body.deleteMessageDays) || 0)),
        actor,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json().catch(() => null) as { ok?: boolean; code?: string; error?: string; caseId?: number; warningCount?: number; dmSent?: boolean } | null;
    if (!resp.ok || !data?.ok) {
      const code = typeof data?.code === 'string' && data.code ? data.code
        : resp.status === 404 ? 'BOT_NOT_IN_GUILD' : resp.status === 403 ? 'BOT_FORBIDDEN' : resp.status === 409 ? 'BOT_CONFLICT' : 'BOT_ERROR';
      return NextResponse.json({ success: false, code, error: data?.error || `Bot returned ${resp.status}` },
        { status: resp.status });
    }
    return NextResponse.json({ success: true, caseId: data.caseId, warningCount: data.warningCount, dmSent: data.dmSent });
  } catch (err) {
    return NextResponse.json({ success: false, code: 'BOT_OFFLINE', error: `Bot unreachable: ${String(err).slice(0, 120)}` }, { status: 502 });
  }
}
