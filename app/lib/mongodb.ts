import mongoose from 'mongoose';
import { isMongoConnectionString, resolveMongoUri } from '@/app/lib/db-health';

let cached: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | null = null;

async function dbConnect() {
  if (cached && cached.conn) {
    return cached.conn;
  }

  if (!cached) {
    cached = { conn: null, promise: null };
  }

  if (!cached.promise) {
    // Accept MONGO_URI as well: the dashboard routes and discord-config read
    // `process.env.MONGO_URI || process.env.MONGODB_URI`, and a mismatch here is
    // how one half of the app works while the other reports "database offline".
    const MONGODB_URI = resolveMongoUri();
    if (!MONGODB_URI) {
      throw new Error('Please define the MONGODB_URI environment variable inside .env or .env.local');
    }

    // Fail fast with a safe message. Without this the raw driver error
    // ("Invalid scheme, expected connection string to start with mongodb:// or
    // mongodb+srv://") is returned to API callers, and the site silently 503s.
    if (!isMongoConnectionString(MONGODB_URI)) {
      throw new Error(
        'MONGODB_URI is not a MongoDB connection string (expected mongodb:// or mongodb+srv://)',
      );
    }

    const opts = {
      bufferCommands: false,
      // Bounded server selection: without these a dead cluster holds every
      // dashboard request ~30s (default) instead of resolving to an error.
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000,
      socketTimeoutMS: 10000,
    };

    // Reset the cached promise on failure so one bad connect does not poison
    // the process forever (every later dbConnect would await the same
    // rejected promise until restart).
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
    cached.promise.catch(() => {
      if (cached) cached.promise = null;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
