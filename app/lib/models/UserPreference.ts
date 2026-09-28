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
  userEmail: { type: String, required: true, index: true },
  discordId: { type: String, default: '', index: true },
  contentType: { type: String, enum: PREFERENCE_TYPES, required: true, index: true },
  contentId: { type: String, required: true },
  action: { type: String, enum: PREFERENCE_ACTIONS, required: true },
  snapshot: { type: SnapshotSchema, default: () => ({}) },
  createdAt: { type: Date, default: Date.now },
});

UserPreferenceSchema.index({ userEmail: 1, contentType: 1, contentId: 1, action: 1 }, { unique: true });
UserPreferenceSchema.index({ userEmail: 1, createdAt: -1 });

export default mongoose.models.UserPreference ||
  mongoose.model('UserPreference', UserPreferenceSchema, 'user_preferences');
