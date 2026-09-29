import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JobProgress from '@/app/lib/models/JobProgress';
import JobEmployment from '@/app/lib/models/JobEmployment';
import { gameIdentity } from '@/app/lib/gameserver';
import { JOB_MAP } from '@/app/lib/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/jobs/resign { jobId } — leave a job: its promotion progress is
// wiped (bonuses stop immediately and must be re-earned) and, if it was
// the ACTIVE job, employment ends (job → NONE: no shifts, no payouts until
// a new application). Work history in job_shifts is never deleted.
export async function POST(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const job = JOB_MAP[String(body.jobId || '')];
    if (!job) return NextResponse.json({ success: false, error: 'Unknown job' }, { status: 404 });
    await dbConnect();
    const res = await JobProgress.deleteOne({ userEmail: id.emailLc, jobId: job.id });
    // Leaving your ACTIVE job ends employment (resigning an old, non-active
    // job's leftover progress must not touch the current one).
    const cleared = await JobEmployment.deleteOne({ userEmail: id.emailLc, jobId: job.id });
    return NextResponse.json({
      success: true,
      resigned: res.deletedCount > 0 || cleared.deletedCount > 0,
      unemployed: cleared.deletedCount > 0,
      message: cleared.deletedCount > 0
        ? `Resigned from ${job.name} — employment ended, promotion progress reset. Apply for a job before working again.`
        : `Resigned from ${job.name} — promotion progress reset.`,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not resign' }, { status: 500 });
  }
}
