import mongoose from 'mongoose';

// Single-use play-session nonces. The client starts a session, plays, then
// redeems the result; the award endpoint consumes the token atomically, so
// a captured request cannot be replayed for a second payout.
const GameSessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  canonicalUserId: { type: String, default: '', index: true },
  userEmail: { type: String, required: true, index: true },
  gameId: { type: String, required: true },
  consumed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

GameSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.GameSession ||
  mongoose.model('GameSession', GameSessionSchema, 'game_sessions');
