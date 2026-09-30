// Database consistency audit — REPORT ONLY by default.
//
//   node scripts/audit-db-consistency.mjs           # dry run (default)
//   node scripts/audit-db-consistency.mjs --apply   # write backfills only
//
// The ecosystem has ONE user identity (users.userId) and TWO clusters. This
// script finds the places that reality disagrees with that, so a human can
// decide what to do. It NEVER deletes and NEVER merges accounts: a wrong merge
// is far more expensive to undo than a wrong balance is to investigate.
//
// `--apply` is deliberately narrow. It only ever ADDS a missing
// `canonicalUserId` to a Murabot economy row that already has a resolvable
// Discord link. It never removes a field, never moves a balance, and never
// touches a row it could not fully resolve.
//
// SECURITY: the connection string is read from the environment and is never
// printed. Errors are reported by class name only — a driver message can
// embed the URI.

import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');

// Same precedence as app/lib/db/clusters.ts and discord-bot/bot/config.py.
const pick = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return { name: n, value: v.trim() };
  }
  return null;
};

const MURABOT = pick('MURABOT_MONGODB_URI', 'MONGODB_URI', 'MONGO_URI', 'DATABASE_URL');
const MURAGOODS = pick('MURAGOODS_MONGODB_URI', 'MONGODB_URI');

if (!MURABOT) {
  console.error('Set MURABOT_MONGODB_URI (or MONGODB_URI) before running this audit.');
  process.exit(1);
}

const MURABOT_DB = pick('MURABOT_MONGO_DB', 'DISCORD_BOT_MONGO_DB', 'MONGO_DB')?.value
  || 'murastream_bot';
const MURAGOODS_DB = pick('MURAGOODS_MONGO_DB', 'MONGO_DB')?.value || 'muragoods';

// Discord snowflakes are 17–20 digits. Anything else in a guild/user id field
// is junk from a bad import and is reported, never deleted.
const SNOWFLAKE = /^\d{17,20}$/;

const findings = [];
const note = (cluster, kind, severity, detail) => {
  findings.push({ cluster, kind, severity, detail });
  const tag = severity === 'critical' ? 'CRITICAL' : severity === 'warn' ? 'WARN    ' : 'INFO    ';
  console.log(`  [${tag}] ${cluster}: ${kind} — ${detail}`);
};

/** Only ever ADDS a field. Returns true when it wrote. */
async function backfillCanonical(collection, filter, canonicalUserId) {
  if (!APPLY || !canonicalUserId) return false;
  const res = await collection.updateOne(filter, {
    $set: { canonicalUserId, canonicalLinkedAt: new Date() },
  });
  return res.modifiedCount > 0;
}

async function auditIdentity(db) {
  console.log('\n── Identity (Muragoods cluster) ──');
  const users = db.collection('users');

  const total = await users.countDocuments({});
  note('muragoods', 'users.total', 'info', `${total} account(s)`);

  // A user with no canonical id can never be referenced by another surface.
  const missingId = await users
    .find({ $or: [{ userId: { $exists: false } }, { userId: null }, { userId: '' }] })
    .project({ email: 1, discord: 1 })
    .limit(200)
    .toArray();
  if (missingId.length) {
    note('muragoods', 'users.missing_canonical_id', 'critical',
      `${missingId.length} account(s) have no userId — these cannot be linked from Discord`);
  }

  // Two accounts claiming the same Discord account is the exact failure that
  // produces two competing identities.
  const linked = await users
    .find({ 'discord.discordId': { $exists: true, $nin: [null, ''] } })
    .project({ userId: 1, discord: 1 })
    .limit(5000)
    .toArray();

  const byDiscord = new Map();
  for (const u of linked) {
    const id = u.discord?.discordId;
    if (!id) continue;
    if (!byDiscord.has(id)) byDiscord.set(id, []);
    byDiscord.get(id).push(u.userId || String(u._id));
  }
  for (const [id, owners] of byDiscord) {
    if (owners.length > 1) {
      note('muragoods', 'users.duplicate_discord_link', 'critical',
        `a Discord account is linked to ${owners.length} accounts — needs manual linking`);
    }
  }

  // A stored Discord id that is not a snowflake can never join to a command.
  const malformed = [...byDiscord.keys()].filter((id) => !SNOWFLAKE.test(id));
  if (malformed.length) {
    note('muragoods', 'users.malformed_discord_id', 'critical',
      `${malformed.length} linked Discord id(s) are not a valid snowflake`);
  }

  const unlinked = total - linked.length;
  console.log(`  linked Discord accounts: ${byDiscord.size}; accounts with no link: ${unlinked}`);

  return new Set([...byDiscord.keys()].filter((id) => SNOWFLAKE.test(id)));
}

async function auditMurabot(db, linkedDiscordIds) {
  console.log('\n── Murabot data ──');

  const economy = db.collection('economy');
  const inventory = db.collection('economy_inv');
  const txns = db.collection('economy_tx');

  const economyTotal = await economy.countDocuments({});
  note('murabot', 'economy.wallets', 'info', `${economyTotal} wallet(s)`);

  // Economy is keyed by snowflake. A non-snowflake id is junk from a bad
  // import: it can never be joined to a Discord link.
  const badIds = await economy
    .find({ $or: [{ guildId: { $not: /^\d{17,20}$/ } }, { userId: { $not: /^\d{17,20}$/ } }] })
    .project({ guildId: 1, userId: 1 })
    .limit(200)
    .toArray();
  if (badIds.length) {
    note('murabot', 'economy.invalid_id', 'critical',
      `${badIds.length} wallet(s) have a guild or user id that is not a snowflake`);
  }

  // Missing canonical reference. Reported, and backfilled only with --apply.
  const missingCanonical = await economy
    .find({ $or: [{ canonicalUserId: { $exists: false } }, { canonicalUserId: null }] })
    .project({ guildId: 1, userId: 1 })
    .limit(1000)
    .toArray();
  const resolvable = missingCanonical.filter((r) => linkedDiscordIds.has(String(r.userId)));
  note('murabot', 'economy.missing_canonical_id', missingCanonical.length ? 'warn' : 'info',
    `${missingCanonical.length} wallet(s) carry no canonicalUserId; ` +
    `${resolvable.length} of them are linked and ${APPLY ? 'can be' : 'could be'} backfilled`);

  let backfilled = 0;
  if (APPLY) {
    for (const row of resolvable.slice(0, 500)) {
      const linked = await resolveCanonical(db, row.userId);
      if (await backfillCanonical(economy, { guildId: row.guildId, userId: row.userId }, linked)) {
        backfilled += 1;
      }
    }
    console.log(`  backfilled ${backfilled} wallet(s) — no other field was touched`);
  }

  // A wallet with no inventory row is normal (never bought an item). An
  // inventory row with no wallet is not: it is orphaned.
  const orphanInventory = await inventory
    .find({ userId: { $exists: true } })
    .limit(5000)
    .toArray();
  let orphans = 0;
  for (const row of orphanInventory) {
    const wallet = await economy.findOne(
      { guildId: row.guildId, userId: row.userId }, { projection: { _id: 1 } });
    if (!wallet) orphans += 1;
  }
  if (orphans) {
    note('murabot', 'inventory.orphaned', 'warn',
      `${orphans} inventory row(s) have no matching wallet — reported, not removed`);
  }

  // Duplicate transaction ids would break the audit trail.
  const dupes = await txns.aggregate([
    { $match: { txId: { $type: 'string' } } },
    { $group: { _id: '$txId', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 50 },
  ]).toArray();
  if (dupes.length) {
    note('murabot', 'economy_tx.duplicate_txid', 'critical',
      `${dupes.length} transaction id(s) appear more than once — the ledger is not unique`);
  }

  const txTotal = await txns.countDocuments({});
  note('murabot', 'economy_tx.total', 'info', `${txTotal} transaction(s)`);

  // Negative balances are never valid and indicate a broken write.
  const negative = await economy.countDocuments({
    $or: [{ balance: { $lt: 0 } }, { bank: { $lt: 0 } }],
  });
  if (negative) {
    note('murabot', 'economy.negative_balance', 'critical',
      `${negative} wallet(s) hold a negative balance`);
  }

  // Guild config is the dashboard's primary read.
  const guilds = await db.collection('guild_config').countDocuments({});
  note('murabot', 'guild_config.total', 'info', `${guilds} guild(s) configured`);
}

async function resolveCanonical(db, discordId) {
  // The Murabot cluster does not hold the identity; when both clusters are the
  // same (the common case) this still works, otherwise the owner is expected
  // to run the backfill with both variables set.
  const user = await db.collection('users').findOne(
    { 'discord.discordId': String(discordId) }, { projection: { userId: 1 } });
  return user?.userId || null;
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY (backfill only, never delete)' : 'dry-run (read only)'}`);
  // Variable NAMES only — never the values.
  console.log(`murabot cluster from: ${MURABOT.name}, db: ${MURABOT_DB}`);
  console.log(`muragoods cluster from: ${MURAGOODS?.name ?? 'not set'}, db: ${MURAGOODS_DB}`);

  const client = new MongoClient(MURABOT.value, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const db = client.db(MURABOT_DB);
    // Identity lives on the site cluster. When both variables point at the
    // same cluster — the usual case today — the same handle serves both.
    const identityDb = MURAGOODS ? client.db(MURAGOODS_DB) : db;
    const linked = await auditIdentity(identityDb);
    await auditMurabot(db, linked);
  } catch (error) {
    // Class name only: a driver message can embed the connection string.
    console.error(`\naudit failed: ${error?.name || 'Error'}`);
    process.exitCode = 1;
    return;
  } finally {
    await client.close();
  }

  const critical = findings.filter((f) => f.severity === 'critical');
  const warn = findings.filter((f) => f.severity === 'warn');
  console.log('\n── Summary ──');
  console.log(`  ${critical.length} critical, ${warn.length} warning, ${findings.length} total`);
  if (critical.length || warn.length) {
    console.log('  Nothing was deleted. Review the findings above and link or repair by hand.');
  }
  if (APPLY && critical.length) {
    console.log('  --apply only backfills canonicalUserId; it does not resolve the critical findings above.');
  }
}

main();
