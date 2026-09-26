import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

// Lockdown API — the SAME service the /lockdown slash commands use.
//   POST { guildId, scope: 'channel'|'server', channelId?, duration?, reason?, unlock? }
//
// Locks deny Send Messages for @everyone (explicit grants keep working).
// Unlock restores EXACTLY the overwrite the lock changed (saved state) —
// never unrelated administrator edits. Dashboard invokers need Manage
// Server here; the bot needs Manage Channels (reported as
// BOT_MISSING_PERMISSION, never as a user permission failure).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: message, ...(code ? { code } : {}) }, { status });
}

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  const scope = String(body?.scope || 'channel');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required', 400, 'INVALID_GUILD_ID');
  if (!['channel', 'server'].includes(scope)) return bad("scope must be 'channel' or 'server'", 400, 'INVALID_OP');
  if (scope === 'channel' && !/^\d{5,25}$/.test(String(body?.channelId || ''))) {
    return bad('Valid channelId required for channel lockdown', 400, 'INVALID_INPUT');
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
  const timer = setTimeout(() => controller.abort(), 30000);
  let res: Response | null = null;
  let data: Record<string, unknown> | null = null;
  try {
    res = await fetch(`${BOT_BASE}/mod/lockdown/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope,
        channelId: body?.channelId,
        duration: body?.duration,
        reason: body?.reason || 'Dashboard lockdown',
        unlock: Boolean(body?.unlock),
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
    const message = typeof data?.error === 'string' && data.error ? data.error : `Lockdown failed (Bot returned ${res.status})`;
    return bad(message, passthrough.includes(res.status) ? res.status : 502, code);
  }
  return NextResponse.json({
    success: true, caseId: data.caseId,
    locked: data.locked ?? null, skipped: data.skipped ?? null,
    restored: data.restored ?? null, channelId: data.channelId ?? null,
  });
}
