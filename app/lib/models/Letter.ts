import mongoose from 'mongoose';

const LetterSchema = new mongoose.Schema({
  senderEmail: { type: String, required: true },
  senderName: { type: String, required: true },
  recipientEmail: { type: String, required: true },
  recipientName: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, default: 'Random' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Letter || mongoose.model('Letter', LetterSchema);
