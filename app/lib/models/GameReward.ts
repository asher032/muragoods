import mongoose from 'mongoose';

// Immutable server-side reward ledger. Every coin/XP/perk grant from a
// game writes one row with a unique idempotency key, so retries, replays
// and double-submits can never pay twice. Coins are applied to
// User.coinBalance in the same request via atomic $inc.
const GameRewardSchema = new mongoose.Schema({
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  // Points/rewards ledger. Every entry belongs to the canonical userId, so the
  // balance a person sees is one balance no matter which surface earned it.
  canonicalUserId: { type: String, default: '', index: true },
  // LEGACY owner key (lowercased email), still written and still matched.
  userEmail: { type: String, required: true, index: true },
  discordId: { type: String, default: '' },
  gameId: { type: String, required: true, index: true },
  kind: { type: String, enum: ['coins', 'xp', 'discount', 'perk', 'achievement'], required: true },
  amount: { type: Number, default: 0 },
  label: { type: String, default: '' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

GameRewardSchema.index({ userEmail: 1, gameId: 1, createdAt: -1 });
GameRewardSchema.index({ userEmail: 1, createdAt: -1 });

export default mongoose.models.GameReward ||
  mongoose.model('GameReward', GameRewardSchema, 'game_rewards');
