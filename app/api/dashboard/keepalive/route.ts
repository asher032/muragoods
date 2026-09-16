import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/dashboard/keepalive — keep-alive monitor data recorded by the
// Vercel cron job (server-side, survives browser closure). No auth on the
// aggregated view: it exposes no guild data, only health booleans.
export async function GET(_req: NextRequest) {
  try {
    const collection = await discordConfigCollection();
    const doc = await collection.findOne({ guildId: '__keepalive__' });
    const history = ((doc?.keepaliveHistory as Array<Record<string, unknown>>) || [])
      .slice(-50)
      .reverse();
    const last = doc?.lastKeepalive as Record<string, unknown> | undefined;
    const okCount = history.filter((h) => h.ok === true).length;
    const failCount = history.filter((h) => h.ok !== true).length;
    const lastFailure = history.find((h) => h.ok !== true) || null;

    return NextResponse.json({
      success: true,
      last: last
        ? {
            ok: last.ok,
            dbOk: last.dbOk,
            botOk: last.botOk,
            botStatus: last.botStatus,
            botLatencyMs: last.botLatencyMs,
            detail: last.detail,
            at: last.at instanceof Date ? last.at.toISOString() : String(last.at),
          }
        : null,
      schedule: 'every 10 minutes (Vercel Cron)',
      intervalMinutes: 10,
      nextRunHint: '~every 10 minutes from the last run',
      totals: {
        checks: history.length,
        ok: okCount,
        failed: failCount,
        lastFailure: lastFailure
          ? {
              at: lastFailure.at instanceof Date ? lastFailure.at.toISOString() : String(lastFailure.at),
              detail: lastFailure.detail,
              botStatus: lastFailure.botStatus,
            }
          : null,
      },
      history: history.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Database unavailable: ${String(err).slice(0, 120)}` },
      { status: 503 },
    );
  }
}
