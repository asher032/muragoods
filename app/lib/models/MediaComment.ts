import mongoose from 'mongoose';

// MuraStream comments — threaded discussion under every movie/TV detail
// page. Supports replies (parentId), likes (array of viewer emails so a
// viewer can like once and we can show "liked by me"), and edit tracking.
// Owner email is stored for server-side ownership checks and never exposed
// to the client (only a hash for avatar coloring).
const MediaCommentSchema = new mongoose.Schema({
  mediaType: { type: String, enum: ['movie', 'tv'], required: true, index: true },
  tmdbId: { type: Number, required: true, index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaComment', default: null, index: true },
  email: { type: String, default: '' },
  name: { type: String, default: 'Guest' },
  text: { type: String, required: true, maxlength: 500 },
  likes: { type: [String], default: [] },
  editedAt: { type: Date, default: null },
  reported: { type: Boolean, default: false },
  at: { type: Date, default: Date.now },
}, { timestamps: true });

// Listing is always by title, newest first (the API reverses for display).
MediaCommentSchema.index({ mediaType: 1, tmdbId: 1, createdAt: -1 });

export default mongoose.models.MediaComment || mongoose.model('MediaComment', MediaCommentSchema);
