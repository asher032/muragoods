import mongoose from 'mongoose';

// Server-side per-game progress. Keyed by canonical email + game id so a
// user keeps progress across devices; discordId is denormalized for bot
// joins. NEVER written from client-supplied totals — only through the
// validated award endpoint.
const GameProgressSchema = new mongoose.Schema({
  canonicalUserId: { type: String, default: '', index: true },
  // LEGACY owner key (lowercased email), still written and still matched.
  userEmail: { type: String, required: true, index: true },
  discordId: { type: String, default: '', index: true },
  gameId: { type: String, required: true, index: true },
  level: { type: Number, default: 1 },
  bestScore: { type: Number, default: 0 },
  plays: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  playTimeSec: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastPlayedDay: { type: String, default: '' }, // YYYY-MM-DD
  achievements: { type: [String], default: [] },
  lastPlayed: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

GameProgressSchema.index({ userEmail: 1, gameId: 1 }, { unique: true });
GameProgressSchema.index({ gameId: 1, bestScore: -1 });
GameProgressSchema.index({ gameId: 1, xp: -1 });

export default mongoose.models.GameProgress ||
  mongoose.model('GameProgress', GameProgressSchema, 'game_progress');
