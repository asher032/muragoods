import { NextResponse } from 'next/server';
import { probeDatabase } from '@/app/lib/db-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/health — lightweight service health for uptime monitors,
// Vercel cron keep-alive pings and the bot's keep-alive loop.
// Returns 200 when core dependencies respond, 503 when degraded.
//
// `database` stays a simple online/offline flag (the dashboard maps it that
// way) while `databaseDetail` carries a safe, classified reason
// (READY / CONFIGURATION_ERROR / AUTHENTICATION_FAILED / ENDPOINT_UNAVAILABLE /
// TIMEOUT / DATABASE_UNAVAILABLE) that never includes the connection string.
export async function GET() {
  const health = await probeDatabase();
  const ok = health.state === 'READY';

  return NextResponse.json(
    {
      ok,
      service: 'muragoods-site',
      database: health.database,
      databaseDetail: health.detail,
      responseTimeMs: health.responseTimeMs,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
