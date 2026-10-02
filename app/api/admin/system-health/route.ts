import { NextResponse } from 'next/server';
import { requireStaff } from '@/app/lib/access-control';
import { probeDatabase } from '@/app/lib/db-health';
import { botStatus } from '@/app/lib/bot-presence';
import { botToken, botTokenHealthy } from '@/app/lib/discord-bot';
import { firstPartyInventory } from '@/app/lib/murastream/playback/resolver';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// System health for the Muragoods ecosystem.
//
// The old health surface reported "Online" whenever an environment variable
// existed. That is not health — it is configuration. A missing API key is
// NOT_CONFIGURED; a service that answers slowly is DEGRADED; a service that
// does not answer is OFFLINE; one that refuses the credential is
// UNAUTHORIZED. Each probe here actually calls the thing it describes, with a
// bound, and says which one.
//
// Every probe is independent: a dead music service must not make the database
// read as failed, and the overall verdict is the worst component rather than
// an average that can hide one dead subsystem behind nine healthy ones.
// ─────────────────────────────────────────────────────────────────────────

export type HealthState =
  | 'ONLINE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'CONFIGURATION_ERROR'
  | 'DATABASE_ERROR'
  | 'NOT_CONFIGURED';

interface ServiceHealth {
  id: string;
  label: string;
  group: 'website' | 'data' | 'muragoods' | 'discord';
  state: HealthState;
  /** What was actually done to learn this. */
  checked: string;
  detail: string;
  latencyMs: number | null;
}

const SEVERITY: Record<HealthState, number> = {
  ONLINE: 0,
  DEGRADED: 1,
  NOT_CONFIGURED: 2,
  RATE_LIMITED: 3,
  TIMEOUT: 4,
  UNAUTHORIZED: 5,
  DATABASE_ERROR: 6,
  OFFLINE: 7,
  CONFIGURATION_ERROR: 8,
};

export function worstState(states: HealthState[]): HealthState {
  return states.reduce<HealthState>((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst), 'ONLINE');
}

/** One bounded probe. Never throws; always returns a verdict. */
async function probe(
  id: string,
  label: string,
  group: ServiceHealth['group'],
  fn: () => Promise<{ state: HealthState; detail: string; checked: string; latencyMs?: number | null }>,
): Promise<ServiceHealth> {
  const started = Date.now();
  try {
    const r = await fn();
    return { id, label, group, state: r.state, detail: r.detail, checked: r.checked, latencyMs: r.latencyMs ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const state: HealthState = message === 'probe-timeout' ? 'TIMEOUT' : 'OFFLINE';
    return {
      id, label, group, state,
      checked: 'live request',
      detail: state === 'TIMEOUT'
        ? 'The service did not answer within the probe window.'
        : 'The service could not be reached.',
      latencyMs: Date.now() - started,
    };
  }
}

function fromHttpStatus(status: number, okWhen: number[] = [200]): HealthState {
  if (okWhen.includes(status)) return 'ONLINE';
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 0) return 'OFFLINE';
  return 'OFFLINE';
}

/** A GET with a hard bound; never throws. */
async function boundedFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<{ ok: boolean; status: number; ms: number; body?: unknown }> {
  const { timeoutMs = 4000, ...rest } = init;
  const started = Date.now();
  try {
    const resp = await fetch(url, { ...rest, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    const body = resp.ok ? await resp.json().catch(() => null) : null;
    return { ok: resp.ok, status: resp.status, ms: Date.now() - started, body };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - started };
  }
}

function bridgeConfigured(): boolean {
  return Boolean(process.env.DISCORD_BRIDGE_SECRET);
}

function botBase(): string {
  return process.env.BOT_HEALTH_URL?.replace(/\/health$/, '')
    || 'https://murastream-bot-pf11.onrender.com';
}

export async function GET(req: Request) {
  // Owner, or staff holding the technical scope — this is infrastructure
  // state, not a guild-scoped concern.
  const guard = await requireStaff(req, ['technical']);
  if (!guard.ok) return guard.response;

  const services: ServiceHealth[] = [];

  // ── Website ───────────────────────────────────────────────────────────
  services.push({
    id: 'website', label: 'Muragoods website', group: 'website',
    state: 'ONLINE', checked: 'handling this request',
    detail: 'The site is serving requests. If you can read this, it is up.',
    latencyMs: null,
  });

  // ── Database ──────────────────────────────────────────────────────────
  const db = await probeDatabase(4000).catch(() => null);
  services.push({
    id: 'database', label: 'MongoDB', group: 'data',
    state: db ? (db.database === 'online' ? 'ONLINE' : mapDbState(db.state)) : 'OFFLINE',
    checked: db ? `counted documents (${db.responseTimeMs}ms)` : 'connection attempt failed',
    detail: db?.detail.message ?? 'The database could not be probed.',
    latencyMs: db?.responseTimeMs ?? null,
  });

  // ── Murastream resolver (local, no network) ───────────────────────────
  const inventory = firstPartyInventory();
  services.push({
    id: 'playback_resolver', label: 'Murastream playback resolver', group: 'muragoods',
    state: 'ONLINE', checked: 'resolved the first-party inventory in-process',
    detail: inventory.titles === 0
      ? 'Resolver is running, but no first-party media is registered — every title reports '
        + '"playback source unavailable" until an entry is added to the manifest.'
      : `${inventory.titles} title(s) and ${inventory.episodes} episode file(s) registered.`,
    latencyMs: null,
  });

  // ── TMDB metadata ─────────────────────────────────────────────────────
  if (!process.env.TMDB_API_KEY) {
    services.push({
      id: 'tmdb', label: 'TMDB metadata API', group: 'muragoods',
      state: 'NOT_CONFIGURED', checked: 'environment',
      detail: 'TMDB_API_KEY is not set. Catalog falls back to the baked sample data, so '
        + 'metadata and trailers are unavailable.',
      latencyMs: null,
    });
  } else {
    const r = await boundedFetch(
      'https://api.themoviedb.org/3/configuration',
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }, timeoutMs: 4000 },
    );
    services.push({
      id: 'tmdb', label: 'TMDB metadata API', group: 'muragoods',
      state: fromHttpStatus(r.status),
      checked: `GET /configuration (${r.ms}ms)`,
      detail: r.status === 200
        ? 'TMDB answered with a valid configuration.'
        : r.status === 401 || r.status === 403
          ? 'TMDB rejected the configured API key.'
          : 'TMDB did not answer.',
      latencyMs: r.ms,
    });
  }

  // ── Discord API (bot credential) ──────────────────────────────────────
  const tokenHealthy = await botTokenHealthy().catch(() => null);
  if (!botToken()) {
    services.push({
      id: 'discord_api', label: 'Discord API', group: 'discord',
      state: 'NOT_CONFIGURED', checked: 'environment',
      detail: 'No site-side Discord bot token is configured, so this deployment cannot call '
        + 'the Discord API on the bot\'s behalf. Murabot still can.',
      latencyMs: null,
    });
  } else {
    services.push({
      id: 'discord_api', label: 'Discord API (bot credential)', group: 'discord',
      state: tokenHealthy === true ? 'ONLINE' : tokenHealthy === false ? 'UNAUTHORIZED' : 'DEGRADED',
      checked: 'GET /users/@me with the bot token',
      detail: tokenHealthy === true
        ? 'The bot credential is valid.'
        : tokenHealthy === false
          ? 'Discord rejected the bot token.'
          : 'Discord did not answer the credential check.',
      latencyMs: null,
    });
  }

  // ── Murabot bridge + gateway ──────────────────────────────────────────
  if (!bridgeConfigured()) {
    services.push({
      id: 'murabot_bridge', label: 'Murabot bridge', group: 'muragoods',
      state: 'NOT_CONFIGURED', checked: 'environment',
      detail: 'DISCORD_BRIDGE_SECRET is not set, so this deployment cannot read or drive Murabot. '
        + 'Settings saved here are stored but not pushed to the bot.',
      latencyMs: null,
    });
  } else {
    const bot = await botStatus().catch(() => null);
    const bridgeOk = bot !== null && bot.error === null;
    services.push({
      id: 'murabot_bridge', label: 'Murabot bridge', group: 'muragoods',
      state: bridgeOk ? (bot!.online ? 'ONLINE' : 'DEGRADED') : bot?.error?.code === 'AUTHENTICATION_ERROR' ? 'UNAUTHORIZED' : 'OFFLINE',
      checked: 'GET /bot/status over the bridge',
      detail: bridgeOk
        ? (bot!.online
          ? `Murabot is connected (${bot!.latencyMs ?? '—'}ms latency).`
          : 'Murabot answered but reports it is not connected to the gateway.')
        : (bot?.error?.message ?? 'Murabot did not answer.'),
      latencyMs: null,
    });

    services.push({
      id: 'discord_gateway', label: 'Discord gateway', group: 'discord',
      state: bridgeOk ? (bot!.state ? 'ONLINE' : 'DEGRADED') : 'OFFLINE',
      checked: 'gateway state reported by Murabot',
      detail: bridgeOk
        ? `Gateway state: ${bot!.state ?? 'unknown'}. Shards: ${bot!.guildIds.length} guild(s), `
          + `heartbeat ${bot!.heartbeatAgeSeconds ?? '—'}s old, ${bot!.reconnectCount ?? 0} reconnect(s), `
          + `uptime ${Math.round((bot!.uptimeSeconds ?? 0) / 60)}m.`
        : 'Unavailable: Murabot did not report a gateway state.',
      latencyMs: null,
    });
  }

  // ── Music / audio ─────────────────────────────────────────────────────
  if (!bridgeConfigured()) {
    services.push({
      id: 'music', label: 'Music service', group: 'muragoods',
      state: 'NOT_CONFIGURED', checked: 'environment',
      detail: 'Cannot be probed without the Murabot bridge.',
      latencyMs: null,
    });
  } else {
    const r = await boundedFetch(`${botBase()}/music/preflight`, {
      headers: { Authorization: `Bearer ${process.env.DISCORD_BRIDGE_SECRET}` },
      timeoutMs: 4000,
    });
    services.push({
      id: 'music', label: 'Music service', group: 'muragoods',
      state: r.status === 404 ? 'DEGRADED' : fromHttpStatus(r.status),
      checked: `GET /music/preflight (${r.ms}ms)`,
      detail: r.status === 404
        ? 'Murabot is reachable but reports no music preflight endpoint. Audio playback '
          + '(yt-dlp / FFmpeg) could not be verified from here.'
        : r.status === 200
          ? 'Music preflight answered.'
          : 'The music service did not answer.',
      latencyMs: r.ms,
    });
  }

  // ── Payments ──────────────────────────────────────────────────────────
  const paymentsConfigured = Boolean(process.env.GCASH_API_KEY || process.env.PAYMENT_WEBHOOK_SECRET || process.env.RESEND_API_KEY);
  services.push({
    id: 'payments', label: 'Payments', group: 'muragoods',
    state: paymentsConfigured ? 'DEGRADED' : 'NOT_CONFIGURED',
    checked: 'environment',
    detail: paymentsConfigured
      ? 'Payment credentials are present. Live charge verification is not performed from a health '
        + 'probe — order status must be confirmed on an order before it is marked paid.'
      : 'No payment provider credentials are configured on this deployment; orders stay '
        + '"Pending Payment" until payment is confirmed manually.',
    latencyMs: null,
  });

  // ── Notifications / email ────────────────────────────────────────────
  services.push({
    id: 'notifications', label: 'Notifications & email', group: 'muragoods',
    state: process.env.RESEND_API_KEY || process.env.EMAIL_USER ? 'DEGRADED' : 'NOT_CONFIGURED',
    checked: 'environment',
    detail: process.env.RESEND_API_KEY || process.env.EMAIL_USER
      ? 'An email provider is configured. Delivery is not exercised by a health probe — a real '
        + 'verification email is the only proof.'
      : 'No email provider configured; verification and notification email cannot send.',
    latencyMs: null,
  });

  const overall = worstState(services.map((s) => s.state));

  return NextResponse.json({
    success: true,
    checkedAt: new Date().toISOString(),
    overall,
    checkedBy: { level: guard.access.level, userId: guard.access.userId, email: guard.access.email },
    services,
    counts: {
      online: services.filter((s) => s.state === 'ONLINE').length,
      degraded: services.filter((s) => s.state === 'DEGRADED').length,
      offline: services.filter((s) => s.state === 'OFFLINE').length,
      notConfigured: services.filter((s) => s.state === 'NOT_CONFIGURED').length,
    },
  });
}

function mapDbState(state: string): HealthState {
  switch (state) {
    case 'READY': return 'ONLINE';
    case 'TIMEOUT': return 'TIMEOUT';
    case 'CONFIGURATION_ERROR': return 'CONFIGURATION_ERROR';
    case 'AUTHENTICATION_FAILED': return 'UNAUTHORIZED';
    case 'ENDPOINT_UNAVAILABLE': return 'OFFLINE';
    default: return 'DATABASE_ERROR';
  }
}
