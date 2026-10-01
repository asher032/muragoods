import mongoose from 'mongoose';

const UnsentLetterSchema = new mongoose.Schema({
  // A letter belongs to the canonical user who wrote it, so "my submissions"
  // is the same person on every device and never leaks across accounts.
  canonicalUserId: { type: String, default: '', index: true },
  // LEGACY owner key, still written and still matched.
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
