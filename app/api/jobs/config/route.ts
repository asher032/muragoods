import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import { requireAdmin } from '@/app/lib/session';
import { DEFAULT_FAIL_RATE, JOBS } from '@/app/lib/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_IDS = new Set(JOBS.map((j) => j.id));

// Admin jobs tuning: failure rate, per-job cooldown overrides, disabled
// jobs, master switch. Players read effective values from /api/jobs.
export async function GET() {
  try {
    await dbConnect();
    const { default: GameDefinition } = await import('@/app/lib/models/GameDefinition');
    const def = await GameDefinition.findOne({ gameId: 'jobs' }).select('config enabled').lean() as {
      config?: { failRate?: number; cooldownOverrides?: Record<string, number>; disabledJobs?: string[] };
      enabled?: boolean;
    } | null;
    const raw = Number(def?.config?.failRate);
    return NextResponse.json({
      success: true,
      failRate: Number.isFinite(raw) ? Math.max(0.05, Math.min(0.9, raw)) : DEFAULT_FAIL_RATE,
      cooldownOverrides: (def?.config?.cooldownOverrides && typeof def.config.cooldownOverrides === 'object')
        ? def.config.cooldownOverrides : {},
      disabledJobs: Array.isArray(def?.config?.disabledJobs) ? def.config.disabledJobs : [],
      enabled: def?.enabled !== false,
      jobs: JOBS.map((j) => ({ id: j.id, name: j.name, cooldownMin: j.cooldownMin })),
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
    const set: Record<string, unknown> = {};
    if (body.failRate !== undefined) {
      const n = Number(body.failRate);
      if (!Number.isFinite(n) || n < 0.05 || n > 0.9) {
        return NextResponse.json({ success: false, error: 'failRate must be 0.05–0.9 (always below salary)' }, { status: 400 });
      }
      set['config.failRate'] = n;
    }
    if (body.cooldownOverrides !== undefined) {
      const ov = body.cooldownOverrides as Record<string, unknown>;
      if (!ov || typeof ov !== 'object' || Array.isArray(ov)) {
        return NextResponse.json({ success: false, error: 'cooldownOverrides must be an object' }, { status: 400 });
      }
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(ov).slice(0, 60)) {
        const n = Math.floor(Number(v));
        if (JOB_IDS.has(k) && Number.isFinite(n) && n >= 60 && n <= 86400) clean[k] = n;
      }
      set['config.cooldownOverrides'] = clean;
    }
    if (body.disabledJobs !== undefined) {
      if (!Array.isArray(body.disabledJobs)) {
        return NextResponse.json({ success: false, error: 'disabledJobs must be an array' }, { status: 400 });
      }
      set['config.disabledJobs'] = body.disabledJobs.filter((s: unknown) => JOB_IDS.has(String(s))).map(String).slice(0, 60);
    }
    if (body.enabled !== undefined) set.enabled = Boolean(body.enabled);
    if (!Object.keys(set).length) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }
    await dbConnect();
    const { default: GameDefinition } = await import('@/app/lib/models/GameDefinition');
    await GameDefinition.updateOne(
      { gameId: 'jobs' },
      { $set: set, $setOnInsert: { gameId: 'jobs', title: 'Jobs', category: 'activities', route: '/jobs' } },
      { upsert: true },
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not save jobs config' }, { status: 500 });
  }
}
