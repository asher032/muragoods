import { requireSession } from '@/app/lib/require-session';
import { withDisplayNames } from '@/app/lib/discord-names';
import { isMurabotOwner } from '@/app/lib/murabot-owner';
import { economyTransactions, topWallets, withEconomyDb } from '@/app/lib/economy-store';
import { NextRequest, NextResponse } from 'next/server';

// GET ?guildId=…&endpoint=leaderboard|transactions
//
// The FILTERED reads, kept separate from the page snapshot because a filter
// change is a new question, not a new page. It reads the same canonical
// Murabot collections as everything else, through the same store.
//
// A failure here is reported as a failure. It is never coerced into an empty
// result set: "no transactions match" and "the database did not answer" are
// different facts and the panel must be able to tell them apart.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ENDPOINTS = new Set(['leaderboard', 'transactions']);

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const guildId = (params.get('guildId') || '').trim();
  const endpoint = params.get('endpoint') || '';

  // Shape check first: a malformed scope is a caller bug and must never reach a
  // query. It discloses nothing, and every data access below still requires a
  // session and Manage Server on this guild.
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'A valid Discord server ID is required.' },
      { status: 400 },
    );
  }
  if (!ENDPOINTS.has(endpoint)) {
    return NextResponse.json(
      { success: false, code: 'UNKNOWN_ENDPOINT', error: `Unknown endpoint "${endpoint}".` },
      { status: 400 },
    );
  }
  // One call: proof the caller manages this guild, plus WHO they are.
  const auth = await requireSession(guildId);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, code: auth.code, error: auth.error },
      { status: auth.status },
    );
  }

  const filter = {
    userId: params.get('userId') || undefined,
    action: params.get('action') || 'all',
    hours: Number(params.get('hours') ?? 168),
    direction: params.get('direction') || 'all',
    itemId: params.get('itemId') || undefined,
    txId: params.get('txId') || undefined,
    limit: Number(params.get('limit') ?? 50),
    skip: Number(params.get('skip') ?? 0),
  };

  const read = await withEconomyDb('read', guildId, async (db) => {
    if (endpoint === 'transactions') return { page: await economyTransactions(db, guildId, filter) };
    const by = (params.get('by') || 'net') as 'net' | 'balance' | 'gems';
    const rows = await topWallets(db, guildId, by, Number(params.get('limit') ?? 10), Number(params.get('skip') ?? 0));
    return { rows: await withDisplayNames(guildId, rows) };
  });

  if (!read.ok) {
    return NextResponse.json(
      { success: false, code: read.error.code, error: read.error.message, retryable: read.error.retryable },
      { status: 503 },
    );
  }

  if (endpoint === 'transactions') {
    return NextResponse.json({ success: true, ...read.data.page });
  }

  // Ownership is per-caller, derived from the session — never from a parameter.
  if (params.get('withOwner') === '1') {
    return NextResponse.json({
      success: true,
      rows: read.data.rows,
      isOwner: isMurabotOwner(auth.discordId),
    });
  }
  return NextResponse.json({ success: true, rows: read.data.rows });
}
