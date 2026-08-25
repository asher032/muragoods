import mongoose from 'mongoose';

const AnonymousLetterSchema = new mongoose.Schema({
  shortId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, default: 'Random Thoughts' },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  likes: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  views: { type: Number, default: 0 },
  reported: { type: Boolean, default: false },
  reportCount: { type: Number, default: 0 },
  removed: { type: Boolean, default: false },
  // Optional song attachment
  songTitle: { type: String },
  artist: { type: String },
  artwork: { type: String },
  previewUrl: { type: String },
  deezerUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.AnonymousLetter || mongoose.model('AnonymousLetter', AnonymousLetterSchema);
