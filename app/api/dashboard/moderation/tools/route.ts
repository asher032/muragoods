import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Moderation tools bridge: overview stats, ban list, role add/remove and
// warning removal. Same model as /api/dashboard/moderation — the dashboard
// verifies guild management here, the BOT re-validates hierarchy,
// membership and permissions before touching Discord.

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

function bad(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
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
  if (!res) return bad('Bot unreachable — is it online?', 502);
  const passthrough = [400, 401, 403, 404, 409];
  const status = passthrough.includes(res.status) ? res.status : 502;
  const message = typeof data?.error === 'string' && data.error ? data.error : `${fallback} (Bot returned ${res.status})`;
  return bad(message, status);
}

// GET ?op=overview|bans&guildId=… — stats + live Discord counts, ban list.
export async function GET(req: NextRequest) {
  const token = await sessionToken();
  const op = req.nextUrl.searchParams.get('op') || '';
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) return bad('Discord token required', 401);
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required');
  if (!(await hasManage(token, guildId))) return bad('No permission for this server', 403);

  if (op === 'overview') {
    const { res, data, secretMissing } = await botCall(`/mod/overview/${guildId}`, undefined, 20000);
    if (secretMissing) return bad('Bridge not configured', 503);
    if (!res || !data?.ok) return botError(res, data, 'Could not load overview');
    return NextResponse.json({ success: true, stats: data.stats });
  }
  if (op === 'bans') {
    const { res, data, secretMissing } = await botCall(`/mod/bans/${guildId}`);
    if (secretMissing) return bad('Bridge not configured', 503);
    if (!res || !data?.ok) return botError(res, data, 'Could not load ban list');
    return NextResponse.json({ success: true, bans: data.bans || [] });
  }
  return bad('op must be overview or bans');
}

// POST { op: 'role', ... } | { op: 'clear-warnings', guildId, userId }
export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required');
  if (!(await hasManage(token, guildId))) return bad('No permission for this server', 403);
  if (body?.op !== 'role' && body?.op !== 'clear-warnings') return bad('op must be role or clear-warnings');

  if (body.op === 'clear-warnings') {
    const userId = String(body?.userId || '');
    if (!/^\d{5,25}$/.test(userId)) return bad('Valid userId required');
    const { res, data, secretMissing } = await botCall(`/mod/warnings/${guildId}/${userId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (secretMissing) return bad('Bridge not configured', 503);
    if (!res || !data?.ok) return botError(res, data, 'Could not clear warnings');
    return NextResponse.json({ success: true, cleared: data.cleared });
  }

  const userId = String(body?.userId || '');
  const roleId = String(body?.roleId || '');
  const action = String(body?.action || '');
  if (!/^\d{5,25}$/.test(userId) || !/^\d{5,25}$/.test(roleId)) return bad('Valid userId and roleId required');
  if (!['add', 'remove'].includes(action)) return bad('action must be add or remove');

  const { res, data, secretMissing } = await botCall(`/mod/role/${guildId}`, {
    method: 'POST',
    body: JSON.stringify({ userId, roleId, action }),
  });
  if (secretMissing) return bad('Bridge not configured', 503);
  if (!res || !data?.ok) return botError(res, data, 'Role change failed');
  return NextResponse.json({ success: true, caseId: data.caseId });
}

// DELETE { guildId, userId, index } — remove one warning by number.
export async function DELETE(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  const userId = String(body?.userId || '');
  const index = Number(body?.index || 0);
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(userId)) return bad('Valid guildId and userId required');
  if (!Number.isInteger(index) || index < 1) return bad('Valid warning number required');
  if (!(await hasManage(token, guildId))) return bad('No permission for this server', 403);

  const { res, data, secretMissing } = await botCall(`/mod/warnings/${guildId}/${userId}`, {
    method: 'DELETE',
    body: JSON.stringify({ index }),
  });
  if (secretMissing) return bad('Bridge not configured', 503);
  if (!res || !data?.ok) return botError(res, data, 'Could not remove warning');
  return NextResponse.json({ success: true, removed: data.removed });
}
