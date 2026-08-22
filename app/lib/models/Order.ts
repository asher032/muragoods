import mongoose from 'mongoose';

const StatusHistoryEntry = new mongoose.Schema({
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note: { type: String, default: '' },
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  customer: { type: String, required: true },
  phone: { type: String },
  zone: { type: String, required: true },
  address: { type: String, required: true },
  latitude: Number,
  longitude: Number,
  payment: { type: String, required: true },
  gcashRefNumber: String,
  gcashScreenshotUrl: String,
  deliveryDate: { type: String, required: true },
  deliveryTimeSlot: { type: String, default: '' },
  status: { type: String, default: 'Pending Payment' },
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
