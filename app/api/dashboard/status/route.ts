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

function getDashboardHealthUrl(request: NextRequest): string {
  const configured = process.env.DASHBOARD_HEALTH_URL?.trim();
  if (configured) return configured;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) return new URL('/api/dashboard/health', siteUrl).toString();

  return new URL('/api/dashboard/health', request.url).toString();
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
    getDashboardHealthUrl(request),
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
  const [dashboardBackend, botGateway, discordApi, database] = await Promise.all([
    checkDashboardBackend(request, timeoutMs),
    checkBotGateway(timeoutMs),
    checkDiscordApi(timeoutMs),
    checkDatabase(timeoutMs),
  ]);

  const services = [dashboardBackend, botGateway, discordApi, database];
  const status: HealthStatus = services.some((service) => service.status === 'offline')
    ? 'offline'
    : services.some((service) => service.status === 'degraded')
      ? 'degraded'
      : 'ok';

  return NextResponse.json({
    status,
    checkedAt: new Date().toISOString(),
    services: {
      dashboardBackend,
      botGateway,
      discordApi,
      database,
    },
  });
}
