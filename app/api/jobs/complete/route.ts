import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import JobShift from '@/app/lib/models/JobShift';
import { gameIdentity } from '@/app/lib/gameserver';
import { JOB_MAP, validateAttempt, rollPayout, fmtCoins, type JobChallenge } from '@/app/lib/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/jobs/complete { token, clicks?, pick?, elapsedMs?, reactedEarly? }
// The ONLY payout path. Consumes the shift atomically first (replay-proof),
// validates the attempt against the server-stored challenge, rolls the
// payout server-side, and credits the existing coin balance.
export async function POST(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '');
    if (!token) return NextResponse.json({ success: false, error: 'Shift token required' }, { status: 400 });

    await dbConnect();
    // Atomic consume: only the first redeem of this token wins. Duplicate
    // submits (double-clicks, replays) land here as 409s with no payout.
    const shift = await JobShift.findOneAndUpdate(
      { token, userEmail: id.emailLc, consumed: false, expiresAt: { $gt: new Date() } },
      { $set: { consumed: true, consumedAt: new Date() } },
      { new: true },
    ).lean() as {
      jobId: string; game: string; challenge: JobChallenge;
      payMin: number; payMax: number; failMin: number; failMax: number;
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

    const verdict = validateAttempt(job, shift.challenge as JobChallenge, {
      clicks: Array.isArray(body.clicks) ? body.clicks.slice(0, 32) : undefined,
      pick: body.pick,
      elapsedMs: body.elapsedMs,
      reactedEarly: body.reactedEarly === true,
    }, Date.now());

    const payout = rollPayout(job, verdict.won);
    const now = new Date();
    await JobShift.updateOne(
      { token },
      { $set: { won: verdict.won, payout, reason: verdict.reason } },
    );

    // Credit the existing site balance atomically + ledger row (idempotent
    // on the shift token, so a retried complete can never double-pay).
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

    return NextResponse.json({
      success: true,
      won: verdict.won,
      reason: verdict.reason,
      payout,
      payoutLabel: fmtCoins(payout),
      balance: user?.coinBalance ?? null,
      job: { id: job.id, name: job.name, icon: job.icon, game: job.game },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not complete shift' }, { status: 500 });
  }
}
