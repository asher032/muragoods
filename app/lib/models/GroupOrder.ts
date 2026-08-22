import mongoose from 'mongoose';

const GroupOrderItem = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  variantId: { type: String, required: true },
  variantName: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 1 },
  addedAt: { type: Date, default: Date.now },
}, { _id: true });

const GroupOrderSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  hostUserId: { type: String, required: true },
  hostName: { type: String, required: true },
  title: { type: String, default: 'Group Order' },
  items: { type: [GroupOrderItem], default: [] },
  status: { type: String, enum: ['open', 'closed', 'ordered'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

GroupOrderSchema.index({ code: 1 });
GroupOrderSchema.index({ hostUserId: 1 });

export default mongoose.models.GroupOrder || mongoose.model('GroupOrder', GroupOrderSchema);
