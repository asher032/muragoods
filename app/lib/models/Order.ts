import mongoose from 'mongoose';

const StatusHistoryEntry = new mongoose.Schema({
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note: { type: String, default: '' },
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  // ── Owner ──
  // `canonicalUserId` is the stable owner: the same Muragoods userId that
  // orders, points, favorites and My Space all use. It never changes, even if
  // the person changes their email.
  canonicalUserId: { type: String, default: '', index: true },
  // LEGACY: this field historically holds the owner's EMAIL, not an id. Kept
  // in sync on write and still matched on read so orders placed before the
  // canonical id existed keep resolving to their owner.
  userId: { type: String, required: true },
  customer: { type: String, required: true },
  phone: { type: String },
  zone: { type: String, required: true },
  address: { type: String, required: true },
  latitude: Number,
  longitude: Number,
  payment: { type: String, required: true },
  instaPayRefNumber: String,
  instaPayScreenshotUrl: String,
  // Legacy fields for backward compatibility
  gcashRefNumber: String,
  gcashScreenshotUrl: String,
  deliveryDate: { type: String, required: true },
  deliveryTimeSlot: { type: String, default: '' },
  status: { type: String, default: 'Pending Payment' },
  // Set once delivery coins have been awarded (idempotency flag)
  coinsAwarded: { type: Boolean, default: false },
  total: { type: Number, required: true },
  items: [String],
  deliveryType: { type: String, required: true },
  pointsEarned: { type: Number, default: 0 },
  discountCode: { type: String, default: '' },
  discountAmount: { type: Number, default: 0 },
  promoCode: { type: String, default: '' },
  promoDiscount: { type: Number, default: 0 },
  statusHistory: { type: [StatusHistoryEntry], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
