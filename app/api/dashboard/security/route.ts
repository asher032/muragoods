import { getSession } from '@/app/lib/discord-session';
import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Security module (anti-raid / anti-nuke / verification).
//
//   GET  ?guildId=   → live capability report (which Discord permissions and
//                      intents are actually present), stored settings, the
//                      alert channel in use, unreviewed automatic actions and
//                      pending expiries.
//   POST { guildId, action, … } → raidmode-on | raidmode-off | verification |
//                      review | undo | restore-roles.
//
// Authorization is the template's `requireGuildManage` (the OAuth identity may
// manage this server) AND an explicit Discord identity is forwarded so the bot
// can re-check the live permission for the action it is about to take. The
// browser is never the authority: `actorId` is taken from the server-side
// session, never from the request body.

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: message, ...(code ? { code } : {}) }, { status });
}

async function bridge(path: string, init?: RequestInit, timeoutMs = 20000) {
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) return { res: null as Response | null, data: null, secretMissing: true };
  try {
    const res = await fetch(`${BOT_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { res, data, secretMissing: false };
  } catch {
    return { res: null as Response | null, data: null, secretMissing: false };
  }
}

function bridgeError(res: Response | null, data: Record<string, unknown> | null, fallback: string) {
  if (!res) return bad('Bot unreachable — is it online?', 502, 'BOT_OFFLINE');
  const passthrough = [400, 401, 403, 404, 409, 503];
  const status = passthrough.includes(res.status) ? res.status : 502;
  const code = typeof data?.code === 'string' && data.code ? data.code
    : res.status === 403 ? 'BOT_MISSING_PERMISSION'
    : res.status === 404 ? 'BOT_NOT_IN_GUILD' : 'BOT_ERROR';
  const message = typeof data?.error === 'string' && data.error ? data.error : `${fallback} (Bot returned ${res.status})`;
  return NextResponse.json(
    { success: false, code, error: message, ...(data?.permission ? { permission: data.permission } : {}) },
    { status },
  );
}

const ACTIONS = ['raidmode-on', 'raidmode-off', 'verification', 'review', 'undo', 'restore-roles'];

export async function GET(req: NextRequest) {
  const token = await sessionToken();
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required', 400, 'INVALID_GUILD_ID');
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    return NextResponse.json(
      { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
      { status: check.status },
    );
  }
  const { res, data, secretMissing } = await bridge(`/mod/security/${guildId}`);
  if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  if (!res || !data?.ok) return bridgeError(res, data, 'Could not read the security posture');
  return NextResponse.json({
    success: true,
    capabilities: data.capabilities ?? null,
    settings: data.settings ?? {},
    alerts: data.alerts ?? null,
    review: data.review ?? [],
    pending: data.pending ?? [],
  });
}

export async function POST(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  const action = String(body?.action || '');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required', 400, 'INVALID_GUILD_ID');
  if (!ACTIONS.includes(action)) return bad(`Unknown security action: ${action || '(none)'}`, 400, 'INVALID_OP');

  const check = await requireGuildManage(auth.accessToken, guildId);
  if (!check.ok) {
    return NextResponse.json(
      { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
      { status: check.status },
    );
  }

  const payload: Record<string, unknown> = {
    action,
    // The signed-in Discord id. The bot re-reads this member's live permissions
    // before acting, so a stale OAuth list cannot authorize anything by itself.
    actorId: auth.discordId,
  };
  for (const key of ['minutes', 'enabled', 'roleId', 'channelId', 'userId', 'id', 'allowDangerous']) {
    if (body?.[key] !== undefined) payload[key] = body[key];
  }

  const { res, data, secretMissing } = await bridge(`/mod/security/${guildId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 30000);
  if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  if (!res || !data?.ok) return bridgeError(res, data, 'Security action failed');
  return NextResponse.json({ success: true, ...data });
}
