import { getSession } from '@/app/lib/discord-session';
import { probeDatabase } from '@/app/lib/db-health';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/dashboard/health[?guildId=] — global dashboard health.
// Reports every dependency independently: one optional service being down
// must never read as "the whole dashboard is broken". Never fakes success:
// each field is measured live with a bounded timeout, and states are
// ok | degraded | offline | unauthenticated | unconfigured | unknown.
//
// Success envelope matches the dashboard contract:
//   { ok: true, dashboard, authentication, database, discord_api,
//     discord_gateway, bot, guild_service, ... }
// Failure (only for malformed input): { ok: false, error: { code, message } }.

const BOT_BASE = (
  process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') ||
  'https://murastream-bot-pf11.onrender.com'
).trim();

type State = 'ok' | 'degraded' | 'offline' | 'unauthenticated' | 'unconfigured' | 'unknown';

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((_, rej) => {
        t = setTimeout(() => rej(new Error('timeout')), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (t) clearTimeout(t);
  }
}

async function fetchJson(url: string, init: RequestInit, ms: number) {
  try {
    const resp = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(ms),
    });
    const body = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: resp.status, ok: resp.ok, body };
  } catch {
    return { status: 0, ok: false, body: null };
  }
}

function log(route: string, method: string, status: number, ms: number, code?: string) {
  // Dev-only request log: endpoint + status + duration + code. Never tokens,
  // cookies, secrets, or user data.
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Dashboard API] ${method} ${route} END ${status} ${ms}ms${code ? ` ${code}` : ''}`);
  }
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (guildId && !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_GUILD_ID', message: 'Valid guildId required' } },
      { status: 400 },
    );
  }

  // ── Authentication (session cookie → live Mongo session) ──
  let authentication: State = 'unauthenticated';
  let accessToken: string | null = null;
  try {
    const auth = await withTimeout(getSession(), 8000);
    if (auth) {
      authentication = 'ok';
      accessToken = auth.accessToken;
    }
  } catch {
    authentication = 'unknown';
  }

  // ── Database (same collection the site reads) ──
  let database: State = 'unknown';
  let dbDetail: string | null = null;
  try {
    const probe = await probeDatabase(6000);
    database = probe.state === 'READY' ? 'ok' : 'offline';
    dbDetail = probe.detail.state;
  } catch {
    database = 'offline';
  }

  // ── Discord API (public gateway probe — no auth needed) ──
  const discordProbe = await fetchJson('https://discord.com/api/v10/gateway', {}, 6000);
  const discord_api: State =
    discordProbe.ok || discordProbe.status === 0 ? 'ok' : discordProbe.status >= 500 ? 'offline' : 'degraded';
  // status 0 = network abort from this host; report unknown, not fake-ok.
  const discordApiState: State = discordProbe.status === 0 ? 'unknown' : discord_api;

  // ── Bot service (Render /health, measured fields only) ──
  let bot: State = 'unknown';
  let botDetail: Record<string, unknown> | null = null;
  let gatewayState: State = 'unknown';
  const botProbe = await fetchJson(`${BOT_BASE}/health`, {}, 8000);
  if (botProbe.body && typeof botProbe.body === 'object') {
    botDetail = botProbe.body as Record<string, unknown>;
    const ok = (botProbe.body as { ok?: boolean }).ok;
    const gw = (botProbe.body as { gateway?: { alive?: boolean } }).gateway;
    bot = ok === true ? 'ok' : ok === false ? 'degraded' : botProbe.ok ? 'degraded' : 'unknown';
    if (gw && typeof gw.alive === 'boolean') gatewayState = gw.alive ? 'ok' : 'degraded';
    else gatewayState = bot === 'ok' ? 'ok' : 'unknown';
  } else if (botProbe.status === 0) {
    bot = 'offline';
    gatewayState = 'unknown';
  } else {
    bot = 'degraded';
  }
  const discord_gateway: State = gatewayState;

  // ── Guild service (only when a guild is selected + session exists) ──
  let guild_service: State = 'unknown';
  let guildDetail: Record<string, unknown> | null = null;
  if (!guildId) {
    guild_service = 'unknown';
  } else if (!accessToken) {
    guild_service = 'unauthenticated';
  } else {
    const userProbe = await fetchJson(
      'https://discord.com/api/v10/users/@me/guilds?with_counts=true',
      { headers: { Authorization: `Bearer ${accessToken}` } },
      8000,
    );
    if (userProbe.status === 401) {
      guild_service = 'unauthenticated';
      guildDetail = { code: 'AUTH_REQUIRED' };
    } else if (!userProbe.ok || !Array.isArray(userProbe.body)) {
      guild_service = userProbe.status === 0 || userProbe.status >= 500 ? 'offline' : 'degraded';
      guildDetail = { httpStatus: userProbe.status };
    } else {
      const found = (userProbe.body as Array<{ id?: string }>).some((g) => g?.id === guildId);
      guild_service = found ? 'ok' : 'degraded';
      guildDetail = found ? { member: true } : { code: 'NOT_GUILD_MEMBER' };
    }
  }

  const overallOk =
    database !== 'offline' && discordApiState !== 'offline' && bot !== 'offline';

  // DB-down means the session lookup itself could not run: do not report
  // "unauthenticated" (sign in again) when the truth is "unknown".
  if (database === 'offline' && authentication === 'unauthenticated') {
    authentication = 'unknown';
  }
  if (database === 'offline' && guild_service === 'unauthenticated') {
    guild_service = 'unknown';
  }

  const ms = Date.now() - started;
  log('/api/dashboard/health', 'GET', overallOk ? 200 : 207, ms);

  return NextResponse.json({
    ok: overallOk,
    // Spec keys:
    dashboard: 'online' as const,
    authentication,
    database,
    discord_api: discordApiState,
    discord_gateway,
    bot,
    guild_service,
    // Detail (booleans/statuses only — never tokens or user data):
    detail: {
      databaseState: dbDetail,
      botHealth: botDetail
        ? {
            ok: (botDetail as { ok?: unknown }).ok ?? null,
            guilds: (botDetail as { guilds?: unknown }).guilds ?? null,
          }
        : null,
      guild: guildDetail,
      checkedAt: new Date().toISOString(),
      responseTimeMs: ms,
    },
  }, { status: overallOk ? 200 : 207 });
}
