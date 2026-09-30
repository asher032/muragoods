import { type Collection, type Document } from 'mongodb';
import { clusterCollection } from '@/app/lib/db/clusters';

/**
 * Dashboard access to the BOT's configuration collection.
 *
 * This is deliberately routed through the `murabot` cluster rather than
 * reading a URI directly, so the dashboard and the bot are guaranteed to be
 * talking to the same cluster from the same variable and the same pooled
 * client. That is what stops the dashboard from quietly becoming a second,
 * divergent copy of bot state.
 *
 * Previously this module opened its own `MongoClient` from a bare
 * MONGODB_URI — a second pool, a second place to change the variable, and no
 * way to tell from the code which cluster it was on.
 */
export async function discordConfigCollection(): Promise<Collection<Document>> {
  return clusterCollection<Document>('murabot', 'guild_config');
}
