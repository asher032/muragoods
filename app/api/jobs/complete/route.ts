import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import JobShift from '@/app/lib/models/JobShift';
import JobProgress from '@/app/lib/models/JobProgress';
import { gameIdentity } from '@/app/lib/gameserver';
import {
  JOB_MAP, validateAttempt, failPayout, successPayout,
  promoLevelFor, FIRED_STREAK, fmtCoins,
} from '@/app/lib/jobs';
import { jobsTuning } from '@/app/lib/jobs-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/jobs/complete { token, clicks?, pick?, elapsedMs?, reactedEarly? }
// The ONLY payout path. Atomic consume first (replay-proof), server-side
// validation, EXACT salary on success (+promotion bonus), configured
// sub-par pay on failure. Progression updated + firing checked.
export async function POST(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '');
    if (!token) return NextResponse.json({ success: false, error: 'Shift token required' }, { status: 400 });

    await dbConnect();
    const shift = await JobShift.findOneAndUpdate(
      { token, userEmail: id.emailLc, consumed: false, expiresAt: { $gt: new Date() } },
      { $set: { consumed: true, consumedAt: new Date() } },
      { new: true },
    ).lean() as {
      jobId: string; game: string; challenge: Parameters<typeof validateAttempt>[1];
    } | null;
    if (!shift) {
      return NextResponse.json(
        { success: false, error: 'Shift expired, already completed, or belongs to another shift' },
        { status: 409 },
      );
    }

    const job = JOB_MAP[shift.jobId];
    if (!job) {
      return NextResponse.json({ success: false, error: 'Unknown job on this shift' }, { status: 410 });
    }

    const tuning = await jobsTuning();
    const verdict = validateAttempt(job, shift.challenge, {
      clicks: Array.isArray(body.clicks) ? body.clicks.slice(0, 32) : undefined,
      pick: body.pick,
      elapsedMs: body.elapsedMs,
      reactedEarly: body.reactedEarly === true,
    }, Date.now());

    // Progression (server-side counters — the client can fake nothing).
    const prog = await JobProgress.findOneAndUpdate(
      { userEmail: id.emailLc, jobId: job.id },
      { $setOnInsert: { successes: 0, fails: 0, totalShifts: 0, consecutiveFails: 0, firedCount: 0 } },
      { upsert: true, new: true },
    ).lean() as { successes: number; fails: number; totalShifts: number; consecutiveFails: number; firedCount: number };
    const successes = prog.successes || 0;
    const payout = verdict.won
      ? successPayout(job, successes)
      : failPayout(job.salary, tuning.failRate);

    const now = new Date();
    if (verdict.won) {
      await JobProgress.updateOne(
        { userEmail: id.emailLc, jobId: job.id },
        { $inc: { successes: 1, totalShifts: 1 }, $set: { consecutiveFails: 0, updatedAt: now } },
      );
    } else {
      const consecutive = (prog.consecutiveFails || 0) + 1;
      if (consecutive >= FIRED_STREAK) {
        // Fired: promotion progress for THIS job is wiped; history stays.
        await JobProgress.updateOne(
          { userEmail: id.emailLc, jobId: job.id },
          { $set: { successes: 0, consecutiveFails: 0, updatedAt: now }, $inc: { fails: 1, totalShifts: 1, firedCount: 1 } },
        );
      } else {
        await JobProgress.updateOne(
          { userEmail: id.emailLc, jobId: job.id },
          { $inc: { fails: 1, totalShifts: 1 }, $set: { consecutiveFails: consecutive, updatedAt: now } },
        );
      }
    }
    const fired = !verdict.won && (prog.consecutiveFails || 0) + 1 >= FIRED_STREAK;

    await JobShift.updateOne(
      { token },
      { $set: { won: verdict.won, payout, reason: verdict.reason } },
    );

    const { default: GameReward } = await import('@/app/lib/models/GameReward');
    try {
      await GameReward.create({
        idempotencyKey: `job:${id.emailLc}:${token}:coins`,
        userEmail: id.emailLc, discordId: id.discordId,
        gameId: `job:${job.id}`, kind: 'coins', amount: payout,
        label: `${job.name} shift (${verdict.won ? 'success' : 'failed'})`, createdAt: now,
      });
    } catch (e) {
      const dup = e instanceof Error && /E11000|duplicate/i.test(e.message);
      if (dup) {
        return NextResponse.json({ success: false, error: 'Reward already granted for this shift' }, { status: 409 });
      }
      throw e;
    }
    await User.updateOne(
      { email: id.email },
      {
        $inc: { coinBalance: payout },
        $push: {
          coinHistory: {
            $each: [{ type: 'earn', amount: payout, label: `${job.name} shift`, date: now }],
            $slice: -200,
          },
        },
      },
    );
    const user = await User.findOne({ email: id.email }).select('coinBalance').lean<{ coinBalance?: number } | null>();
    const fresh = (await JobProgress.findOne({ userEmail: id.emailLc, jobId: job.id })
      .select('successes').lean()) as unknown as { successes?: number } | null;

    return NextResponse.json({
      success: true,
      won: verdict.won,
      reason: verdict.reason,
      payout,
      payoutLabel: fmtCoins(payout),
      balance: user?.coinBalance ?? null,
      fired,
      promoLevel: promoLevelFor(fresh?.successes || 0),
      job: { id: job.id, name: job.name, icon: job.icon, game: job.game },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not complete shift' }, { status: 500 });
  }
}
