import mongoose from 'mongoose';

// One active job per user. Applying switches employment (old progress is
// kept); resigning or being fired clears it (promotion progress for that
// job is reset by the same flows). No employment → no shifts, no payouts.
const JobEmploymentSchema = new mongoose.Schema({
  canonicalUserId: { type: String, default: '', index: true },
  userEmail: { type: String, required: true, unique: true, index: true },
  jobId: { type: String, required: true, index: true },
  appliedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.JobEmployment || mongoose.model('JobEmployment', JobEmploymentSchema);
