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
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userId: { type: String, unique: true, sparse: true },
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
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
