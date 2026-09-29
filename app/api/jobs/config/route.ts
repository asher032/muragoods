import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import { requireAdmin } from '@/app/lib/session';
import { DEFAULT_JOB_COOLDOWN_SEC, fmtDuration } from '@/app/lib/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin jobs tuning (currently: shift cooldown). Players read the effective
// value from GET /api/jobs; this endpoint is the only writer.
export async function GET() {
  try {
    await dbConnect();
    const { default: GameDefinition } = await import('@/app/lib/models/GameDefinition');
    const def = await GameDefinition.findOne({ gameId: 'jobs' }).select('config cooldownSec enabled').lean() as {
      config?: { cooldownSec?: number }; cooldownSec?: number; enabled?: boolean;
    } | null;
    const raw = def?.config?.cooldownSec ?? def?.cooldownSec ?? DEFAULT_JOB_COOLDOWN_SEC;
    const n = Math.floor(Number(raw));
    return NextResponse.json({
      success: true,
      cooldownSec: Number.isFinite(n) ? Math.max(60, Math.min(86400, n)) : DEFAULT_JOB_COOLDOWN_SEC,
      enabled: def?.enabled !== false,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load jobs config' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { response } = await requireAdmin(req);
  if (response) return response;
  try {
    const body = await req.json().catch(() => ({}));
    const update: { cooldownSec?: number; enabled?: boolean } = {};
    if (body.cooldownSec !== undefined) {
      const n = Math.floor(Number(body.cooldownSec));
      if (!Number.isFinite(n) || n < 60 || n > 86400) {
        return NextResponse.json({ success: false, error: 'Cooldown must be 60–86400 seconds' }, { status: 400 });
      }
      update.cooldownSec = n;
    }
    if (body.enabled !== undefined) update.enabled = Boolean(body.enabled);
    if (!Object.keys(update).length) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }
    await dbConnect();
    const { default: GameDefinition } = await import('@/app/lib/models/GameDefinition');
    await GameDefinition.updateOne(
      { gameId: 'jobs' },
      {
        $set: {
          ...(update.cooldownSec !== undefined ? { 'config.cooldownSec': update.cooldownSec, cooldownSec: update.cooldownSec } : {}),
          ...(update.enabled !== undefined ? { enabled: update.enabled } : {}),
        },
        $setOnInsert: { gameId: 'jobs', title: 'Jobs', category: 'activities', route: '/jobs' },
      },
      { upsert: true },
    );
    return NextResponse.json({
      success: true,
      cooldownLabel: update.cooldownSec !== undefined ? fmtDuration(update.cooldownSec) : undefined,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not save jobs config' }, { status: 500 });
  }
}
