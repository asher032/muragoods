import mongoose from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────
// Server-side game saves.
//
// This collection exists because several games kept their real state in the
// browser. `trivia` held its high score in `muragoods_trivia_highscore`;
// `mysterybox` held its legend, streak, history AND its discount codes in six
// separate localStorage keys; `spin` held nothing and simply lost state.
// localStorage is per-browser: sign in on a phone and the progress is simply
// not there, and clearing site data deletes it permanently.
//
// The brief is explicit that the browser may cache but must not be
// authoritative, so the authoritative copy lives here, keyed by canonical
// `userId` — which means it follows the person across devices and survives
// the Discord link being removed and restored.
//
// `state` is deliberately an open object rather than a fixed schema. The brief
// asks for progress, score, highScore, level, currency, unlocks, inventory,
// achievements, streak and lastPlayed — but then says NOT to force every game
// into an identical structure, and that is right: a memory game has no
// currency and forcing one would mean writing zeroes forever. The common
// summary fields (highScore, plays, streak, lastPlayed) stay first-class for
// cross-game views; anything game-specific goes in `state`.
//
// Progress is NOT a reward. Nothing here grants points or items; awards flow
// through the award endpoint and the points/inventory services, which validate
// server-side. Otherwise "save" would be a back door around reward validation.
// ─────────────────────────────────────────────────────────────────────────

const GameSaveSchema = new mongoose.Schema({
  canonicalUserId: { type: String, required: true, index: true },
  // LEGACY owner key (lowercased email), still written and still matched.
  userEmail: { type: String, required: true, index: true },
  discordId: { type: String, default: '', index: true },

  gameId: { type: String, required: true, index: true },

  /** Cross-game summary fields, promoted so leaderboards/profile can read them. */
  highScore: { type: Number, default: 0 },
  plays: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  achievements: { type: [String], default: [] },

  /**
   * Game-specific save state. Shape is owned by the game, not by this schema.
   * Marked as Mixed so a game can evolve its own structure without a
   * migration; each game documents what it stores.
   */
  state: { type: mongoose.Schema.Types.Mixed, default: {} },

  /** Client clock at the last write — used to spot a stale device, not trusted. */
  lastSavedByClientAt: { type: Date, default: null },
  lastPlayed: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'game_saves' });

GameSaveSchema.index({ canonicalUserId: 1, gameId: 1 }, { unique: true });
GameSaveSchema.index({ gameId: 1, highScore: -1 });

export default mongoose.models.GameSave ||
  mongoose.model('GameSave', GameSaveSchema, 'game_saves');