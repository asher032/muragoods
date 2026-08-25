/**
 * Migration Script: GCash → InstaPay
 * 
 * Renames database fields and updates payment values:
 *   - gcashRefNumber       → instaPayRefNumber
 *   - gcashScreenshotUrl   → instaPayScreenshotUrl
 *   - payment: "GCash"     → payment: "InstaPay"
 * 
 * Usage:
 *   node scripts/migrate-gcash-to-instapay.js [--dry-run]
 * 
 * Requires MONGODB_URI env var or defaults to mongodb://localhost:27017/muragoods
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/muragoods';
const DRY_RUN = process.argv.includes('--dry-run');

async function migrate() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('orders');

    console.log('🔄 Starting migration: GCash → InstaPay');
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
    console.log(`   URI:  ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    console.log('');

    // Step 1: Rename fields using $rename
    console.log('📝 Step 1: Renaming gcashRefNumber → instaPayRefNumber');
    const renameResult1 = DRY_RUN
      ? await collection.countDocuments({ gcashRefNumber: { $exists: true } })
      : await collection.updateMany(
          { gcashRefNumber: { $exists: true } },
          { $rename: { gcashRefNumber: 'instaPayRefNumber' } }
        );
    console.log(`   ${DRY_RUN ? `Would update ${renameResult1} docs` : `Updated ${renameResult1.modifiedCount} documents`}`);

    console.log('📝 Step 2: Renaming gcashScreenshotUrl → instaPayScreenshotUrl');
    const renameResult2 = DRY_RUN
      ? await collection.countDocuments({ gcashScreenshotUrl: { $exists: true } })
      : await collection.updateMany(
          { gcashScreenshotUrl: { $exists: true } },
          { $rename: { gcashScreenshotUrl: 'instaPayScreenshotUrl' } }
        );
    console.log(`   ${DRY_RUN ? `Would update ${renameResult2} docs` : `Updated ${renameResult2.modifiedCount} documents`}`);

    // Step 2: Update payment field values
    console.log('📝 Step 3: Updating payment field "GCash" → "InstaPay"');
    const paymentResult = DRY_RUN
      ? await collection.countDocuments({ payment: 'GCash' })
      : await collection.updateMany(
          { payment: 'GCash' },
          { $set: { payment: 'InstaPay' } }
        );
    console.log(`   ${DRY_RUN ? `Would update ${paymentResult} docs` : `Updated ${paymentResult.modifiedCount} documents`}`);

    // Step 3: Summary
    const totalDocs = await collection.countDocuments({});
    const remainingGCash = await collection.countDocuments({ payment: 'GCash' });
    const withNewRef = await collection.countDocuments({ instaPayRefNumber: { $exists: true, $ne: null } });

    console.log('');
    console.log('📊 Migration Summary:');
    console.log(`   Total orders:          ${totalDocs}`);
    console.log(`   Remaining GCash:       ${remainingGCash}`);
    console.log(`   With InstaPay ref:     ${withNewRef}`);
    console.log('');
    console.log(DRY_RUN ? '⚠️  Dry run complete. Re-run without --dry-run to apply.' : '✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrate();
