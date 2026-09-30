import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { botEconomyGet } from '@/app/lib/economy-backend';
import { NextRequest, NextResponse } from 'next/server';

// GET ?guildId=…&endpoint=leaderboard|health|transactions|audit|shop
//
// ONE route for all economy READS. Previously the page needed a separate
// endpoint per panel, which meant several independent upstream calls on a
// single page view. Centralizing them here means every read passes through the
// same cache + single-flight layer, so a full page load costs at most one
// upstream request per distinct (endpoint, guild, filter) key.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ENDPOINTS = new Set(['leaderboard', 'health', 'transactions', 'audit', 'shop', 'config']);

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const token = await sessionToken();
  const guildId = params.get('guildId') || '';
  const endpoint = params.get('endpoint') || '';

  if (!token) {
    return NextResponse.json(
      { success: false, code: 'AUTH_REQUIRED', error: 'Sign in with Discord to continue' },
      { status: 401 },
    );
  }
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' },
      { status: 400 },
    );
  }
  if (!ENDPOINTS.has(endpoint)) {
    return NextResponse.json(
      {
        success: false, code: 'UNKNOWN_ENDPOINT',
        error: `Unknown endpoint "${endpoint}". Expected one of: ${[...ENDPOINTS].join(', ')}.`,
      },
      { status: 400 },
    );
  }
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    return NextResponse.json(
      { success: false, code: check.code, error: check.error, retryable: check.retryable },
      { status: check.status },
    );
  }

  // Pass through only the filters this route understands, so an arbitrary
  // query string can never reach the backend unvalidated.
  const forwarded: Record<string, string | number | undefined> = {};
  if (endpoint === 'leaderboard') {
    forwarded.limit = params.get('limit') || 10;
    forwarded.skip = params.get('skip') || 0;
    forwarded.by = params.get('by') || 'net';
  } else if (endpoint === 'transactions') {
    for (const key of ['userId', 'action', 'hours', 'direction', 'itemId', 'txId', 'limit', 'skip']) {
      const value = params.get(key);
      if (value) forwarded[key] = value;
    }
  } else if (endpoint === 'shop') {
    const section = params.get('section');
    if (section) forwarded.section = section;
  }

  const res = await botEconomyGet(endpoint, guildId, forwarded);
  if (!res.ok || !res.data) {
    const headers = res.retryAfterSec ? { 'Retry-After': String(res.retryAfterSec) } : undefined;
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
  const { ok, ...payload } = res.data;
  void ok;
  return NextResponse.json({ success: true, cached: Boolean(res.cached), ...payload });
}