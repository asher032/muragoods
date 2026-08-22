import mongoose from 'mongoose';

const ChatMessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  senderName: { type: String, required: true },
  senderEmail: { type: String, required: true },
  recipient: { type: String, default: 'admin' },
  message: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  orderId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

ChatMessageSchema.index({ senderEmail: 1, createdAt: -1 });
ChatMessageSchema.index({ read: 1, createdAt: -1 });

export default mongoose.models.ChatMessage || mongoose.model('ChatMessage', ChatMessageSchema);
