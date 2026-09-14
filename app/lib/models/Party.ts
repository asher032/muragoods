import mongoose from 'mongoose';

// Watch Party — lets two or more users watch the same title in sync.
// The host's player state (title, season, episode, chosen provider) is stored
// here; guests poll it and follow along automatically.
// TTL: parties auto-expire 6 hours after their last update, so abandoned
// parties can't accumulate.
const PartySchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true, immutable: true },
  hostEmail: { type: String, default: '' },
  hostName: { type: String, default: 'Host' },
  // Host playback state: { type: 'movie'|'tv', id, season, episode, source, updatedAt }
  state: { type: mongoose.Schema.Types.Mixed, default: null },
  members: [{
    email: { type: String, default: '' },
    name: { type: String, default: 'Guest' },
    lastSeen: { type: Date, default: Date.now },
  }],
  // Live chat — server keeps only the most recent messages.
  messages: [{
    email: { type: String, default: '' },
    name: { type: String, default: 'Guest' },
    text: { type: String, required: true },
    at: { type: Date, default: Date.now },
  }],
  // Ephemeral typing flags — self-expiring (checked against a 5s window).
  typingUsers: [{
    name: { type: String, default: 'Guest' },
    at: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

PartySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 6 * 60 * 60 });

export default mongoose.models.Party || mongoose.model('Party', PartySchema);
