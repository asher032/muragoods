import crypto from 'crypto';
import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JobShift from '@/app/lib/models/JobShift';
import JobEmployment from '@/app/lib/models/JobEmployment';
import { gameIdentity } from '@/app/lib/gameserver';
import { JOB_MAP, generateChallenge, fmtDuration } from '@/app/lib/jobs';
import { jobsTuning } from '@/app/lib/jobs-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function dayStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// POST /api/jobs/start { jobId } — opens a shift WITHOUT paying. Enforces,
// server-side: unlocks, daily limits, per-job cooldowns, one live shift.
export async function POST(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const job = JOB_MAP[String(body.jobId || '')];
    if (!job) return NextResponse.json({ success: false, error: 'Unknown job' }, { status: 404 });

    await dbConnect();
    const tuning = await jobsTuning();
    if (tuning.disabledJobs.has(job.id)) {
      return NextResponse.json({ success: false, error: 'That job is currently closed' }, { status: 403 });
    }
    if (tuning.enabled === false) {
      return NextResponse.json({ success: false, error: 'Jobs are in maintenance' }, { status: 403 });
    }

    const consumed = await JobShift.find({ userEmail: id.emailLc, consumed: true })
      .select('jobId consumedAt').lean() as Array<{ jobId: string; consumedAt: Date }>;
    const totalCompleted = consumed.length;

    // Unlock: global completed-shift count vs the table requirement.
    // Checked before employment so a locked job still reports LOCKED
    // (progress) rather than the employment error.
    if (totalCompleted < job.unlock) {
      return NextResponse.json({
        success: false, code: 'LOCKED',
        error: `Requires ${job.unlock} completed shifts`,
        required: job.unlock, progress: totalCompleted,
      }, { status: 403 });
    }

    // Employment gate: only the ACTIVE job can be worked — checked here
    // (before the mini-game can start) and again at completion.
    const employment = await JobEmployment.findOne({ userEmail: id.emailLc }).select('jobId').lean() as {
      jobId?: string;
    } | null;
    if (!employment?.jobId || employment.jobId !== job.id) {
      return NextResponse.json({
        success: false,
        code: 'NO_JOB',
        error: employment?.jobId
          ? `You work as ${JOB_MAP[employment.jobId]?.name || employment.jobId} — apply for ${job.name} to work it.`
          : "❌ You don't have a job! Apply for a job first before you can start a shift.",
        activeJobId: employment?.jobId || null,
      }, { status: 403 });
    }

    // Daily limit for THIS job (UTC day, server-side).
    const today = consumed.filter(
      (s) => s.jobId === job.id && new Date(s.consumedAt).getTime() >= dayStart().getTime(),
    ).length;
    if (today >= job.shiftsPerDay) {
      return NextResponse.json({
        success: false, code: 'DAILY_DONE',
        error: 'Daily shifts complete — come back tomorrow',
        today, limit: job.shiftsPerDay,
      }, { status: 429 });
    }

    // Per-job cooldown from the last completed shift of this job.
    const cooldownSec = tuning.cooldownFor(job);
    const lastTimes = consumed
      .filter((s) => s.jobId === job.id)
      .map((s) => new Date(s.consumedAt).getTime())
      .sort((a, b) => b - a);
    if (lastTimes.length) {
      const wait = Math.ceil(cooldownSec - (Date.now() - lastTimes[0]) / 1000);
      if (wait > 0) {
        return NextResponse.json({
          success: false, code: 'COOLDOWN',
          error: `You can work again in ${fmtDuration(wait)}`,
          cooldownRemaining: wait,
        }, { status: 429 });
      }
    }

    // One live shift at a time (prevents shift farming across tabs).
    const live = await JobShift.findOne({ userEmail: id.emailLc, consumed: false, expiresAt: { $gt: new Date() } })
      .select('token').lean();
    if (live) {
      return NextResponse.json({ success: false, error: 'Finish your current shift first' }, { status: 409 });
    }

    const nowMs = Date.now();
    const challenge = generateChallenge(job, nowMs);
    const token = `job_${crypto.randomBytes(16).toString('hex')}`;
    const shift = await JobShift.create({
      token,
      userEmail: id.emailLc,
      jobId: job.id,
      game: job.game,
      challenge,
      payMin: job.salary,
      payMax: job.salary,
      failMin: 0,
      failMax: 0,
      expiresAt: new Date(nowMs + 45000),
    });

    // Display payload only — answers (answer/correct) never leave the server.
    // Memory icons ARE shown (the client hides them before input).
    const { deadlineAt } = challenge;
    const display = (() => {
      switch (job.game) {
        case 'order': return {
          game: job.game, labels: challenge.labels,
          ticket: (job.flavor.items || []).slice(0, (challenge.answer || []).length), deadlineAt,
        };
        case 'memory': return { game: job.game, icons: challenge.icons, pool: challenge.pool, deadlineAt };
        case 'choice': return { game: job.game, question: challenge.question, options: challenge.options, deadlineAt };
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
