// Rename GameDefinition.isNew -> isNewItem in MongoDB.
//
// `isNew` is a reserved Mongoose pathname, so the schema field was renamed.
// Existing rows still carry the legacy key, so this copies the value across
// and drops the old key. Data-preserving and idempotent: it never deletes a
// value, it only moves it, and re-running it is a no-op.
//
//   node scripts/migrate-gamedef-isnew.mjs            # dry run (default)
//   node scripts/migrate-gamedef-isnew.mjs --apply    # perform the update
//
// Rows that already carry `isNewItem` keep that value; the legacy key is only
// used when the new one is missing. A live deploy keeps reading legacy rows
// correctly in the meantime (model init hook + endpoint fallbacks).

import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('MONGODB_URI (or MONGO_URI) is required');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const games = client.db().collection('game_definitions');
    console.log(`mode: ${APPLY ? 'APPLY' : 'dry-run'}  collection: game_definitions`);

    const total = await games.countDocuments({});
    const legacy = await games.countDocuments({ isNew: { $exists: true } });
    const fresh = await games.countDocuments({ isNewItem: { $exists: true } });
    console.log(`rows: ${total} total, ${legacy} legacy isNew, ${fresh} isNewItem`);

    if (legacy === 0) {
      console.log('nothing to migrate');
      return;
    }
    if (!APPLY) {
      console.log('re-run with --apply to migrate');
      return;
    }

    // Pipeline update: keep an existing isNewItem, else adopt isNew; then drop
    // the legacy key. Running twice is a no-op (the second pass matches 0).
    const result = await games.updateMany({ isNew: { $exists: true } }, [
      { $set: { isNewItem: { $ifNull: ['$isNewItem', '$isNew'] } } },
      { $unset: 'isNew' },
    ]);
    console.log(`migrated ${result.modifiedCount} row(s)`);

    const stillLegacy = await games.countDocuments({ isNew: { $exists: true } });
    const nowFresh = await games.countDocuments({ isNewItem: { $exists: true } });
    console.log(`after: ${nowFresh} isNewItem, ${stillLegacy} legacy remaining`);
    if (stillLegacy > 0) {
      console.error('legacy keys remain — investigate before deploying');
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});