import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JobShift from '@/app/lib/models/JobShift';
import JobProgress from '@/app/lib/models/JobProgress';
import { gameIdentity } from '@/app/lib/gameserver';
import { JOBS, promoLevelFor, fmtDuration, difficultyFor } from '@/app/lib/jobs';
import { jobsTuning } from '@/app/lib/jobs-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function dayStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// GET /api/jobs — full catalog with per-job live state: locked/unlock
// progress, today count vs daily limit, cooldown remaining, promotion.
export async function GET(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    await dbConnect();

    const [shifts, progress] = await Promise.all([
      JobShift.find({ userEmail: id.emailLc, consumed: true })
        .select('jobId consumedAt').lean<Array<{ jobId: string; consumedAt: Date }>>(),
      JobProgress.find({ userEmail: id.emailLc }).lean<Array<{
        jobId: string; successes: number; fails: number; totalShifts: number;
        consecutiveFails: number; firedCount: number;
      }>>(),
    ]);
    const progByJob: Record<string, { successes: number; fails: number; totalShifts: number; consecutiveFails: number; firedCount: number }> = {};
    for (const p of progress) {
      progByJob[p.jobId] = {
        successes: p.successes || 0, fails: p.fails || 0, totalShifts: p.totalShifts || 0,
        consecutiveFails: p.consecutiveFails || 0, firedCount: p.firedCount || 0,
      };
    }
    const totalCompleted = shifts.length;
    const todayStart = dayStart().getTime();
    const now = Date.now();
    const tuning = await jobsTuning();

    const jobs = JOBS.map((j) => {
      const prog = progByJob[j.id] || { successes: 0, fails: 0, totalShifts: 0, consecutiveFails: 0, firedCount: 0 };
      const unlocked = totalCompleted >= j.unlock;
      const today = shifts.filter((s) => s.jobId === j.id && new Date(s.consumedAt).getTime() >= todayStart).length;
      const dailyDone = today >= j.shiftsPerDay;
      const last = shifts
        .filter((s) => s.jobId === j.id)
        .map((s) => new Date(s.consumedAt).getTime())
        .sort((a, b) => b - a)[0];
      const cooldownSec = tuning.cooldownFor(j);
      const cooldownRemaining = last ? Math.max(0, Math.ceil(cooldownSec - (now - last) / 1000)) : 0;
      return {
        ...j,
        unlocked,
        disabled: tuning.disabledJobs.has(j.id),
        difficulty: difficultyFor(j),
        unlockProgress: Math.min(totalCompleted, j.unlock),
        today,
        dailyDone,
        cooldownSec,
        cooldownRemaining,
        cooldownLabel: cooldownRemaining > 0 ? fmtDuration(cooldownRemaining) : '',
        successes: prog.successes,
        promoLevel: promoLevelFor(prog.successes),
        promoBonusPct: Math.round(promoLevelFor(prog.successes) * 2),
        firedCount: prog.firedCount,
      };
    });

    return NextResponse.json({
      success: true,
      jobs,
      totalCompleted,
      jobIds: JOBS.map((j) => j.id),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load jobs' }, { status: 500 });
  }
}
