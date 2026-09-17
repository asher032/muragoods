import mongoose from 'mongoose';

// Movie/TV/Anime requests — users ask for missing titles and support
// (upvote) existing requests instead of creating duplicates. The admin
// dashboard manages statuses; when content goes live the request is marked
// "Added" and optionally linked to the TMDB entry.
const MediaRequestSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 120 },
  type: { type: String, enum: ['movie', 'tv', 'anime'], required: true },
  year: { type: String, maxlength: 4 },
  notes: { type: String, maxlength: 500, default: '' },
  // Normalized dedup key: lowercase, alphanumeric-only title + type.
  dedupKey: { type: String, required: true, index: true },
  requestedBy: { type: String, default: '' }, // email (hashed use only, server-side)
  requestedByName: { type: String, default: 'A viewer' },
  // Supporters: set of emails (or ip-hashes for guests) — supports once each.
  supporters: { type: [String], default: [] },
  status: {
    type: String,
    enum: ['Requested', 'Under Review', 'In Progress', 'Added', 'Unavailable', 'Rejected'],
    default: 'Requested',
  },
  // When Added: link to the MuraStream entry so users can jump straight in.
  tmdbId: { type: Number, default: null },
  tmdbType: { type: String, enum: ['movie', 'tv', null], default: null },
  adminNote: { type: String, maxlength: 300, default: '' },
  reported: { type: Boolean, default: false },
}, { timestamps: true });

MediaRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.MediaRequest || mongoose.model('MediaRequest', MediaRequestSchema);
