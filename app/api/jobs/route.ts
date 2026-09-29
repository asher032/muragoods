import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JobShift from '@/app/lib/models/JobShift';
import { gameIdentity } from '@/app/lib/gameserver';
import { JOBS, JOB_MAP, DEFAULT_JOB_COOLDOWN_SEC, fmtDuration } from '@/app/lib/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function jobsCooldownSec(): Promise<number> {
  try {
    await dbConnect();
    const { default: GameDefinition } = await import('@/app/lib/models/GameDefinition');
    const def = await GameDefinition.findOne({ gameId: 'jobs' }).select('config cooldownSec').lean() as {
      config?: { cooldownSec?: number }; cooldownSec?: number;
    } | null;
    const raw = def?.config?.cooldownSec ?? def?.cooldownSec ?? DEFAULT_JOB_COOLDOWN_SEC;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) ? Math.max(60, Math.min(86400, n)) : DEFAULT_JOB_COOLDOWN_SEC;
  } catch {
    return DEFAULT_JOB_COOLDOWN_SEC;
  }
}

// GET /api/jobs — catalog + live cooldown for the caller.
export async function GET(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    await dbConnect();
    const cooldownSec = await jobsCooldownSec();
    const last = await JobShift.findOne({ userEmail: id.emailLc, consumed: true })
      .sort({ consumedAt: -1 }).select('consumedAt').lean<{ consumedAt?: Date } | null>();
    let cooldownRemaining = 0;
    if (last?.consumedAt) {
      const wait = Math.ceil(cooldownSec - (Date.now() - new Date(last.consumedAt).getTime()) / 1000);
      cooldownRemaining = Math.max(0, wait);
    }
    return NextResponse.json({
      success: true,
      jobs: JOBS.map((j) => ({ ...j })),
      cooldownSec,
      cooldownRemaining,
      cooldownLabel: cooldownRemaining > 0 ? fmtDuration(cooldownRemaining) : '',
      jobIds: Object.keys(JOB_MAP),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load jobs' }, { status: 500 });
  }
}
