import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { botEconomyGet } from '@/app/lib/economy-backend';
import { apiFail, logApi } from '@/app/lib/dashboard-response';
import { NextRequest, NextResponse } from 'next/server';

// GET ?guildId= → economy overview from the bot (the same collections the
// slash commands use — never a parallel economy).
//
// The request is served through botEconomyGet, which caches per guild and
// deduplicates concurrent callers. Several dashboard panels mount at once;
// before this, each one issued its own upstream call on every render, which is
// what produced the repeated Discord rate-limit notices.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const started = Date.now();
  const token = await sessionToken();
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) {
    return apiFail('AUTH_REQUIRED', 'Sign in with Discord to continue', 401);
  }
  if (!/^\d{5,25}$/.test(guildId)) {
    return apiFail('INVALID_GUILD_ID', 'Valid guildId required', 400);
  }
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    logApi('/api/dashboard/economy/overview', 'GET', check.status, Date.now() - started, check.code);
    return NextResponse.json(
      { success: false, code: check.code, error: check.error, retryable: check.retryable },
      { status: check.status },
    );
  }
  const res = await botEconomyGet('overview', guildId);
  if (!res.ok || !res.data) {
    logApi('/api/dashboard/economy/overview', 'GET', res.status, Date.now() - started, res.code);
    const headers = res.retryAfterSec
      ? { 'Retry-After': String(res.retryAfterSec) }
      : undefined;
    return NextResponse.json(
      {
        success: false,
        code: res.code || 'ECONOMY_DATA_FAILED',
        error: res.error || 'Economy data could not be loaded.',
        retryable: res.status === 429 || res.status >= 500,
        retryAfterSec: res.retryAfterSec,
      },
      { status: res.status === 429 ? 429 : res.status >= 500 ? 503 : res.status, headers },
    );
  }
  logApi('/api/dashboard/economy/overview', 'GET', 200, Date.now() - started, res.cached ? 'CACHE' : undefined);
  const { ok, ...payload } = res.data;
  void ok;
  return NextResponse.json({ success: true, ...payload });
}