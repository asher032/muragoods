import mongoose from 'mongoose';

// ONE centralized preference system for the whole ecosystem (games,
// movies, anime, series, products, music). Replaces the disconnected
// localStorage favorites and mirrors Murastream likes/watchlist.
export const PREFERENCE_TYPES = ['game', 'movie', 'anime', 'series', 'product', 'music'] as const;
export const PREFERENCE_ACTIONS = ['favorite', 'like', 'save', 'bookmark', 'love'] as const;

const SnapshotSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  image: { type: String, default: '' },
  subtitle: { type: String, default: '' },
}, { _id: false });

const UserPreferenceSchema = new mongoose.Schema({
  // Favorites/likes/saves from movies, anime, series, products, games and
  // music all live in this ONE collection, owned by the canonical userId.
  // There is no per-service favorites collection and no second favorites
  // account: Murastream's likes and the shop's saved products are rows here
  // under the same owner.
  canonicalUserId: { type: String, default: '', index: true },
  // LEGACY owner key (lowercased email), still written and still matched.
  userEmail: { type: String, required: true, index: true },
  discordId: { type: String, default: '', index: true },
  contentType: { type: String, enum: PREFERENCE_TYPES, required: true, index: true },
  contentId: { type: String, required: true },
  action: { type: String, enum: PREFERENCE_ACTIONS, required: true },
  snapshot: { type: SnapshotSchema, default: () => ({}) },
  createdAt: { type: Date, default: Date.now },
});

UserPreferenceSchema.index({ userEmail: 1, contentType: 1, contentId: 1, action: 1 }, { unique: true });
UserPreferenceSchema.index({ userEmail: 1, createdAt: -1 });// Same uniqueness guarantee on the canonical key. Without this, a preference
  // saved once before the migration and once after it would be two rows for one
  // person — exactly the duplicate-account symptom this refactor removes.
// Partial, because every pre-migration row shares the same empty placeholder
  // and a plain unique index would treat those as duplicates of each other.
UserPreferenceSchema.index(
  { canonicalUserId: 1, contentType: 1, contentId: 1, action: 1 },
  {
    unique: true,
    name: 'preference_unique_canonical',
    partialFilterExpression: { canonicalUserId: { $type: 'string', $gt: '' } },
  },
);

export default mongoose.models.UserPreference ||
  mongoose.model('UserPreference', UserPreferenceSchema, 'user_preferences');
