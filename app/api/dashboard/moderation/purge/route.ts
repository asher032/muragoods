import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

// Filtered purge API — the SAME service the /purge slash commands use.
//   POST { guildId, channelId, kind, count, userId?, text?, includePinned? }
//
// kinds: bot · contains · user · all · embeds · emoji · files · images ·
// links · mentions · human. `purge` ignores pinned messages; pass
// includePinned:true for the cleanup behavior. Dashboard invokers need
// Manage Server; the bot needs Manage Messages + Read History.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

const KINDS = ['bot', 'contains', 'user', 'all', 'embeds', 'emoji', 'files', 'images', 'links', 'mentions', 'human'];

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: message, ...(code ? { code } : {}) }, { status });
}

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  const channelId = String(body?.channelId || '');
  const kind = String(body?.kind || 'all').toLowerCase();
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required', 400, 'INVALID_GUILD_ID');
  if (!/^\d{5,25}$/.test(channelId)) return bad('Pick a channel first', 400, 'INVALID_INPUT');
  if (!KINDS.includes(kind)) return bad(`Unknown purge kind: ${kind}`, 400, 'INVALID_OP');
  const count = Math.max(1, Math.min(Number(body?.count) || 20, 100));
  if (kind === 'user' && !/^\d{5,25}$/.test(String(body?.userId || ''))) {
    return bad('Pick a member for user purge', 400, 'INVALID_INPUT');
  }
  if (kind === 'contains' && !String(body?.text || '').trim()) {
    return bad('Search text is required for contains purge', 400, 'INVALID_INPUT');
  }

  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    return NextResponse.json(
      { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
      { status: check.status },
    );
  }

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let res: Response | null = null;
  let data: Record<string, unknown> | null = null;
  try {
    res = await fetch(`${BOT_BASE}/mod/purge/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId, kind, count,
        userId: body?.userId, text: String(body?.text || '').slice(0, 200),
        includePinned: Boolean(body?.includePinned),
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  } catch {
    res = null;
  } finally {
    clearTimeout(timer);
  }

  if (!res) return bad('Bot unreachable — is it online?', 502, 'BOT_OFFLINE');
  const passthrough = [400, 401, 403, 404, 409];
  if (!res.ok || !data?.ok) {
    const code = typeof data?.code === 'string' && data.code ? data.code
      : res.status === 404 ? 'TARGET_NOT_FOUND'
      : res.status === 403 ? 'BOT_FORBIDDEN' : 'BOT_ERROR';
    const message = typeof data?.error === 'string' && data.error ? data.error : `Purge failed (Bot returned ${res.status})`;
    return bad(message, passthrough.includes(res.status) ? res.status : 502, code);
  }
  return NextResponse.json({
    success: true, caseId: data.caseId, deleted: data.deleted ?? 0, scanned: data.scanned ?? 0,
  });
}
