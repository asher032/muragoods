import mongoose from 'mongoose';

// Single-use work shift: challenge generated server-side at start, consumed
// atomically at complete. Replays, duplicates and forged wins are refused by
// the consume query itself. Consumed rows double as work history.
const JobShiftSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  canonicalUserId: { type: String, default: '', index: true },
  userEmail: { type: String, required: true, index: true },
  jobId: { type: String, required: true },
  game: { type: String, required: true },
  challenge: { type: mongoose.Schema.Types.Mixed, required: true },
  payMin: { type: Number, required: true },
  payMax: { type: Number, required: true },
  failMin: { type: Number, required: true },
  failMax: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
  consumed: { type: Boolean, default: false, index: true },
  consumedAt: { type: Date, default: null },
  won: { type: Boolean, default: null },
  payout: { type: Number, default: null },
  reason: { type: String, default: '' },
});

// Unconsumed shifts expire (TTL) so abandoned modals can't pile up.
JobShiftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.JobShift || mongoose.model('JobShift', JobShiftSchema);
