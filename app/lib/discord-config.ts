import { MongoClient, type Collection, type Document } from 'mongodb';
import { isMongoConnectionString, resolveMongoUri } from '@/app/lib/db-health';

let clientPromise: Promise<MongoClient> | null = null;

function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    // Same variable + trimming as the rest of the app: a quoted or
    // whitespace-padded URI must not poison only this code path.
    const uri = resolveMongoUri();
    if (!uri || !isMongoConnectionString(uri)) {
      throw new Error('MONGO_URI or MONGODB_URI is required (mongodb:// or mongodb+srv://)');
    }
    clientPromise = new MongoClient(uri, {
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000,
      socketTimeoutMS: 10000,
    }).connect();
    // One failed connect must not poison the process: clear so the next
    // request retries instead of awaiting the same rejection until restart.
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

export async function discordConfigCollection(): Promise<Collection<Document>> {
  const client = await getClient();
  const databaseName = process.env.MONGO_DB || process.env.DISCORD_BOT_MONGO_DB || 'murastream_bot';
  return client.db(databaseName).collection('guild_config');
}
