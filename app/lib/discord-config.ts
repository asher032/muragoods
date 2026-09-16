import { MongoClient, type Collection, type Document } from 'mongodb';

let clientPromise: Promise<MongoClient> | null = null;

function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGO_URI or MONGODB_URI is required');
    clientPromise = new MongoClient(uri).connect();
  }
  return clientPromise;
}

export async function discordConfigCollection(): Promise<Collection<Document>> {
  const client = await getClient();
  const databaseName = process.env.MONGO_DB || process.env.DISCORD_BOT_MONGO_DB || 'murastream_bot';
  return client.db(databaseName).collection('guild_config');
}
