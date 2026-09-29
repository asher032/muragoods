import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JobProgress from '@/app/lib/models/JobProgress';
import { gameIdentity } from '@/app/lib/gameserver';
import { JOB_MAP } from '@/app/lib/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/jobs/resign { jobId } — leave a job: its promotion progress is
// wiped (bonuses stop immediately and must be re-earned). Work history in
// job_shifts is never deleted.
export async function POST(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const job = JOB_MAP[String(body.jobId || '')];
    if (!job) return NextResponse.json({ success: false, error: 'Unknown job' }, { status: 404 });
    await dbConnect();
    const res = await JobProgress.deleteOne({ userEmail: id.emailLc, jobId: job.id });
    return NextResponse.json({
      success: true,
      resigned: res.deletedCount > 0,
      message: `Resigned from ${job.name} — promotion progress reset.`,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not resign' }, { status: 500 });
  }
}
