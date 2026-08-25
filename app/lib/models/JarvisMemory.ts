import mongoose from 'mongoose';

const JarvisMemorySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  key: { type: String, required: true },
  value: { type: String, required: true },
  category: { type: String, enum: ['preference', 'context', 'fact', 'task', 'conversation'], default: 'context' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

// Compound index for efficient lookups
JarvisMemorySchema.index({ userId: 1, key: 1 });
JarvisMemorySchema.index({ userId: 1, category: 1 });

export default mongoose.models.JarvisMemory || mongoose.model('JarvisMemory', JarvisMemorySchema);
