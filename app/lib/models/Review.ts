import mongoose from 'mongoose';

const ReviewSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  productName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  adminReply: { type: String, default: '' },
  adminRepliedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

ReviewSchema.index({ productName: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Review || mongoose.model('Review', ReviewSchema);
