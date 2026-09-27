import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Moderation cases — single source of truth is the BOT's case store (the
// same collection the slash commands write). These routes proxy the bot's
// /mod/cases endpoints with the bridge secret; the legacy config-doc store
// is no longer written or read here, so Discord and dashboard can never
// show disconnected histories.

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

async function guard(token: string, guildId: string) {
  // Shared cached manage check — distinct codes, never a collapsed boolean.
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
    { status: check.status },
  );
}

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: message, ...(code ? { code } : {}) }, { status });
}

function bridgeSecret(): string | null {
  return process.env.DISCORD_BRIDGE_SECRET || null;
}

// GET /api/dashboard/cases?guildId=&action=&source=&status=&search=&limit=&before=
export async function GET(req: NextRequest) {
  const token = await sessionToken();
  const sp = req.nextUrl.searchParams;
  const guildId = sp.get('guildId') || '';
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required');
  const denied = await guard(token, guildId); if (denied) return denied;
  const secret = bridgeSecret();
  if (!secret) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');

  const forward = new URLSearchParams();
  for (const k of ['action', 'source', 'status', 'search', 'limit', 'before']) {
    const v = sp.get(k);
    if (v) forward.set(k, v.slice(0, 30));
  }
  try {
    const resp = await fetch(`${BOT_BASE}/mod/cases/${guildId}?${forward.toString()}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const data = (await resp.json().catch(() => null)) as { ok?: boolean; cases?: unknown[]; error?: string } | null;
    if (!resp.ok || !data?.ok) return bad(data?.error || `Bot returned ${resp.status}`, resp.status || 502);
    return NextResponse.json({ success: true, cases: data.cases || [] });
  } catch {
    return bad('Bot unreachable — is it online?', 502, 'BOT_OFFLINE');
  }
}

// POST /api/dashboard/cases { guildId, targetId, action, reason, duration } — manual case.
export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required');
  const denied = await guard(token, guildId); if (denied) return denied;
  const secret = bridgeSecret();
  if (!secret) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  try {
    const resp = await fetch(`${BOT_BASE}/mod/cases/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetId: String(body?.targetId || ''),
        action: String(body?.action || 'note'),
        reason: String(body?.reason || ''),
        duration: String(body?.duration || ''),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await resp.json().catch(() => null)) as { ok?: boolean; caseId?: number; error?: string } | null;
    if (!resp.ok || !data?.ok) return bad(data?.error || `Bot returned ${resp.status}`, resp.status || 502);
    return NextResponse.json({ success: true, caseId: data.caseId });
  } catch {
    return bad('Bot unreachable — is it online?', 502, 'BOT_OFFLINE');
  }
}

// PATCH /api/dashboard/cases { guildId, caseId, note?, reason?, status? } — notes, edit reason, close/reopen.
export async function PATCH(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  const caseId = Number(body?.caseId || 0);
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required');
  if (!Number.isInteger(caseId) || caseId <= 0) return bad('Valid numeric caseId required');
  const denied = await guard(token, guildId); if (denied) return denied;
  const secret = bridgeSecret();
  if (!secret) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  const payload: Record<string, unknown> = {};
  if (body?.note !== undefined) payload.note = String(body.note).slice(0, 300);
  if (body?.reason !== undefined) payload.reason = String(body.reason).slice(0, 500);
  if (body?.status !== undefined) {
    if (!['active', 'closed'].includes(String(body.status))) return bad('status must be active or closed');
    payload.status = String(body.status);
  }
  try {
    const resp = await fetch(`${BOT_BASE}/mod/case/${guildId}/${caseId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await resp.json().catch(() => null)) as { ok?: boolean; case?: unknown; error?: string } | null;
    if (!resp.ok || !data?.ok) return bad(data?.error || `Bot returned ${resp.status}`, resp.status || 502);
    return NextResponse.json({ success: true, case: data.case });
  } catch {
    return bad('Bot unreachable — is it online?', 502, 'BOT_OFFLINE');
  }
}
