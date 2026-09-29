// Unified-account migration audit + backfill.
//
// Verifies the ONE-identity rule (User.email canonical, Discord linked via
// users.discord.discordId) and backfills the denormalized discordId join key
// onto ecosystem collections so history/progress/favorites work cross-platform.
//
//   node scripts/migrate-unified-accounts.mjs            # dry run (default)
//   node scripts/migrate-unified-accounts.mjs --apply    # write backfills
//
// Never deletes data. Never merges accounts: conflicts are reported for
// explicit manual linking.

const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('MONGODB_URI (or MONGO_URI) is required');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db();
  console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}  db: ${db.databaseName}`);

  const users = db.collection('users');

  // 1. Uniqueness guard: one Discord id → one account.
  try {
    await users.createIndex({ 'discord.discordId': 1 }, { unique: true, sparse: true, name: 'discord_discordId_unique' });
    console.log('index users.discord.discordId unique+sparse: ensured');
  } catch (e) {
    console.log(`index users.discord.discordId: SKIPPED (${e.codeName || e.message})`);
  }

  const totalUsers = await users.countDocuments();
  const linkedUsers = await users.countDocuments({ 'discord.discordId': { $exists: true, $ne: null } });
  console.log(`users: ${totalUsers} total, ${linkedUsers} discord-linked`);

  // 2. Duplicate Discord links (must be zero; report only).
  const dupes = await users.aggregate([
    { $match: { 'discord.discordId': { $exists: true, $ne: null } } },
    { $group: { _id: '$discord.discordId', n: { $sum: 1 }, emails: { $push: '$email' } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  console.log(`duplicate discord links: ${dupes.length}`);
  for (const d of dupes.slice(0, 20)) console.log(`  ${d._id} -> ${d.emails.join(', ')}`);

  // 3. Non-lowercase emails (canonical key is lowercase).
  const mixed = await users.find({ email: { $regex: '[A-Z]' } }).project({ email: 1 }).limit(20).toArray();
  console.log(`non-lowercase emails (sample): ${mixed.length ? mixed.map((u) => u.email).join(', ') : 'none'}`);

  // 4. Dashboard-only Discord sessions (no linked User — explicit link needed).
  const sessions = db.collection('discord_sessions');
  const linkedIds = new Set(
    (await users.find({ 'discord.discordId': { $exists: true, $ne: null } }).project({ 'discord.discordId': 1 }).toArray())
      .map((u) => u.discord && u.discord.discordId).filter(Boolean),
  );
  const recentSessions = await sessions.find({ revoked: { $ne: true } }).project({ discordId: 1 }).limit(5000).toArray();
  const orphaned = [...new Set(recentSessions.map((s) => s.discordId).filter((id) => id && !linkedIds.has(id)))];
  console.log(`dashboard-only discord identities (no Muragoods account): ${orphaned.length}`);

  // 5. Backfill discordId denorms from the linked Users table.
  const linked = await users.find({ 'discord.discordId': { $exists: true, $ne: null } })
    .project({ email: 1, 'discord.discordId': 1 }).toArray();
  const targets = [
    ['game_progress', 'userEmail'],
    ['user_preferences', 'userEmail'],
    ['user_activities', 'userEmail'],
    ['game_rewards', 'userEmail'],
  ];
  let planned = 0;
  for (const { email, discord } of linked) {
    const emailLc = String(email).toLowerCase();
    const discordId = discord && discord.discordId;
    if (!discordId) continue;
    for (const [coll, field] of targets) {
      const res = APPLY
        ? await db.collection(coll).updateMany(
            { [field]: emailLc, discordId: { $ne: discordId } },
            { $set: { discordId } },
          )
        : await db.collection(coll).countDocuments({ [field]: emailLc, discordId: { $ne: discordId } });
      const n = APPLY ? res.modifiedCount : res;
      planned += n;
      if (n > 0) console.log(`  ${APPLY ? 'backfilled' : 'would backfill'} ${n} in ${coll} for ${emailLc}`);
    }
  }
  console.log(`${APPLY ? 'backfilled' : 'would backfill'} discordId rows total: ${planned}`);

  await client.close();
  console.log('done');
}

main().catch((e) => { console.error('migration failed:', e.message); process.exit(1); });
