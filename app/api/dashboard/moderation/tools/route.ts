import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Moderation tools bridge: overview stats, ban list, role add/remove and
// warning removal. Same model as /api/dashboard/moderation — the dashboard
// verifies guild management here, the BOT re-validates hierarchy,
// membership and permissions before touching Discord.

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: message, ...(code ? { code } : {}) }, { status });
}

/**
 * Central manage check. Dead token → 401 AUTH_REQUIRED; non-member →
 * NOT_GUILD_MEMBER; unmanaged → INSUFFICIENT_GUILD_PERMISSION; Discord
 * outage/rate-limit → 502 DISCORD_API_ERROR (retryable). Never collapses a
 * Discord fault into a fake permission failure.
 */
async function guard(token: string, guildId: string) {
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
    { status: check.status },
  );
}

async function botCall(path: string, init?: RequestInit, timeoutMs = 15000) {
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return { res: null as Response | null, data: null, secretMissing: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BOT_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { res, data, secretMissing: false };
  } catch {
    clearTimeout(timer);
    return { res: null as Response | null, data: null, secretMissing: false };
  }
}

function botError(res: Response | null, data: Record<string, unknown> | null, fallback: string) {
  if (!res) return bad('Bot unreachable — is it online?', 502, 'BOT_OFFLINE');
  const passthrough = [400, 401, 403, 404, 409];
  const status = passthrough.includes(res.status) ? res.status : 502;
  const code = res.status === 404 ? 'BOT_NOT_IN_GUILD'
    : res.status === 403 ? 'BOT_FORBIDDEN'
    : res.status === 409 ? 'BOT_CONFLICT'
    : status === 502 ? 'BOT_ERROR' : 'BOT_ERROR';
  const message = typeof data?.error === 'string' && data.error ? data.error : `${fallback} (Bot returned ${res.status})`;
  return bad(message, status, code);
}

// GET ?op=overview|bans&guildId=… — stats + live Discord counts, ban list.
export async function GET(req: NextRequest) {
  const token = await sessionToken();
  const op = req.nextUrl.searchParams.get('op') || '';
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required', 400, 'INVALID_GUILD_ID');
  const denied = await guard(token, guildId);
  if (denied) return denied;

  if (op === 'overview') {
    const { res, data, secretMissing } = await botCall(`/mod/overview/${guildId}`, undefined, 20000);
    if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
    if (!res || !data?.ok) return botError(res, data, 'Could not load overview');
    return NextResponse.json({ success: true, stats: data.stats });
  }
  if (op === 'bans') {
    const { res, data, secretMissing } = await botCall(`/mod/bans/${guildId}`);
    if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
    if (!res || !data?.ok) return botError(res, data, 'Could not load ban list');
    return NextResponse.json({ success: true, bans: data.bans || [] });
  }
  return bad('op must be overview or bans', 400, 'INVALID_OP');
}

// POST { op: 'role', ... } | { op: 'clear-warnings', guildId, userId }
export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required', 400, 'INVALID_GUILD_ID');
  const deniedPost = await guard(token, guildId);
  if (deniedPost) return deniedPost;
  if (body?.op !== 'role' && body?.op !== 'clear-warnings') return bad('op must be role or clear-warnings', 400, 'INVALID_OP');

  if (body.op === 'clear-warnings') {
    const userId = String(body?.userId || '');
    if (!/^\d{5,25}$/.test(userId)) return bad('Valid userId required', 400, 'INVALID_USER_ID');
    const { res, data, secretMissing } = await botCall(`/mod/warnings/${guildId}/${userId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
    if (!res || !data?.ok) return botError(res, data, 'Could not clear warnings');
    return NextResponse.json({ success: true, cleared: data.cleared });
  }

  const userId = String(body?.userId || '');
  const roleId = String(body?.roleId || '');
  const action = String(body?.action || '');
  if (!/^\d{5,25}$/.test(userId) || !/^\d{5,25}$/.test(roleId)) return bad('Valid userId and roleId required', 400, 'INVALID_USER_ID');
  if (!['add', 'remove'].includes(action)) return bad('action must be add or remove', 400, 'INVALID_OP');

  const { res, data, secretMissing } = await botCall(`/mod/role/${guildId}`, {
    method: 'POST',
    body: JSON.stringify({ userId, roleId, action }),
  });
  if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  if (!res || !data?.ok) return botError(res, data, 'Role change failed');
  return NextResponse.json({ success: true, caseId: data.caseId });
}

// DELETE { guildId, userId, index } — remove one warning by number.
export async function DELETE(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  const userId = String(body?.userId || '');
  const index = Number(body?.index || 0);
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(userId)) return bad('Valid guildId and userId required', 400, 'INVALID_GUILD_ID');
  if (!Number.isInteger(index) || index < 1) return bad('Valid warning number required', 400, 'INVALID_WARNING_INDEX');
  const deniedDel = await guard(token, guildId);
  if (deniedDel) return deniedDel;

  const { res, data, secretMissing } = await botCall(`/mod/warnings/${guildId}/${userId}`, {
    method: 'DELETE',
    body: JSON.stringify({ index }),
  });
  if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  if (!res || !data?.ok) return botError(res, data, 'Could not remove warning');
  return NextResponse.json({ success: true, removed: data.removed });
}
