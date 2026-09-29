import crypto from 'crypto';
import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JobShift from '@/app/lib/models/JobShift';
import { gameIdentity } from '@/app/lib/gameserver';
import { JOB_MAP, generateChallenge, DEFAULT_JOB_COOLDOWN_SEC, fmtDuration } from '@/app/lib/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/jobs/start { jobId } — opens a shift WITHOUT paying. The payout
// only happens in /complete after the minigame is actually validated.
export async function POST(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const job = JOB_MAP[String(body.jobId || '')];
    if (!job) return NextResponse.json({ success: false, error: 'Unknown job' }, { status: 404 });

    await dbConnect();
    const { default: GameDefinition } = await import('@/app/lib/models/GameDefinition');
    const def = await GameDefinition.findOne({ gameId: 'jobs' }).select('config cooldownSec enabled').lean() as {
      config?: { cooldownSec?: number }; cooldownSec?: number; enabled?: boolean;
    } | null;
    if (def?.enabled === false) {
      return NextResponse.json({ success: false, error: 'Jobs are in maintenance' }, { status: 403 });
    }
    const rawCd = def?.config?.cooldownSec ?? def?.cooldownSec ?? DEFAULT_JOB_COOLDOWN_SEC;
    const nCd = Math.floor(Number(rawCd));
    const cooldownSec = Number.isFinite(nCd) ? Math.max(60, Math.min(86400, nCd)) : DEFAULT_JOB_COOLDOWN_SEC;

    // Cooldown is measured from the last COMPLETED shift.
    const last = await JobShift.findOne({ userEmail: id.emailLc, consumed: true })
      .sort({ consumedAt: -1 }).select('consumedAt').lean<{ consumedAt?: Date } | null>();
    if (last?.consumedAt) {
      const wait = Math.ceil(cooldownSec - (Date.now() - new Date(last.consumedAt).getTime()) / 1000);
      if (wait > 0) {
        return NextResponse.json(
          { success: false, error: `You can work again in ${fmtDuration(wait)}`, cooldownRemaining: wait },
          { status: 429 },
        );
      }
    }

    // One live shift at a time: an abandoned modal must expire or finish
    // before a new one opens (prevents shift farming).
    const live = await JobShift.findOne({ userEmail: id.emailLc, consumed: false, expiresAt: { $gt: new Date() } })
      .select('token').lean();
    if (live) {
      return NextResponse.json({ success: false, error: 'Finish your current shift first' }, { status: 409 });
    }

    const nowMs = Date.now();
    const challenge = generateChallenge(job, nowMs, job.timeSec);
    const token = `job_${crypto.randomBytes(16).toString('hex')}`;
    const shift = await JobShift.create({
      token,
      userEmail: id.emailLc,
      jobId: job.id,
      game: job.game,
      challenge,
      payMin: job.payMin,
      payMax: job.payMax,
      failMin: job.failMin,
      failMax: job.failMax,
      expiresAt: new Date(nowMs + job.timeSec * 1000 + 15000),
    });

    // The client gets the display challenge only — the expected answer is
    // verified server-side in /complete from this same document.
    const { deadlineAt } = challenge;
    const display = (() => {
      switch (job.game) {
        case 'order': return { game: job.game, sequence: challenge.sequence, deadlineAt };
        case 'memory': return { game: job.game, icons: challenge.icons, deadlineAt };
        case 'choice': return { game: job.game, options: challenge.options, deadlineAt };
        // The zone is shown so the shift is playable; the stop moment is
        // still validated server-side against this stored zone.
        case 'timing': return { game: job.game, zone: challenge.zone, periodMs: challenge.periodMs, deadlineAt };
        case 'reaction': return { game: job.game, delayMs: challenge.delayMs, windowMs: challenge.windowMs, deadlineAt };
      }
    })();
    return NextResponse.json({
      success: true,
      token: shift.token,
      job: { ...job },
      challenge: display,
      serverNow: nowMs,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not start shift' }, { status: 500 });
  }
}
