import mongoose from 'mongoose';

// One row per playable game. Admins manage these from the dashboard;
// the game hub, reward service and leaderboards all read this table,
// so disabling or re-tuning a game never needs a code deploy.
const GameDefinitionSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['chance', 'activities', 'simulation', 'progression', 'social', 'arcade', 'daily'],
    default: 'arcade',
  },
  route: { type: String, required: true }, // e.g. /play/spin
  enabled: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  // `isNew` is a reserved Mongoose pathname (it collides with Document#isNew),
  // so the flag lives under a non-reserved name. Documents written before the
  // rename are still read correctly — see the legacy fallback below and
  // scripts/migrate-gamedef-isnew.mjs.
  isNewItem: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  // Server-side reward tuning (never trusted from the client).
  maxPlaysPerDay: { type: Number, default: 10 },
  cooldownSec: { type: Number, default: 0 },
  xpPerPlay: { type: Number, default: 5 },
  // Free-form per-game prize tables (spin segments, checkin day table, …).
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now },
});

// Backward-compatible read helper for rows persisted with the old reserved
// name. Every read of this collection is `.lean()`, so endpoints normalize the
// flag through here instead of relying on document middleware. Run
// scripts/migrate-gamedef-isnew.mjs to move the stored rows permanently.
export function isNewFlag(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  if (typeof row.isNewItem === 'boolean') return row.isNewItem;
  return Boolean(row.isNew);
}

export default mongoose.models.GameDefinition ||
  mongoose.model('GameDefinition', GameDefinitionSchema, 'game_definitions');
