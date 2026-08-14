import mongoose from 'mongoose';

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
  status: { type: String, default: 'Pending Payment' },
  total: { type: Number, required: true },
  items: [String],
  deliveryType: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
