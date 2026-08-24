import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true }, // 'user' or 'admin'
  senderName: { type: String, default: 'User' },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  isAutoReply: { type: Boolean, default: false },
}, { _id: false });

const SupportTicketSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  subject: { type: String, required: true },
  category: { type: String, default: 'General' },
  status: { type: String, enum: ['open', 'replied', 'closed'], default: 'open' },
  messages: { type: [MessageSchema], default: [] },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.SupportTicket || mongoose.model('SupportTicket', SupportTicketSchema);
