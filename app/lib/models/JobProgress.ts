import mongoose from 'mongoose';

// Per-user, per-job progression: successes drive promotion bonuses, fails
// drive firing. Resigning deletes the row (history in job_shifts is kept).
const JobProgressSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, index: true },
  jobId: { type: String, required: true, index: true },
  successes: { type: Number, default: 0 },
  fails: { type: Number, default: 0 },
  totalShifts: { type: Number, default: 0 },
  consecutiveFails: { type: Number, default: 0 },
  firedCount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

JobProgressSchema.index({ userEmail: 1, jobId: 1 }, { unique: true });

export default mongoose.models.JobProgress || mongoose.model('JobProgress', JobProgressSchema);
