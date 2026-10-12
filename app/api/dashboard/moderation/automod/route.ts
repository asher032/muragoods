import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// AutoMod read-back and dry run.
//
//   GET  ?guildId=  → the rules Murabot will actually apply (normalised), a
//                     per-rule summary, whether AutoMod CAN run on this bot
//                     process (Message Content intent) and how each rule fired
//                     in the last 24h.
//   POST { guildId, content, channelId?, mentions? } → dry run the text against
//                     the stored rules. No message is touched, no strike is
//                     recorded, no cooldown is armed — an operator can see
//                     which rule fires and why BEFORE arming it.
//
// Saving the rules goes through /api/dashboard/config (the canonical guild
// config writer) followed by /config/refresh, so there is exactly one writer
// for this configuration — the same rule the prefix and general settings
// follow.

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

function bad(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: message, ...(code ? { code } : {}) }, { status });
}

async function bridge(path: string, init?: RequestInit, timeoutMs = 15000) {
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
  const code = typeof data?.code === 'string' && data.code ? data.code : 'BOT_ERROR';
  const message = typeof data?.error === 'string' && data.error ? data.error : `${fallback} (Bot returned ${res.status})`;
  return NextResponse.json({ success: false, code, error: message }, { status });
}

async function guard(token: string, guildId: string) {
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
    { status: check.status },
  );
}

export async function GET(req: NextRequest) {
  const token = await sessionToken();
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required', 400, 'INVALID_GUILD_ID');
  const denied = await guard(token, guildId);
  if (denied) return denied;

  const { res, data, secretMissing } = await bridge(`/mod/automod/${guildId}`);
  if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  if (!res || !data?.ok) return bridgeError(res, data, 'Could not read the AutoMod configuration');
  return NextResponse.json({
    success: true,
    config: data.config ?? {},
    summary: data.summary ?? [],
    problems: data.problems ?? [],
    availability: data.availability ?? null,
    recent24h: data.recent24h ?? {},
  });
}

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return bad('Discord token required', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const guildId = String(body?.guildId || '');
  const content = String(body?.content ?? '');
  if (!/^\d{5,25}$/.test(guildId)) return bad('Valid guildId required', 400, 'INVALID_GUILD_ID');
  if (!content.trim()) return bad('Provide the text to test', 400, 'INVALID_INPUT');
  if (content.length > 2000) return bad('Test text is limited to 2000 characters', 400, 'INVALID_INPUT');
  const denied = await guard(token, guildId);
  if (denied) return denied;

  const { res, data, secretMissing } = await bridge('/mod/automod/test', {
    method: 'POST',
    body: JSON.stringify({
      guildId,
      content,
      channelId: body?.channelId,
      mentions: Math.max(0, Math.min(Number(body?.mentions) || 0, 100)),
    }),
  });
  if (secretMissing) return bad('Bridge not configured', 503, 'BRIDGE_NOT_CONFIGURED');
  if (!res || !data?.ok) return bridgeError(res, data, 'Could not run the rule test');
  return NextResponse.json({ success: true, ...data });
}
