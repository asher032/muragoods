import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

// Staff notebook API — the SAME store the /notes slash commands use.
//   GET    ?guildId=&userId=          → notes for one user
//   POST   { guildId, userId, text }  → add a note
//   DELETE { guildId, noteId }        → remove one note (guild-owned)
//   DELETE { guildId, userId, all }   → clear a user's notes (confirmed)
//
// Dashboard invokers need Manage Server (requireGuildManage); the bot needs
// no Discord permission for DB-only notes. Note IDs are per-guild and the
// delete query always includes the guild — cross-guild access is impossible.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: message, ...(code ? { code } : {}) }, { status });
}

function bridgeSecret(): string | null {
  return process.env.DISCORD_BRIDGE_SECRET || null;
}

async function guard(token: string, guildId: string) {
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
    { status: check.status },
  );
}

async function bridge(path: string, init?: RequestInit, timeoutMs = 15000) {
  const secret = bridgeSecret();
  if (!secret) return { res: null as Response | null, data: null, secretMissing: true as boolean };
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
    return { res, data, secretMissing: false as boolean };
  } catch {
    clearTimeout(timer);
    return { res: null as Response | null, data: null, secretMissing: false as boolean };
  }
}

function bridgeError(res: Response | null, data: Record<string, unknown> | null, fallback: string) {
  if (!res) return bad('Bot unreachable — is it online?', 502, 'BOT_OFFLINE');
  const passthrough = [400, 401, 403, 404, 409];
  const status = passthrough.includes(res.status) ? res.status : 502;
  const code = typeof data?.code === 'string' && data.code ? data.code
    : res.status === 404 ? 'TARGET_NOT_FOUND' : 'DATABASE_ERROR';
  const message = typeof data?.error === 'string' && data.error ? data.error : `${fallback} (Bot returned ${res.status})`;
  return bad(message, status, code);
}

export async function GET(req: NextRequest) {
  const token = await sessionToken();
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const userId = req.nextUrl.searchParams.get('userId') || '';
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(userId)) {
    return bad('Valid guildId and userId required', 400, 'INVALID_GUILD_ID');
  }
  const denied = await guard(token, guildId);
  if (denied) return denied;

  const { res, data, secretMissing } = await bridge(`/mod/notes/${guildId}/${userId}`);
  if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  if (!res || !data?.ok) return bridgeError(res, data, 'Could not load notes');
  return NextResponse.json({ success: true, notes: (data.notes as unknown[]) || [] });
}

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  const userId = String(body?.userId || '');
  const text = String(body?.text || body?.note || '').slice(0, 1000);
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(userId)) {
    return bad('Valid guildId and userId required', 400, 'INVALID_GUILD_ID');
  }
  if (!text.trim()) return bad('Note text is required', 400, 'INVALID_INPUT');
  const denied = await guard(token, guildId);
  if (denied) return denied;

  const { res, data, secretMissing } = await bridge(`/mod/notes/${guildId}`, {
    method: 'POST', body: JSON.stringify({ userId, text }),
  });
  if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  if (!res || !data?.ok) return bridgeError(res, data, 'Could not save note');
  return NextResponse.json({ success: true, noteId: data.noteId });
}

export async function DELETE(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required', 400, 'INVALID_GUILD_ID');
  const denied = await guard(token, guildId);
  if (denied) return denied;

  const noteId = body?.noteId !== undefined ? String(body.noteId) : '';
  if (/^\d{1,12}$/.test(noteId)) {
    const { res, data, secretMissing } = await bridge(`/mod/note/${guildId}/${noteId}`, { method: 'DELETE' });
    if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
    if (!res || !data?.ok) return bridgeError(res, data, 'Could not remove note');
    return NextResponse.json({ success: true, removed: data.removed });
  }
  const userId = String(body?.userId || '');
  if (/^\d{5,25}$/.test(userId) && body?.all === true) {
    const { res, data, secretMissing } = await bridge(`/mod/notes-clear/${guildId}`, {
      method: 'POST', body: JSON.stringify({ userId }),
    });
    if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
    if (!res || !data?.ok) return bridgeError(res, data, 'Could not clear notes');
    return NextResponse.json({ success: true, cleared: (data.cleared as number) ?? 0 });
  }
  return bad('Provide noteId, or userId + all:true to clear', 400, 'INVALID_INPUT');
}
