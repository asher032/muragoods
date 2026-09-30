import { requireSession } from '@/app/lib/require-session';
import { logApi } from '@/app/lib/dashboard-response';
import {
  isMurabotOwner, logOwnerCheck, ownerConfigurationProblem, ownerDiagnostics,
} from '@/app/lib/murabot-owner';
import { guildMemberNames, invalidateMemberNames } from '@/app/lib/discord-names';
import { botChannels } from '@/app/lib/bot-presence';
import {
  antiExploitAudit,
  economyConfig,
  economyHealth,
  economyOverview,
  economyTransactions,
  section,
  shopSnapshot,
  topWallets,
  withEconomyDb,
} from '@/app/lib/economy-store';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/dashboard/economy?guildId=…&fresh=1
//
// ONE response for the whole Economy page.
//
// The page used to issue seven requests (an overview plus one per panel), each
// of which was proxied to the bot process. That is what made the page slow to
// first paint, easy to rate-limit, and — when the bot was unreachable — blank
// with a cheerful "No transactions yet". Now the page asks once, this route
// reads the canonical Murabot collections once, and every section reports its
// OWN state: `ok`, `empty` (the read succeeded and there is genuinely nothing)
// or `error` (the read failed, with a category and a retry hint).
//
// `?fresh=1` is what the Retry button uses: it drops the server cache and the
// cached member names, then re-reads. It does not reload the site.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SNAPSHOT_TTL_MS = 10_000;
const cache = new Map<string, { at: number; body: Record<string, unknown> }>();
const inflight = new Map<string, Promise<Record<string, unknown>>>();

function newRequestId(): string {
  return `eco_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One line per economy request, in development only.
 *
 * It exists so "the page is empty" can be answered without guessing: which
 * server was asked, whether the database answered, which collections were read,
 * how many rows came back, how long it took, and whether the cache served it.
 *
 * Nothing secret can appear here by construction — it is assembled from a
 * request id, a guild id, a database NAME, a variable NAME, states, counts and
 * durations. A connection string, token, cookie or session value is never in
 * scope, and the System Status panel shows the same fields to the operator.
 */
function logEconomyRequest(
  requestId: string, guildId: string, diagnostics: Diagnostics | null,
  status: string, ms: number, cache: 'HIT' | 'MISS',
): void {
  if (process.env.NODE_ENV !== 'development') return;
  const db = diagnostics?.database;
  const sections = (diagnostics?.sections ?? [])
    .map((s) => `${s.section}=${s.state}(${s.records ?? '-'},${s.ms}ms)`)
    .join(' ');
  console.log(
    `[Economy] request=${requestId} guild=${guildId} database=${db?.state ?? 'unprobed'}` +
    ` db_name=${db?.name ?? '-'} cache=${cache} status=${status} total=${ms}ms` +
    (sections ? ` sections: ${sections}` : '') +
    (diagnostics?.errorCategory ? ` error=${diagnostics.errorCategory}` : ''),
  );
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const requestId = newRequestId();
  const params = req.nextUrl.searchParams;
  const guildId = (params.get('guildId') || '').trim();

  // The selected guild is the ONLY thing that scopes an economy read. An
  // undefined, "undefined" or malformed value is refused here — before it can
  // reach a query as a filter that matches nothing and reads back as "this
  // server has no economy". This is a shape check on the caller's own request,
  // so it deliberately precedes the session check and discloses nothing; every
  // data access below is still behind the session and the Manage Server check.
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      {
        success: false, code: 'INVALID_GUILD_ID', requestId,
        error: 'A valid Discord server ID is required. Pick a server in the top bar.',
      },
      { status: 400 },
    );
  }
  // ONE call resolves both halves of what this handler needs: proof the caller
  // manages this guild, and WHO they are. Ownership is derived from the
  // session's Discord id below — never from a query parameter.
  const auth = await requireSession(guildId);
  if (!auth.ok) {
    logApi('/api/dashboard/economy', 'GET', auth.status, Date.now() - started, auth.code);
    return NextResponse.json(
      { success: false, code: auth.code, error: auth.error, requestId },
      {
        status: auth.status,
        headers: auth.retryAfterMs ? { 'Retry-After': String(Math.ceil(auth.retryAfterMs / 1000)) } : undefined,
      },
    );
  }
  const isOwner = isMurabotOwner(auth.discordId);
  logOwnerCheck(auth.discordId, guildId, 'economy-snapshot');

  // Per-caller facts, deliberately OUTSIDE the cached payload. The cache is
  // keyed by guild, so anything user-specific inside it would be served to the
  // next person who opens the same server's Economy page.
  //
  // `owner` carries the two ids MASKED (last four only). That is enough to
  // confirm "the ids match" or "the wrong account is signed in" and useless for
  // harvesting an id — so it can be shown in the diagnostics view without
  // publishing the owner's full Discord id to the browser.
  const caller = {
    isOwner,
    ownerConfigured: !ownerConfigurationProblem(),
    owner: ownerDiagnostics(auth.discordId),
  };
  const respond = (body: Record<string, unknown>, cached: boolean) =>
    NextResponse.json({ ...body, ...caller, cached, requestId });

  const fresh = params.get('fresh') === '1';
  if (fresh) {
    cache.delete(guildId);
    invalidateMemberNames(guildId);
  } else {
    const hit = cache.get(guildId);
    if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) {
      logApi('/api/dashboard/economy', 'GET', 200, Date.now() - started, 'CACHE_HIT');
      return respond(hit.body, true);
    }
    const running = inflight.get(guildId);
    if (running) {
      const body = await running;
      logApi('/api/dashboard/economy', 'GET', 200, Date.now() - started, 'SINGLE_FLIGHT');
      return respond(body, true);
    }
  }

  const build = buildSnapshot(guildId, requestId);

  inflight.set(guildId, build);
  let body: Record<string, unknown>;
  try {
    body = await build;
  } catch (err) {
    inflight.delete(guildId);
    logApi('/api/dashboard/economy', 'GET', 500, Date.now() - started, 'ECONOMY_SNAPSHOT_FAILED');
    return NextResponse.json(
      {
        success: false, code: 'ECONOMY_SNAPSHOT_FAILED', requestId, retryable: true,
        error: 'The economy snapshot could not be assembled.',
        // A message a developer needs, with no secrets in it by construction.
        detail: err instanceof Error ? err.name : 'unknown',
      },
      { status: 500 },
    );
  } finally {
    if (inflight.get(guildId) === build) inflight.delete(guildId);
  }

  cache.set(guildId, { at: Date.now(), body });
  logApi('/api/dashboard/economy', 'GET', 200, Date.now() - started, 'SNAPSHOT');
  logEconomyRequest(
    requestId, guildId,
    (body.diagnostics as Diagnostics | null) ?? null,
    String(body.databaseAvailable === false ? 'DATABASE_UNAVAILABLE' : 'OK'),
    Date.now() - started, 'MISS',
  );
  return respond(body, false);
}

/** Read every section of the page from the canonical Murabot collections. */
async function buildSnapshot(guildId: string, requestId: string): Promise<Record<string, unknown>> {
  // Murabot's own presence for THIS guild, from its gateway cache. Cached
  // briefly server-side, so it costs at most one bridge call per window and
  // reports "not installed" as a fact rather than an absence of data.
  const presence = await botChannels(guildId, ['view', 'send', 'embed']);
  const bot = {
    ...presence.presence,
    channels: presence.channels.length,
    error: presence.error,
  };

  const read = await withEconomyDb(requestId, guildId, (db) => buildSections(db, guildId, requestId));
  if (!read.ok) {
    // The database is down. Every section reports the same, honest state —
    // this is emphatically NOT "no transactions".
    return {
      success: true,
      guild: { id: guildId },
      bot,
      databaseAvailable: false,
      error: read.error,
      diagnostics: read.diagnostics,
      sections: {},
      overview: null, config: null, shop: null, transactions: null,
      audit: null, health: null, leaderboard: [], logs: [], statistics: null,
    };
  }
  return {
    success: true,
    guild: { id: guildId },
    bot,
    databaseAvailable: true,
    ...read.data,
    // The database facts come from the probe that actually connected; the
    // per-section timings come from the reads. Both are credential-free.
    diagnostics: {
      ...read.diagnostics,
      sections: Object.entries((read.data.sections ?? {}) as Record<string, { state: string; ms: number; records: number | null }>)
        .map(([name, s]) => ({ section: name, state: s.state, ms: s.ms, records: s.records })),
      errorCategory: Object.values((read.data.sections ?? {}) as Record<string, { state: string }>)
        .some((s) => s.state === 'error') ? 'SECTION_FAILED' : null,
    },
  };
}

type Diagnostics = {
  requestId?: string;
  guildId?: string;
  database?: { name: string; uriSource: string | null; state: string; responseTimeMs: number };
  sections?: Array<{ section: string; state: string; ms: number; records: number | null }>;
  cache?: string;
  errorCategory?: string | null;
};

async function buildSections(
  db: import('mongodb').Db, guildId: string, requestId: string,
): Promise<Record<string, unknown>> {
  const [overview, config, health, audit, shop, transactions, leaderboard] = await Promise.all([
    section('overview', () => economyOverview(db, guildId), (d) => d.users),
    section('config', () => economyConfig(db, guildId), () => 1),
    section('health', () => economyHealth(db, guildId), (d) => d.wallets),
    section('audit', () => antiExploitAudit(db, guildId), (d) => d.findingCount),
    section('shop', () => shopSnapshot(db, guildId), (d) => d.items.length),
    section('transactions', () => economyTransactions(db, guildId, { limit: 25 }), (d) => d.total),
    section('leaderboard', () => topWallets(db, guildId, 'net', 10), (d) => d.length),
  ]);

  // The log list is the recent slice of the ledger. It is read from the same
  // result as the overview, so it can never disagree with the transaction
  // count shown above it.
  // Names are resolved from the guild ONCE for the whole snapshot and attached
  // as presentation only. A member who cannot be resolved keeps their id and
  // is labelled "Unknown User" — never a shared or substituted name.
  const names = await guildMemberNames(guildId).catch(() => new Map<string, string>());
  const logs = (overview.data?.recent ?? []).map((row) => ({
    ...row,
    displayName: names.get(String(row.userId ?? '')) ?? 'Unknown User',
  }));
  const leaderboardRows = (leaderboard.data ?? []).map((r) => ({
    ...r,
    displayName: names.get(String(r.canonicalUserId)) ?? 'Unknown User',
  }));

  const sections: Record<string, unknown> = {};
  for (const result of [overview, config, health, audit, shop, transactions, leaderboard]) {
    sections[result.section] = {
      state: result.state,
      error: result.error,
      ms: result.ms,
      records: result.records,
    };
  }
  sections.logs = { state: overview.state === 'error' ? 'error' : logs.length ? 'ok' : 'empty', error: overview.error, ms: 0, records: logs.length };

  return {
    sections,
    overview: overview.data,
    config: config.data?.config ?? null,
    configState: config.data?.state ?? 'unknown',
    health: health.data,
    audit: audit.data,
    shop: shop.data,
    transactions: transactions.data,
    leaderboard: leaderboardRows,
    logs,
    statistics: overview.data
      ? {
        wallets: overview.data.users,
        dau: overview.data.dau,
        transactions: overview.data.transactions,
        recent: logs.length,
        circulation: overview.data.circulation,
      }
      : null,
  };
}
