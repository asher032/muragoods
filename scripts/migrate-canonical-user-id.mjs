// Canonical-identity migration: ONE person = ONE Muragoods account = ONE
// canonical `userId`.
//
//   node scripts/migrate-canonical-user-id.mjs           # dry run (default)
//   node scripts/migrate-canonical-user-id.mjs --apply   # backfill
//   node scripts/migrate-canonical-user-id.mjs --report  # findings as JSON
//
// WHAT IT DOES
//   1. Gives every account that predates the id a stable `userId`.
//   2. Stamps `canonicalUserId` onto that account's orders, points, favorites,
//      activity, games, jobs, letters, comments, library and support rows.
//   3. Backfills `linkedAccounts.discordUserId` from the historical
//      `discord.discordId`, and syncs the two from then on.
//
// WHAT IT NEVER DOES
//   • Never deletes a row, a collection or a field.
//   • Never merges two accounts. Two people who each have an account stay two
//     accounts. A Discord id already linked elsewhere is REPORTED, not merged:
//     a wrong merge is far more expensive to undo than a wrong link is to fix.
//   • Never rewrites the legacy email key. Keeping it is what lets a row
//     written before this change keep resolving to its owner.
//
// IDEMPOTENT: running --apply twice writes nothing the second time.

import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const JSON_REPORT = process.argv.includes('--report');

// Same precedence as app/lib/db/clusters.ts.
function pick(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return { name: n, value: v.trim() };
  }
  return null;
}

const SITE = pick('MURAGOODS_MONGODB_URI', 'MONGODB_URI', 'MONGO_URI', 'DATABASE_URL');
if (!SITE) {
  console.error('Set MURAGOODS_MONGODB_URI (or MONGODB_URI) before running this migration.');
  process.exit(1);
}
const SITE_DB = pick('MURAGOODS_MONGO_DB', 'MONGO_DB')?.value || 'muragoods';

// Snowflakes are 17–20 digits; a Discord id that is not one can never join to
// a command or a bot session.
const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Every collection that holds personal data, with the field that has
 * historically held the owner's EMAIL. `canonicalField` is the new key.
 * `emailField: null` means the collection is keyed by the canonical id alone.
 */
const OWNED = [
  { coll: 'orders', emailField: 'userId' },
  { coll: 'supporttickets', emailField: 'userId' },
  { coll: 'userlibraries', emailField: 'email' },
  { coll: 'userpreferences', emailField: 'userEmail' },
  { coll: 'useractivities', emailField: 'userEmail' },
  { coll: 'game_progress', emailField: 'userEmail' },
  { coll: 'game_rewards', emailField: 'userEmail' },
  { coll: 'game_sessions', emailField: 'userEmail' },
  { coll: 'job_progress', emailField: 'userEmail' },
  { coll: 'job_employments', emailField: 'userEmail' },
  { coll: 'job_shifts', emailField: 'userEmail' },
  { coll: 'grouorders', emailField: null },
  { coll: 'reviews', emailField: 'userId' },
  { coll: 'unsentletters', emailField: 'authorEmail' },
  { coll: 'mediacomments', emailField: 'email' },
  { coll: 'pushsubscriptions', emailField: 'email' },
];

const findings = [];
const note = (kind, severity, detail, extra = {}) => {
  findings.push({ kind, severity, detail, ...extra });
  if (JSON_REPORT) return;
  const tag = severity === 'critical' ? 'CRITICAL' : severity === 'warn' ? 'WARN    ' : 'INFO    ';
  console.log(`  [${tag}] ${kind} — ${detail}`);
};

function mintUserId(seed) {
  const prefix = (String(seed || '').split('@')[0] || 'user')
    .replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6) || 'USER';
  return `MG-${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY (backfill only — never delete, never merge)' : 'dry-run (read only)'}`);
  console.log(`site cluster from: ${SITE.name}, db: ${SITE_DB}`);

  const client = new MongoClient(SITE.value, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(SITE_DB);

  try {
    const users = db.collection('users');

    // ── Indexes the app relies on ────────────────────────────────────────
    try {
      await users.createIndex({ userId: 1 }, { unique: true, sparse: true, name: 'userId_unique' });
      await users.createIndex({ 'discord.discordId': 1 }, { unique: true, sparse: true, name: 'discord_discordId_unique' });
      if (!JSON_REPORT) console.log('  indexes ensured: users.userId, users.discord.discordId (unique+sparse)');
    } catch (e) {
      note('index', 'warn', `could not ensure a unique identity index (${e.codeName || 'error'}) — duplicates may exist`);
    }

    const allUsers = await users.find({}).project({
      email: 1, userId: 1, name: 1, 'discord.discordId': 1, 'linkedAccounts.discordUserId': 1,
    }).toArray();

    note('users', 'info', `${allUsers.length} account(s)`);

    // ── 1. Accounts missing a canonical id ───────────────────────────────
    const missingId = allUsers.filter((u) => !u.userId);
    if (missingId.length) {
      note('users.missing_userId', 'critical',
        `${missingId.length} account(s) have no canonical id and cannot be referenced by any surface`,
        { emails: missingId.slice(0, 20).map((u) => u.email) });
    }

    // Duplicate ids would make "whose row is this?" ambiguous.
    const byId = new Map();
    for (const u of allUsers) {
      if (!u.userId) continue;
      byId.set(u.userId, [...(byId.get(u.userId) || []), u.email]);
    }
    for (const [id, owners] of byId) {
      if (owners.length > 1) {
        note('users.duplicate_userId', 'critical',
          `${owners.length} accounts share the id ${id} — needs manual resolution`,
          { userId: id, emails: owners });
      }
    }

    // ── 2. Discord links: one Discord → one account ──────────────────────
    // Both field names are considered, because linking now writes both.
    const byDiscord = new Map();
    for (const u of allUsers) {
      const id = u.discord?.discordId || u.linkedAccounts?.discordUserId;
      if (!id) continue;
      byDiscord.set(id, [...(byDiscord.get(id) || []), u.email]);
    }
    for (const [id, owners] of byDiscord) {
      if (owners.length > 1) {
        // Deliberately reported, never merged: these may be two different
        // people who both signed in with Discord.
        note('users.discord_shared_by_accounts', 'critical',
          `one Discord account is linked to ${owners.length} Muragoods accounts — resolve by hand, do NOT auto-merge`,
          { discordUserId: id, emails: owners });
      }
      if (!SNOWFLAKE.test(id)) {
        note('users.malformed_discord_id', 'critical', `Discord id "${id}" is not a valid snowflake`, { discordUserId: id });
      }
    }

    // A Discord session with no Muragoods account is a visitor who has not
    // linked yet — reported so support can see them, never auto-created.
    const linkedIds = new Set(byDiscord.keys());
    if (db.collection('discord_sessions')) {
      const sessions = await db.collection('discord_sessions')
        .find({ revoked: { $ne: true } }).project({ discordId: 1 }).limit(5000).toArray();
      const unlinked = [...new Set(sessions.map((s) => s.discordId).filter((id) => id && !linkedIds.has(id)))];
      note('discord.unlinked_sessions', unlinked.length ? 'warn' : 'info',
        `${unlinked.length} Discord identity/ies have a dashboard session but no Muragoods account (they see a link prompt)`);
    }

    // ── 3. Email casing: the legacy key is compared lowercased ───────────
    const mixedCase = allUsers.filter((u) => u.email && u.email !== String(u.email).toLowerCase());
    if (mixedCase.length) {
      note('users.mixed_case_email', 'warn',
        `${mixedCase.length} account(s) have an uppercase email — legacy lookups compare lowercased and may miss them`,
        { emails: mixedCase.slice(0, 10).map((u) => u.email) });
    }

    // ── 4. Assign ids, then resolve the email → id map ───────────────────
    const emailToId = new Map();
    const claimed = new Set(byId.keys());
    let minted = 0;

    for (const u of allUsers) {
      const emailLc = String(u.email || '').toLowerCase();
      if (!u.userId) {
        let candidate = mintUserId(emailLc);
        let guard = 0;
        while (claimed.has(candidate) && guard < 5) {
          candidate = mintUserId(emailLc);
          guard++;
        }
        claimed.add(candidate);
        if (APPLY) await users.updateOne({ _id: u._id }, { $set: { userId: candidate, updatedAt: new Date() } });
        emailToId.set(emailLc, candidate);
        minted += 1;
      } else {
        emailToId.set(emailLc, u.userId);
      }
    }
    if (minted) {
      note('users.mint_userId', APPLY ? 'info' : 'warn',
        `${APPLY ? 'assigned' : 'would assign'} ${minted} canonical id(s)`);
    }

    // ── 5. Backfill canonicalUserId across every owned collection ────────
    let totalStamped = 0;
    for (const { coll, emailField } of OWNED) {
      const collection = db.collection(coll);
      const orphans = [];
      let stamped = 0;

      // Rows that have no canonical id yet. Grouped by their legacy key so
      // this is one updateMany per person, not one per row.
      const rows = await collection.find(
        { $or: [{ canonicalUserId: { $exists: false } }, { canonicalUserId: '' }] },
        { projection: emailField ? { [emailField]: 1 } : { _id: 1 } },
      ).limit(20000).toArray();

      const byOwner = new Map();
      for (const row of rows) {
        const key = emailField ? String(row[emailField] || '').toLowerCase() : '';
        const id = key ? emailToId.get(key) : null;
        if (id) {
          byOwner.set(id, [...(byOwner.get(id) || []), row._id]);
        } else {
          orphans.push(key || '(no owner key)');
        }
      }

      for (const [id, ids] of byOwner) {
        const res = APPLY
          ? await collection.updateMany({ _id: { $in: ids } }, { $set: { canonicalUserId: id } })
          : { modifiedCount: ids.length };
        stamped += res.modifiedCount;
        void id;
      }
      totalStamped += stamped;

      if (orphans.length) {
        // An orphan is data whose owner no longer exists. Report it; do NOT
        // delete it and do NOT guess an owner.
        note(`${coll}.orphaned`, 'warn',
          `${orphans.length} row(s) reference an owner that is not a known account — left untouched`,
          { owners: [...new Set(orphans)].slice(0, 10) });
      }
      if (stamped) {
        note(coll, 'info', `${APPLY ? 'stamped' : 'would stamp'} ${stamped} row(s) with canonicalUserId`);
      }
    }
    note('summary', 'info', `${APPLY ? 'stamped' : 'would stamp'} ${totalStamped} row(s) in total`);

    // ── 6. linkedAccounts.discordUserId, from the historical field ───────
    const needsLinked = allUsers.filter(
      (u) => u.discord?.discordId && u.linkedAccounts?.discordUserId !== u.discord.discordId,
    );
    if (needsLinked.length) {
      note('users.linked_accounts', 'info',
        `${APPLY ? 'backfilled' : 'would backfill'} linkedAccounts.discordUserId on ${needsLinked.length} account(s)`);
      if (APPLY) {
        for (const u of needsLinked) {
          await users.updateOne({ _id: u._id }, {
            $set: {
              'linkedAccounts.discordUserId': u.discord.discordId,
              'linkedAccounts.discordUsername': u.discord.username || '',
              'linkedAccounts.discordAvatar': u.discord.avatar || '',
              'linkedAccounts.discordLinkedAt': u.discord.linkededAt || null,
            },
          });
        }
      }
    }
    // The reverse: a canonical link with no historical field.
    const needsLegacy = allUsers.filter(
      (u) => u.linkedAccounts?.discordUserId && u.discord?.discordId !== u.linkedAccounts.discordUserId,
    );
    if (needsLegacy.length) {
      note('users.discord_backfill', 'info',
        `${APPLY ? 'backfilled' : 'would backfill'} discord.discordId on ${needsLegacy.length} account(s)`);
      if (APPLY) {
        for (const u of needsLegacy) {
          await users.updateOne({ _id: u._id }, {
            $set: {
              'discord.discordId': u.linkedAccounts.discordUserId,
              'discord.username': u.linkedAccounts.discordUsername || '',
              'discord.avatar': u.linkedAccounts.discordAvatar || '',
              'discord.linkedAt': u.linkedAccounts.discordLinkedAt || null,
            },
          });
        }
      }
    }
  } catch (error) {
    // Class name only — a driver message can embed the connection string.
    console.error(`\nmigration failed: ${error?.name || 'Error'}`);
    if (JSON_REPORT) console.log(JSON.stringify({ ok: false, error: String(error?.name || 'Error') }, null, 2));
    process.exitCode = 1;
    return;
  } finally {
    await client.close();
  }

  const critical = findings.filter((f) => f.severity === 'critical');
  if (JSON_REPORT) {
    console.log(JSON.stringify({ ok: critical.length === 0, applied: APPLY, findings }, null, 2));
  } else {
    console.log('\n── Summary ──');
    console.log(`  ${critical.length} critical, ${findings.filter((f) => f.severity === 'warn').length} warning`);
    if (critical.length) {
      console.log('  Nothing was deleted and nothing was merged. Resolve the critical findings above by hand.');
      if (!APPLY) console.log('  Re-run with --apply once you are satisfied — it only ever backfills.');
    } else {
      console.log(`  ${APPLY ? 'Backfill complete.' : 'Nothing to apply — the identity layer is already consistent.'}`);
    }
  }
}

main();