import mongoose from 'mongoose';

const PromoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  type: { type: String, enum: ['percent', 'fixed'], required: true },
  value: { type: Number, required: true },
  description: { type: String, default: '' },
  minOrder: { type: Number, default: 0 },
  maxUses: { type: Number, default: 1 }, // 1 = single use per code
  usedCount: { type: Number, default: 0 },
  usedBy: [{ type: String }], // track which users used this code
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 1 week default
  active: { type: Boolean, default: true },
  createdBy: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.PromoCode || mongoose.model('PromoCode', PromoCodeSchema);
