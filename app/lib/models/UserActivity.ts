import mongoose from 'mongoose';

// Cross-platform activity timeline. Written server-side by game awards,
// favorites, library sync and purchases. Visibility defaults to private;
// only rows the owner marked public (or friends, later) leave the account.
const UserActivitySchema = new mongoose.Schema({
  canonicalUserId: { type: String, default: '', index: true },
  // LEGACY owner key (lowercased email), still written and still matched.
  userEmail: { type: String, required: true, index: true },
  discordId: { type: String, default: '' },
  type: {
    type: String,
    enum: ['game', 'favorite', 'achievement', 'watch', 'reward', 'purchase', 'link'],
    required: true,
  },
  text: { type: String, required: true, maxlength: 200 },
  ref: { type: String, default: '' }, // gameId / content id / order id
  visibility: { type: String, enum: ['private', 'friends', 'public'], default: 'private' },
  createdAt: { type: Date, default: Date.now },
});

UserActivitySchema.index({ userEmail: 1, createdAt: -1 });

export default mongoose.models.UserActivity ||
  mongoose.model('UserActivity', UserActivitySchema, 'user_activities');
