import mongoose from 'mongoose';

// MuraStream comments — a lightweight per-title discussion section under
// every movie/TV detail page. Anonymous posting (name optional), newest
// shown last. One user can hold at most 50 recent comments per title via
// the $slice guard on insert.
const MediaCommentSchema = new mongoose.Schema({
  mediaType: { type: String, enum: ['movie', 'tv'], required: true, index: true },
  tmdbId: { type: Number, required: true, index: true },
  email: { type: String, default: '' },
  name: { type: String, default: 'Guest' },
  text: { type: String, required: true, maxlength: 500 },
  at: { type: Date, default: Date.now },
}, { timestamps: true });

// Listing is always by title, newest first (the API reverses for display).
MediaCommentSchema.index({ mediaType: 1, tmdbId: 1, createdAt: -1 });

export default mongoose.models.MediaComment || mongoose.model('MediaComment', MediaCommentSchema);
