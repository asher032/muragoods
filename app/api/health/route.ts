import { NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/health — lightweight service health for uptime monitors,
// Vercel cron keep-alive pings and the bot's keep-alive loop.
// Returns 200 when core dependencies respond, 503 when degraded.
export async function GET() {
  const startedAt = Date.now();
  let database = 'offline';

  try {
    const collection = await discordConfigCollection();
    await collection.estimatedDocumentCount();
    database = 'online';
  } catch {
    database = 'offline';
  }

  const ok = database === 'online';
  return NextResponse.json(
    {
      ok,
      service: 'muragoods-site',
      database,
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
