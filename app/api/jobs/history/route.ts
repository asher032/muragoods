import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JobShift from '@/app/lib/models/JobShift';
import { gameIdentity } from '@/app/lib/gameserver';
import { JOB_MAP } from '@/app/lib/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/jobs/history?limit=20 — consumed shifts, newest first.
export async function GET(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const limit = Math.max(1, Math.min(50, Number(new URL(req.url).searchParams.get('limit')) || 20));
    await dbConnect();
    const rows = await JobShift.find({ userEmail: id.emailLc, consumed: true })
      .sort({ consumedAt: -1 }).limit(limit)
      .select('jobId game won payout reason consumedAt')
      .lean() as Array<{
        jobId: string; game: string; won: boolean | null; payout: number | null;
        reason: string; consumedAt: Date;
      }>;
    return NextResponse.json({
      success: true,
      history: rows.map((r) => {
        const job = JOB_MAP[r.jobId];
        return {
          jobId: r.jobId,
          jobName: job?.name || r.jobId,
          icon: job?.icon || '💼',
          game: r.game,
          won: r.won,
          payout: r.payout,
          reason: r.reason || '',
          at: r.consumedAt,
        };
      }),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load history' }, { status: 500 });
  }
}
