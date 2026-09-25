import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_HEALTH_URL = 'https://murastream-bot-pf11.onrender.com/health';
const DISCORD_API_URL = 'https://discord.com/api/v10';
const DEFAULT_TIMEOUT_MS = 5000;

type HealthStatus = 'ok' | 'degraded' | 'offline';

interface ServiceHealth {
  status: HealthStatus;
  responseTime: number;
  lastCheck: string;
}

type ServiceCheck = (response: Response) => HealthStatus | Promise<HealthStatus>;

function getTimeoutMs(): number {
  const configured = Number.parseInt(process.env.STATUS_CHECK_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 30000) : DEFAULT_TIMEOUT_MS;
}

// The SITE's own liveness. This must be the public /api/health, NOT
// /api/dashboard/health: the latter requires a session cookie
// (`sessionToken()` -> 401 "Discord token required"), and this probe runs
// server-side with no cookies, so it returned 401 every single time and pinned
// `dashboardBackend` to 'degraded' forever — which in turn forced the whole
// aggregate to 'degraded' and made the dashboard label the BOT as degraded
// while `botGateway` was measurably ok.
function getSiteHealthUrl(request: NextRequest): string {
  const configured = process.env.DASHBOARD_HEALTH_URL?.trim();
  if (configured) return configured;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) return new URL('/api/health', siteUrl).toString();

  return new URL('/api/health', request.url).toString();
}

// ── The bot's own, really-measured state ────────────────────────────────
// Everything below comes from fields the bot actually measures (heartbeat-ACK
// clock, ffmpeg execution, HTTP probes). Nothing here is inferred client-side.
interface BotDetail {
  ok: boolean | null;
  latency: number | null;
  uptimeSeconds: number | null;
  lastHeartbeat: string | null;
  reconnectCount: number | null;
  gateway: {
    alive: boolean | null;
    heartbeatAgeSeconds: number | null;
    staleAfterSeconds: number | null;
  } | null;
  subsystems: Record<string, string>;
  ffmpeg: boolean | null;
  opus: { loaded: boolean | null; status: string | null; lib: string | null } | null;
  voiceBackend: { davey: boolean | null } | null;
  guilds: number | null;
  databaseDetail: { configured: boolean | null; errorClass: string | null; hint: string | null } | null;
  user: { username: string | null; avatarUrl: string | null; applicationId: string | number | null } | null;
  connectionState: string | null;
  lastApiCheck: { at: string | null; latencyMs: number | null; reachable: boolean | null } | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function fetchBotDetail(timeoutMs: number): Promise<BotDetail | null> {
  try {
    const response = await fetchWithTimeout(BOT_HEALTH_URL, timeoutMs);
    // Deliberately not gated on response.ok: the bot returns 503 when it
    // reports itself unhealthy, and that body is still a full, real payload.
    // Discarding it was why the dashboard could not show WHY it was unhealthy.
    const body = asRecord(await response.json());
    if (!body) return null;
    const gateway = asRecord(body.gateway);
    const detail = asRecord(body.database_detail);
    const subsystems = asRecord(body.subsystems);
    const user = asRecord(body.user);
    const apiCheck = asRecord(body.last_api_check);
    const opus = asRecord(body.opus);
    const voiceBackend = asRecord(body.voice_backend);
    return {
      ok: typeof body.ok === 'boolean' ? body.ok : null,
      latency: num(body.latency),
      uptimeSeconds: num(body.uptime_seconds),
      lastHeartbeat: typeof body.last_heartbeat === 'string' ? body.last_heartbeat : null,
      reconnectCount: num(body.reconnect_count),
      user: user
        ? {
            username: typeof user.username === 'string' ? user.username : null,
            avatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : null,
            applicationId:
              typeof user.application_id === 'string' || typeof user.application_id === 'number'
                ? user.application_id
                : null,
          }
        : null,
      connectionState: typeof body.connection_state === 'string' ? body.connection_state : null,
      lastApiCheck: apiCheck
        ? {
            at: typeof apiCheck.at === 'string' ? apiCheck.at : null,
            latencyMs: num(apiCheck.latency_ms),
            reachable: typeof apiCheck.reachable === 'boolean' ? apiCheck.reachable : null,
          }
        : null,
      gateway: gateway
        ? {
            alive: typeof gateway.alive === 'boolean' ? gateway.alive : null,
            heartbeatAgeSeconds: num(gateway.heartbeat_age_seconds),
            staleAfterSeconds: num(gateway.stale_after_seconds),
          }
        : null,
      subsystems: Object.fromEntries(
        Object.entries(subsystems ?? {}).map(([k, v]) => [k, String(v)]),
      ),
      ffmpeg: typeof body.ffmpeg === 'boolean' ? body.ffmpeg : null,
      opus: opus
        ? {
            loaded: typeof opus.loaded === 'boolean' ? opus.loaded : null,
            status: typeof opus.status === 'string' ? opus.status : null,
            lib: typeof opus.lib === 'string' ? opus.lib : null,
          }
        : null,
      voiceBackend: voiceBackend
        ? { davey: typeof voiceBackend.davey === 'boolean' ? voiceBackend.davey : null }
        : null,
      guilds: num(body.guilds),
      databaseDetail: detail
        ? {
            configured: typeof detail.configured === 'boolean' ? detail.configured : null,
            errorClass: typeof detail.error_class === 'string' ? detail.error_class : null,
            hint: typeof detail.hint === 'string' ? detail.hint : null,
          }
        : null,
    };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function checkHttpService(
  url: string,
  timeoutMs: number,
  check: ServiceCheck,
): Promise<ServiceHealth> {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    return {
      status: await check(response),
      responseTime: Date.now() - startedAt,
      lastCheck: new Date().toISOString(),
    };
  } catch {
    return {
      status: 'offline',
      responseTime: Date.now() - startedAt,
      lastCheck: new Date().toISOString(),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHealthyPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.ok === true || value.status === 'ok' || value.status === 'online';
}

async function checkDashboardBackend(request: NextRequest, timeoutMs: number): Promise<ServiceHealth> {
  return checkHttpService(
    getSiteHealthUrl(request),
    timeoutMs,
    async (response) => {
      if (!response.ok) return 'degraded';

      try {
        return isHealthyPayload(await response.json()) ? 'ok' : 'degraded';
      } catch {
        return 'degraded';
      }
    },
  );
}

async function checkBotGateway(timeoutMs: number): Promise<ServiceHealth> {
  return checkHttpService(
    BOT_HEALTH_URL,
    timeoutMs,
    async (response) => {
      if (!response.ok) return 'degraded';

      try {
        return isHealthyPayload(await response.json()) ? 'ok' : 'degraded';
      } catch {
        return 'degraded';
      }
    },
  );
}

async function checkDiscordApi(timeoutMs: number): Promise<ServiceHealth> {
  return checkHttpService(DISCORD_API_URL, timeoutMs, (response) => (
    response.ok || response.status === 401 ? 'ok' : 'degraded'
  ));
}

async function checkDatabase(timeoutMs: number): Promise<ServiceHealth> {
  const startedAt = Date.now();

  try {
    await withTimeout(
      (async () => {
        const collection = await discordConfigCollection();
        await collection.estimatedDocumentCount();
      })(),
      timeoutMs,
      'Database health check timed out',
    );

    return {
      status: 'ok',
      responseTime: Date.now() - startedAt,
      lastCheck: new Date().toISOString(),
    };
  } catch {
    return {
      status: 'offline',
      responseTime: Date.now() - startedAt,
      lastCheck: new Date().toISOString(),
    };
  }
}

export async function GET(request: NextRequest) {
  const timeoutMs = getTimeoutMs();
  const [dashboardBackend, botGateway, discordApi, database, bot] = await Promise.all([
    checkDashboardBackend(request, timeoutMs),
    checkBotGateway(timeoutMs),
    checkDiscordApi(timeoutMs),
    checkDatabase(timeoutMs),
    fetchBotDetail(timeoutMs),
  ]);

  const services = [dashboardBackend, botGateway, discordApi, database];
  const status: HealthStatus = services.some((service) => service.status === 'offline')
    ? 'offline'
    : services.some((service) => service.status === 'degraded')
      ? 'degraded'
      : 'ok';

  // The BOT's own status, derived from the bot alone. The aggregate above
  // includes the site's backend, Discord's API and the site's database, so
  // labelling that aggregate "Bot" reported the website's health as the bot's
  // — the pill read "Bot Degraded" while botGateway was ok.
  const botStatus: HealthStatus = bot === null
    ? 'offline'
    : bot.gateway?.alive === false || bot.ok === false
      ? 'degraded'
      : 'ok';

  return NextResponse.json({
    status,
    botStatus,
    checkedAt: new Date().toISOString(),
    bot,
    services: {
      dashboardBackend,
      botGateway,
      discordApi,
      database,
    },
  });
}
