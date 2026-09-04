import mongoose from 'mongoose';

const MediaItemSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  mediaType: { type: String, default: '' },
  title: { type: String, default: '' },
  posterPath: { type: String, default: null },
  backdropPath: { type: String, default: null },
  voteAverage: { type: Number, default: 0 },
  year: { type: String, default: '' },
  overview: { type: String, default: '' },
  anilistId: { type: Number, default: null },
  malId: { type: Number, default: null },
  genres: { type: [String], default: [] },
  episodes: { type: Number, default: null },
  status: { type: String, default: '' },
  score: { type: Number, default: 0 },
}, { _id: false });

const HistoryItemSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  mediaType: { type: String, default: '' },
  title: { type: String, default: '' },
  posterPath: { type: String, default: null },
  date: { type: String, required: true },
  season: { type: Number, default: null },
  episode: { type: Number, default: null },
  progress: { type: Number, default: null },
}, { _id: false });

const AnimeProgressSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  title: { type: String, default: '' },
  posterPath: { type: String, default: null },
  totalEpisodes: { type: Number, default: null },
  watchedEpisodes: { type: [Number], default: [] },
  lastWatched: { type: String, required: true },
  genres: { type: [String], default: [] },
}, { _id: false });

const SettingsSchema = new mongoose.Schema({
  autoplay: { type: Boolean, default: true },
  autoplayNext: { type: Boolean, default: true },
  continueWatching: { type: Boolean, default: true },
  subtitleSize: { type: Number, default: 100 },
  subtitleLang: { type: String, default: 'en' },
  appearance: { type: String, default: 'dark' },
  compactCards: { type: Boolean, default: false },
  watchHistory: { type: Boolean, default: true },
  recommendations: { type: Boolean, default: true },
}, { _id: false });

const UserLibrarySchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  likes: { type: [MediaItemSchema], default: [] },
  myList: { type: [MediaItemSchema], default: [] },
  history: { type: [HistoryItemSchema], default: [] },
  animeProgress: { type: [AnimeProgressSchema], default: [] },
  settings: { type: SettingsSchema, default: () => ({}) },
  updatedAt: { type: Date, default: Date.now },
});

UserLibrarySchema.index({ email: 1 }, { unique: true });

export default mongoose.models.UserLibrary || mongoose.model('UserLibrary', UserLibrarySchema);
