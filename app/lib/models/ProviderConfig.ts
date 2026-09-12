import mongoose, { Schema, models, model } from 'mongoose';

// Global per-provider config managed from the admin dashboard.
// A disabled provider is skipped by every player (auto-select + fallback)
// regardless of per-title health probes.
const ProviderConfigSchema = new Schema(
  {
    provider: { type: String, required: true, unique: true },
    disabled: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default models.ProviderConfig || model('ProviderConfig', ProviderConfigSchema);
