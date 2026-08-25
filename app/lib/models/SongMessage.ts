import mongoose from 'mongoose';

const SongMessageSchema = new mongoose.Schema({
  shortId: { type: String, required: true, unique: true, index: true },
  recipientName: { type: String, required: true },
  senderName: { type: String, default: 'Anonymous' },
  isAnonymous: { type: Boolean, default: false },
  songTitle: { type: String, required: true },
  artist: { type: String, required: true },
  spotifyUrl: { type: String, default: '' },
  artwork: { type: String, default: '' },
  previewUrl: { type: String, default: '' },
  platform: { type: String, default: 'spotify' },
  message: { type: String, required: true },
  messageTitle: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  memoryDate: { type: String, default: '' },
  visibility: { type: String, enum: ['link', 'private'], default: 'link' },
  createdBy: { type: String, default: '' },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.SongMessage || mongoose.model('SongMessage', SongMessageSchema);
