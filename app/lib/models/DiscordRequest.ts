import mongoose from 'mongoose';

// Discord bridge requests — created by the MuraStream Discord bot via
// /api/discord/* routes. Kept separate from site MediaRequests so the two
// systems stay independently manageable; the admin dashboard can view both.
const DiscordRequestSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 120 },
  type: { type: String, enum: ['movie', 'tv', 'anime'], default: 'movie' },
  requestedBy: { type: String, default: 'Discord user' },  // display name only
  source: { type: String, default: 'discord' },
  note: { type: String, maxlength: 300, default: '' },
  status: {
    type: String,
    enum: ['Requested', 'Under Review', 'In Progress', 'Added', 'Unavailable', 'Rejected'],
    default: 'Requested',
  },
}, { timestamps: true });

DiscordRequestSchema.index({ title: 1, status: 1 });

export default mongoose.models.DiscordRequest || mongoose.model('DiscordRequest', DiscordRequestSchema);
