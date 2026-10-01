import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true }, // 'user' or 'admin'
  senderName: { type: String, default: 'User' },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  isAutoReply: { type: Boolean, default: false },
}, { _id: false });

const SupportTicketSchema = new mongoose.Schema({
  // Stable owner — the canonical Muragoods userId. A ticket always belongs to
  // the account that opened it; the support system reads the owner from the
  // session, so a request can never be filed against someone else.
  canonicalUserId: { type: String, default: '', index: true },
  // LEGACY: holds the owner's email (or, for guest tickets, the name they
  // typed). Still matched on read so pre-migration tickets stay reachable.
  userId: { type: String, required: true },
  // Human label captured at creation. Display only — never an ownership key,
  // because a display name can change.
  userName: { type: String, required: true },
  subject: { type: String, required: true },
  category: { type: String, default: 'General' },
  status: { type: String, enum: ['open', 'replied', 'closed'], default: 'open' },
  messages: { type: [MessageSchema], default: [] },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.SupportTicket || mongoose.model('SupportTicket', SupportTicketSchema);
