import mongoose from 'mongoose';

const PerkSchema = new mongoose.Schema({
  perkId: { type: String, required: true },
  perkName: { type: String, required: true },
  perkDescription: { type: String, default: '' },
  addedBy: { type: String, default: 'System' },
  addedAt: { type: Date, default: Date.now },
  redeemed: { type: Boolean, default: false },
  redeemedAt: { type: Date },
}, { _id: false });

const CoinHistorySchema = new mongoose.Schema({
  type: { type: String, enum: ['earn', 'spend'], required: true },
  amount: { type: Number, required: true },
  label: { type: String, default: '' },
  date: { type: Date, default: Date.now },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  // ── Canonical identity ────────────────────────────────────────────────
  // ONE account per person. `userId` is the stable internal id that every
  // other surface references (orders, points, favorites, My Space, support,
  // letters, games, Murabot). It never changes and is never derived from a
  // mutable value: `email`, `name` and the Discord nickname can all change,
  // `userId` cannot. Existing accounts keep the id they already have —
  // reissuing one would orphan every row that points at it.
  userId: { type: String, unique: true, sparse: true, index: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // Public handle. Separate from `name` (the display name, which is freely
  // editable) so a display-name change never breaks a mention or a link.
  username: { type: String, default: '', trim: true, maxlength: 32 },
  name: { type: String, required: true },
  avatar: { type: String, default: '' },
  role: { type: String, default: 'user' },
  perks: { type: [PerkSchema], default: [] },
  coinBalance: { type: Number, default: 0 },
  coinHistory: { type: [CoinHistorySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  // Password Reset
  passwordResetCode: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null },
  // Email Verification
  emailVerified: { type: Boolean, default: false },
  verificationCode: { type: String, default: null },
  verificationExpires: { type: Date, default: null },
  // Referral
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: String, default: null },
  referralUsed: { type: Boolean, default: false },
  // Discord account link — the join key between the Muragoods account
  // (`userId`) and Discord/Murabot identity (snowflake):
  //
  //   userId -> linkedAccounts.discordUserId -> Discord -> Murabot
  //
  // One Discord account links to exactly one Muragoods account (unique
  // sparse). Linking Discord NEVER creates a second account. Disconnecting
  // clears the link only; orders, points, favorites, progress and watch
  // history are keyed by `userId` and are never deleted by an unlink.
  //
  // `discord.discordId` is the historical field name and is kept in the same
  // document so every existing index, query and script keeps working;
  // `linkedAccounts.discordUserId` is the canonical name the rest of the
  // codebase reads. Both are written together and never diverge.
  discord: {
    discordId: { type: String, unique: true, sparse: true, index: true },
    username: { type: String, default: '' },
    avatar: { type: String, default: '' },
    linkedAt: { type: Date, default: null },
  },
  linkedAccounts: {
    discordUserId: { type: String, default: '', index: true },
    discordUsername: { type: String, default: '' },
    discordAvatar: { type: String, default: '' },
    discordLinkedAt: { type: Date, default: null },
  },
  // Privacy controls. Watch history and activity stay private unless the
  // owner opts out; favorites default private; the game profile defaults
  // public so leaderboards and the platform feel work out of the box.
  privacy: {
    gameProfile: { type: String, enum: ['public', 'private'], default: 'public' },
    favorites: { type: String, enum: ['public', 'private'], default: 'private' },
    activity: { type: String, enum: ['private', 'friends', 'public'], default: 'private' },
    watchHistory: { type: String, enum: ['private', 'public'], default: 'private' },
  },
  // Public profile fields. Added explicitly: with mongoose's default strict
  // mode, undeclared paths are silently dropped on save, which previously
  // discarded every bio/preferences write without an error.
  bio: { type: String, default: '' },
  preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now },
});

// Display name is the user-editable label; the canonical id is `userId`.
UserSchema.virtual('displayName').get(function (this: { name?: string }) {
  return this.name || '';
});

/**
 * `username` must be unique when set. A partial index (rather than a plain
 * `unique: true`) because most accounts have not picked one yet, and Mongo
 * treats every missing/empty value as the same key — a plain unique index
 * would refuse the second account that has no username.
 *
 * The collation is strength:2 so "Ash" and "ash" collide: two handles that
 * differ only in case are the same handle to a human reading them.
 */
UserSchema.index(
  { username: 1 },
  {
    unique: true,
    name: 'username_unique_ci',
    partialFilterExpression: { username: { $type: 'string', $gt: '' } },
    collation: { locale: 'en', strength: 2 },
  },
);

export default mongoose.models.User || mongoose.model('User', UserSchema);
