#!/usr/bin/env node
// One-off cleanup: delete every integration-test artifact (users, orders,
// parties, push subscriptions) belonging to the throwaway @muragoods.test
// accounts the test suite creates. Requires MONGODB_URI in .env.
//   export PATH=... ; node scripts/cleanup-test-data.mjs
import fs from 'fs';
import { MongoClient } from 'mongodb';

const uri = (fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.*)$/m) || [])[1]?.trim();
if (!uri) { console.error('MONGODB_URI not found in .env'); process.exit(1); }

const client = new MongoClient(uri);
await client.connect();
const db = client.db();

// Collection name inference: mongoose pluralizes lowercase model names.
// We discover actual collections instead of guessing.
const collections = await db.listCollections().toArray();
const names = collections.map(c => c.name);

let totalDeleted = 0;

async function wipe(collection, filter, label) {
  if (!names.includes(collection)) { console.log(`  skip ${collection} (not found)`); return; }
  const r = await db.collection(collection).deleteMany(filter);
  totalDeleted += r.deletedCount;
  console.log(`  ${label}: ${r.deletedCount} deleted from ${collection}`);
}

console.log('Scanning for @muragoods.test artifacts…');

// Users (email may be nested depending on the model)
await wipe('users', { email: /@muragoods\.test$/i }, 'test users');
await wipe('users', { 'account.email': /@muragoods\.test$/i }, 'test users (nested)');

// Orders (placed by test users; field names per Order model)
await wipe('orders', { userId: /@muragoods\.test$/i }, 'test orders (userId)');
await wipe('orders', { 'customer.email': /@muragoods\.test$/i }, 'test orders (nested email)');

// Watch parties (created/tested with test accounts)
await wipe('parties', { hostEmail: /@muragoods\.test$/i }, 'test parties (host)');
await wipe('parties', { 'members.email': /@muragoods\.test$/i }, 'test parties (member)');

// Push subscriptions registered by test accounts
await wipe('pushsubscriptions', { email: /@muragoods\.test$/i }, 'test push subscriptions');

// Chat/typing state lives inside parties — covered above.

console.log(`Done. ${totalDeleted} documents deleted.`);
await client.close();
