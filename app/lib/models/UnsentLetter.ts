import mongoose from 'mongoose';

const UnsentLetterSchema = new mongoose.Schema({
  authorEmail: { type: String, required: true },
  authorName: { type: String, required: true },
  recipientName: { type: String, required: true, index: true },
  content: { type: String, required: true },
  category: { type: String, default: 'Other' },
  likes: { type: Number, default: 0 },
  likedBy: { type: [String], default: [] },
  bookmarks: { type: Number, default: 0 },
  bookmarkedBy: { type: [String], default: [] },
  approved: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.UnsentLetter || mongoose.model('UnsentLetter', UnsentLetterSchema);
