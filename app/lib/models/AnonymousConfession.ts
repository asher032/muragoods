import mongoose from 'mongoose';

const AnonymousConfessionSchema = new mongoose.Schema({
  shortId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, default: 'Confession' },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  likes: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  views: { type: Number, default: 0 },
  reported: { type: Boolean, default: false },
  reportCount: { type: Number, default: 0 },
  removed: { type: Boolean, default: false },
  createdBy: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.AnonymousConfession || mongoose.model('AnonymousConfession', AnonymousConfessionSchema);
