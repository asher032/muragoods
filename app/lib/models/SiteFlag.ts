import mongoose from 'mongoose';

// Site feature flags — a single mutable document (fixed _id 'site') holds
// runtime switches the admin can flip without a redeploy. The content lock
// hides MuraStream and the showcase from everyone except admins while the
// GitHub repo stays public.
const SiteFlagSchema = new mongoose.Schema({
  _id: { type: String, default: 'site', immutable: true },
  contentLocked: { type: Boolean, default: false },
  lockedAt: { type: Date, default: null },
  lockedMessage: { type: String, default: '' },
}, { timestamps: true, collection: 'siteflags' });

export default mongoose.models.SiteFlag || mongoose.model('SiteFlag', SiteFlagSchema);
