import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JobShift from '@/app/lib/models/JobShift';
import JobEmployment from '@/app/lib/models/JobEmployment';
import { gameIdentity } from '@/app/lib/gameserver';
import { JOB_MAP } from '@/app/lib/jobs';
import { jobsTuning } from '@/app/lib/jobs-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/jobs/apply { jobId } — become employed in an unlocked job.
// Switching jobs preserves the old job's progression; only resign/firing
// resets promotion progress.
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
    const totalCompleted = await JobShift.countDocuments({ userEmail: id.emailLc, consumed: true });
    if (totalCompleted < job.unlock) {
      return NextResponse.json({
        success: false, code: 'LOCKED',
        error: `Requires ${job.unlock} completed shifts`,
        required: job.unlock, progress: totalCompleted,
      }, { status: 403 });
    }

    const now = new Date();
    const existing = await JobEmployment.findOne({ userEmail: id.emailLc }).select('jobId').lean() as {
      jobId?: string;
    } | null;
    await JobEmployment.updateOne(
      { userEmail: id.emailLc },
      { $set: { jobId: job.id, appliedAt: now, updatedAt: now } },
      { upsert: true },
    );
    const changed = !existing || existing.jobId !== job.id;
    return NextResponse.json({
      success: true,
      job: { id: job.id, name: job.name, icon: job.icon, salary: job.salary, workItem: job.workItem },
      changed,
      message: changed
        ? `Employed as ${job.name} — you can now start shifts.`
        : `Already employed as ${job.name}.`,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not apply' }, { status: 500 });
  }
}
