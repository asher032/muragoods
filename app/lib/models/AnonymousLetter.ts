import mongoose from 'mongoose';

const AnonymousLetterSchema = new mongoose.Schema({
  shortId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, default: 'Random Thoughts' },
  likes: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  views: { type: Number, default: 0 },
  reported: { type: Boolean, default: false },
  reportCount: { type: Number, default: 0 },
  removed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.AnonymousLetter || mongoose.model('AnonymousLetter', AnonymousLetterSchema);
