// MuraStream — User Library Model (MongoDB/Mongoose)
import mongoose, { Schema, Document } from 'mongoose';

export interface IMuraStreamLibrary extends Document {
  userId: string; // email or identifier
  // Watchlist
  watchlist: Array<{
    id: number;
    mediaType: 'movie' | 'tv' | 'anime';
    title: string;
    posterPath: string | null;
    addedAt: Date;
  }>;
  // Favorites
  favorites: Array<{
    id: number;
    mediaType: 'movie' | 'tv' | 'anime';
    title: string;
    posterPath: string | null;
    addedAt: Date;
  }>;
  // Playback progress
  progress: Record<string, number>; // key: "movie_123" or "tv_456_s1e3" => percentage
  // Continue watching
  continueWatching: Array<{
    id: number;
    mediaType: 'movie' | 'tv' | 'anime';
    title: string;
    posterPath: string | null;
    season?: number;
    episode?: number;
    episodeName?: string;
    progress: number;
    updatedAt: Date;
  }>;
  // Watch history
  history: Array<{
    id: number;
    mediaType: 'movie' | 'tv' | 'anime';
    title: string;
    posterPath: string | null;
    season?: number;
    episode?: number;
    episodeName?: string;
    watchedAt: Date;
  }>;
  // Settings
  settings: {
    defaultSource: string;
    subtitleLang: string;
    autoplay: boolean;
    theme: string;
    gridLayout: 'grid' | 'list';
    defaultCategory: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const LibrarySchema = new Schema<IMuraStreamLibrary>(
  {
    userId: { type: String, required: true, unique: true },
    watchlist: [{
      id: Number,
      mediaType: { type: String, enum: ['movie', 'tv', 'anime'] },
      title: String,
      posterPath: String,
      addedAt: { type: Date, default: Date.now },
    }],
    favorites: [{
      id: Number,
      mediaType: { type: String, enum: ['movie', 'tv', 'anime'] },
      title: String,
      posterPath: String,
      addedAt: { type: Date, default: Date.now },
    }],
    progress: { type: Map, of: Number, default: {} },
    continueWatching: [{
      id: Number,
      mediaType: { type: String, enum: ['movie', 'tv', 'anime'] },
      title: String,
      posterPath: String,
      season: Number,
      episode: Number,
      episodeName: String,
      progress: Number,
      updatedAt: { type: Date, default: Date.now },
    }],
    history: [{
      id: Number,
      mediaType: { type: String, enum: ['movie', 'tv', 'anime'] },
      title: String,
      posterPath: String,
      season: Number,
      episode: Number,
      episodeName: String,
      watchedAt: { type: Date, default: Date.now },
    }],
    settings: {
      defaultSource: { type: String, default: 'vidking' },
      subtitleLang: { type: String, default: 'en' },
      autoplay: { type: Boolean, default: true },
      theme: { type: String, default: 'dark' },
      gridLayout: { type: String, default: 'grid' },
      defaultCategory: { type: String, default: 'trending' },
    },
  },
  { timestamps: true }
);

export default mongoose.models.MuraStreamLibrary ||
  mongoose.model<IMuraStreamLibrary>('MuraStreamLibrary', LibrarySchema);
