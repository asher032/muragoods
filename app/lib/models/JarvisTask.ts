import mongoose from 'mongoose';

const TaskLogSchema = new mongoose.Schema({
  step: { type: String, required: true },
  status: { type: String, enum: ['pending', 'running', 'completed', 'failed', 'skipped'], default: 'pending' },
  message: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const JarvisTaskSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['queued', 'running', 'waiting', 'completed', 'failed', 'cancelled'], default: 'queued' },
  type: { type: String, enum: ['navigation', 'search', 'creation', 'system', 'agent', 'dev'], default: 'system' },
  logs: { type: [TaskLogSchema], default: [] },
  result: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.models.JarvisTask || mongoose.model('JarvisTask', JarvisTaskSchema);
