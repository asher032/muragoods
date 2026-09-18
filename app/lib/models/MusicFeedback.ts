import mongoose from 'mongoose';

// Per-user feedback from the dashboard player: Like / Love this / Not for me.
// One row per (guild, user, track) so a choice can be changed or withdrawn
// without piling up duplicates, and so the tallies are real rather than
// client-side counters that vanish on refresh.
const MusicFeedbackSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  // Stable identity for a track: its source URL when there is one, otherwise
  // the normalised title. Deliberately NOT the queue position, which changes.
  trackKey: { type: String, required: true },
  title: { type: String, default: '' },
  uploader: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  feedback: { type: String, enum: ['like', 'love', 'dislike'], required: true },
}, { timestamps: true });

MusicFeedbackSchema.index({ guildId: 1, userId: 1, trackKey: 1 }, { unique: true });
MusicFeedbackSchema.index({ guildId: 1, trackKey: 1, feedback: 1 });
MusicFeedbackSchema.index({ guildId: 1, userId: 1, updatedAt: -1 });

export default mongoose.models.MusicFeedback
  || mongoose.model('MusicFeedback', MusicFeedbackSchema);
