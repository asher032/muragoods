import mongoose from 'mongoose';

const LoveLetterSchema = new mongoose.Schema({
  shortId: { type: String, required: true, unique: true, index: true },
  recipientName: { type: String, required: true },
  senderName: { type: String, default: 'Anonymous' },
  isAnonymous: { type: Boolean, default: false },
  title: { type: String, required: true },
  content: { type: String, required: true },
  photos: [{ type: String }],
  letterDate: { type: String, default: '' },
  signature: { type: String, default: '' },
  songTitle: { type: String, default: '' },
  songArtist: { type: String, default: '' },
  theme: { type: String, default: 'default' },
  visibility: { type: String, enum: ['link', 'private'], default: 'link' },
  createdBy: { type: String, default: '' },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.LoveLetter || mongoose.model('LoveLetter', LoveLetterSchema);
