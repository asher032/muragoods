import mongoose, { Schema, models, model } from 'mongoose';

// User reports about streaming sources for a specific title.
// Feeds the watch page's source health: providers reported broken for a
// title get skipped; 'ads' reports are aggregated for provider curation.
const SourceReportSchema = new Schema(
  {
    mediaType: { type: String, enum: ['movie', 'tv'], required: true },
    tmdbId: { type: Number, required: true, index: true },
    season: { type: Number, default: null },
    episode: { type: Number, default: null },
    provider: { type: String, required: true },
    issue: { type: String, enum: ['broken', 'ads'], required: true },
    email: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, expires: '30d' },
  },
  { versionKey: false }
);

SourceReportSchema.index({ tmdbId: 1, provider: 1, issue: 1, createdAt: -1 });

export default models.SourceReport || model('SourceReport', SourceReportSchema);
