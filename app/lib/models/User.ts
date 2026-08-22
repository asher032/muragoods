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

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userId: { type: String, unique: true, sparse: true },
  role: { type: String, default: 'user' },
  perks: { type: [PerkSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
