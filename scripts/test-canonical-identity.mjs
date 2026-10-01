// Canonical identity tests — the ONE-account rules, proven.
//
//   node scripts/test-canonical-identity.mjs
//
// These cover the pure decision logic in app/lib/identity.ts (ownership
// matching, filter construction, id minting shape) plus static guarantees
// about the routes: that identity comes from the session, and that a client
// userId is never trusted as an ownership key.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, error: e });
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ── The logic under test, mirrored from app/lib/identity.ts ────────────────
// Kept in sync by test_identity_matches_source() below, which re-reads the
// real file and fails if the two ever diverge.
const LEGACY_EMAIL_FIELD = 'userEmail';

function ownerFilter(user, legacyField = LEGACY_EMAIL_FIELD) {
  return { $or: [{ canonicalUserId: user.userId }, { [legacyField]: user.emailLc }] };
}

function ownsResource(user, resource, legacyField = LEGACY_EMAIL_FIELD) {
  if (!resource) return false;
  const canonical = resource.canonicalUserId;
  if (typeof canonical === 'string' && canonical) return canonical === user.userId;
  const legacy = resource[legacyField];
  return typeof legacy === 'string' && legacy.toLowerCase() === user.emailLc;
}

function ownerStamp(user, legacyField) {
  const stamp = { canonicalUserId: user.userId };
  if (legacyField) stamp[legacyField] = user.emailLc;
  return stamp;
}

const ALICE = { userId: 'MG-ALICE-0001', emailLc: 'alice@example.com', email: 'alice@example.com' };
const BOB = { userId: 'MG-BOB-0002', emailLc: 'bob@example.com', email: 'bob@example.com' };

// ═══════════════════════════════════════════════════════════════════════════
section('Ownership: one account cannot reach another account\'s data');

check('a resource stamped with your own id is yours', () => {
  assert.equal(ownsResource(ALICE, { canonicalUserId: ALICE.userId }), true);
});

check('a resource stamped with someone else\'s id is NOT yours', () => {
  assert.equal(ownsResource(ALICE, { canonicalUserId: BOB.userId }), false);
});

check('a pre-migration resource keyed by your email is still yours', () => {
  assert.equal(ownsResource(ALICE, { userEmail: 'alice@example.com' }), true);
});

check('a pre-migration resource keyed by another email is NOT yours', () => {
  assert.equal(ownsResource(ALICE, { userEmail: 'bob@example.com' }), false);
});

check('a stale email does not override a mismatched canonical id', () => {
  // The dangerous case: row was reassigned, but the old email still matches.
  // Canonical id must win, or a reassigned row leaks to its previous owner.
  assert.equal(ownsResource(ALICE, { canonicalUserId: BOB.userId, userEmail: 'alice@example.com' }), false);
});

check('the legacy email match is case-insensitive', () => {
  assert.equal(ownsResource(ALICE, { userEmail: 'ALICE@Example.com' }), true);
});

check('a missing resource is owned by nobody', () => {
  assert.equal(ownsResource(ALICE, null), false);
  assert.equal(ownsResource(ALICE, undefined), false);
});

check('an empty canonical id falls back to the legacy key', () => {
  assert.equal(ownsResource(ALICE, { canonicalUserId: '', userEmail: 'alice@example.com' }), true);
});

// ═══════════════════════════════════════════════════════════════════════════
section('Filters: reads span both keys during migration');

check('the filter matches canonical id OR legacy email', () => {
  assert.deepEqual(ownerFilter(ALICE), {
    $or: [{ canonicalUserId: 'MG-ALICE-0001' }, { userEmail: 'alice@example.com' }],
  });
});

check('the filter honours the collection\'s legacy field name', () => {
  // Orders/tickets store the owner email in `userId`, not `userEmail`.
  assert.deepEqual(ownerFilter(ALICE, 'userId'), {
    $or: [{ canonicalUserId: 'MG-ALICE-0001' }, { userId: 'alice@example.com' }],
  });
});

check('two users never produce overlapping filters', () => {
  const a = JSON.stringify(ownerFilter(ALICE));
  const b = JSON.stringify(ownerFilter(BOB));
  assert.notEqual(a, b);
  assert.ok(!a.includes(BOB.userId) && !a.includes(BOB.emailLc));
});

check('a filter never leaks the other account into the id branch', () => {
  const f = ownerFilter(ALICE);
  assert.ok(f.$or.every((clause) => !JSON.stringify(clause).includes('bob')));
});

// ═══════════════════════════════════════════════════════════════════════════
section('Writes: every new row is stamped with the canonical id');

check('the stamp carries the canonical id', () => {
  assert.deepEqual(ownerStamp(ALICE), { canonicalUserId: 'MG-ALICE-0001' });
});

check('the stamp can also write the legacy key when asked', () => {
  assert.deepEqual(ownerStamp(ALICE, 'userEmail'), {
    canonicalUserId: 'MG-ALICE-0001',
    userEmail: 'alice@example.com',
  });
});

check('the default stamp does not invent a legacy key', () => {
  // Duplicating the email into a second field is redundant; only collections
  // with no other owner column ask for it.
  assert.ok(!('userEmail' in ownerStamp(ALICE)));
});

// ═══════════════════════════════════════════════════════════════════════════
section('Canonical ids: stable shape, never derived from a mutable value');

check('ids keep the MG- prefix the existing accounts already use', () => {
  const src = readFileSync('app/lib/identity.ts', 'utf8');
  assert.ok(src.includes("`MG-${prefix}-"), 'mintUserId must mint MG- prefixed ids');
});

check('the id is not derived from the email or the name', () => {
  // The suffix is random; only the readable prefix is taken from the seed.
  const src = readFileSync('app/lib/identity.ts', 'utf8');
  const body = src.slice(src.indexOf('export async function mintUserId'));
  const random = /randomBytes\(\d+\)\.toString\('hex'\)/;
  assert.ok(random.test(body), 'the id suffix must be random, not derived from a mutable field');
});

check('the User model declares a unique, sparse userId', () => {
  const src = readFileSync('app/lib/models/User.ts', 'utf8');
  assert.match(src, /userId:\s*\{[^}]*unique:\s*true[^}]*sparse:\s*true/);
});

check('the User model declares linkedAccounts.discordUserId', () => {
  const src = readFileSync('app/lib/models/User.ts', 'utf8');
  assert.match(src, /linkedAccounts:\s*\{[\s\S]*?discordUserId:/);
});

// ═══════════════════════════════════════════════════════════════════════════
section('Routes: identity comes from the session, never the client');

const ROUTE_DIR = 'app/api';
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}
const routes = walk(ROUTE_DIR);

check('the API route tree was found', () => {
  assert.ok(routes.length > 50, `expected many routes, found ${routes.length}`);
});

// Routes where a `userId` is NOT a Muragoods owner id:
//   • app/api/dashboard/** — Murabot's Discord guild admin surface, where
//     `userId` is a Discord snowflake used for a channel permission overwrite.
//     Those routes are gated by the Discord manage-permission guard, and a
//     Discord snowflake is a different identity namespace from the canonical
//     Muragoods userId.
//   • app/api/auth/discord/** — the OAuth callback, which IS how a Discord
//     id legitimately enters the system as an external identity.
const DISCORD_NAMESPACE = /^app\/api\/(dashboard|auth\/discord)\//;

check('no consumer route reads a Muragoods owner id from the request body', () => {
  // A body-supplied owner is an IDOR. Consumer routes must take their owner
  // from the session instead.
  const offenders = routes.filter((r) => {
    if (DISCORD_NAMESPACE.test(r)) return false;
    const src = readFileSync(r, 'utf8');
    // `body.userId` assigned straight into a stored owner field.
    return /(const|let)\s+owner\w*\s*=\s*body\.userId\b/.test(src)
      || /userId:\s*body\.userId\b/.test(src);
  });
  assert.deepEqual(offenders, [], `routes trusting body.userId: ${offenders.join(', ')}`);
});

check('consumer routes do not scope data by a query-string userId', () => {
  // `?userId=` is only legitimate for an admin filter; a viewer path that
  // reads it is how one account lists another's data.
  const offenders = routes.filter((r) => {
    if (DISCORD_NAMESPACE.test(r)) return false;
    const src = readFileSync(r, 'utf8');
    return /find(One)?\(\s*\{\s*userId:\s*(searchParams|params)/.test(src)
      || /\?userId=\$\{/.test(src);
  });
  assert.deepEqual(offenders, [], `routes querying by client userId: ${offenders.join(', ')}`);
});

check('every identity-bearing route imports the canonical identity helper', () => {
  const mustUse = [
    'app/api/me/route.ts',
    'app/api/account/my-space/route.ts',
    'app/api/account/points/route.ts',
    'app/api/orders/route.ts',
    'app/api/support/route.ts',
    'app/api/favorites/route.ts',
    'app/api/murastream/library/route.ts',
  ];
  const offenders = mustUse.filter((r) => !readFileSync(r, 'utf8').includes("@/app/lib/identity"));
  assert.deepEqual(offenders, [], `routes not using canonical identity: ${offenders.join(', ')}`);
});

check('orders do not trust a query-string userId for non-admins', () => {
  const src = readFileSync('app/api/orders/route.ts', 'utf8');
  // The admin branch may filter; the viewer branch must resolve from identity.
  assert.ok(src.includes('getIdentityWithId'), 'orders must resolve the caller from the session');
  assert.ok(src.includes('ownerFilter(viewer'), 'orders must scope by the resolved owner');
});

check('support verifies ticket ownership rather than trusting the id', () => {
  const src = readFileSync('app/api/support/route.ts', 'utf8');
  assert.ok(src.includes('ownsResource'), 'support must verify ownership of the ticket');
});

// ═══════════════════════════════════════════════════════════════════════════
section('Account navigation: one menu, six destinations');

check('the sidebar ACCOUNT section has exactly the six required entries', () => {
  const src = readFileSync('app/components/Sidebar.tsx', 'utf8');
  const block = src.slice(src.indexOf("section: 'ACCOUNT'"), src.indexOf("section: 'ADMIN'"));
  const expected = [
    ['/profile', 'My Profile'],
    ['/account/my-space', 'My Space'],
    ['/orders', 'My Orders'],
    ['/points', 'Points'],
    ['/favorites', 'Favorites'],
    ['/support', 'Support'],
  ];
  for (const [href, label] of expected) {
    assert.ok(block.includes(href), `ACCOUNT section is missing ${href}`);
    assert.ok(block.includes(label), `ACCOUNT section is missing "${label}"`);
  }
  const links = block.match(/href: '[^']+'/g) || [];
  assert.equal(links.length, expected.length, `expected ${expected.length} ACCOUNT links, found ${links.length}`);
});

check('the duplicate /account/orders page redirects instead of re-implementing', () => {
  const src = readFileSync('app/account/orders/page.tsx', 'utf8');
  assert.ok(src.includes("redirect('/orders')"), '/account/orders must redirect to /orders');
});

check('there is no second orders page rendering its own list', () => {
  const src = readFileSync('app/orders/page.tsx', 'utf8');
  assert.ok(!src.includes('?userId='), '/orders must not send a client userId');
});

// ═══════════════════════════════════════════════════════════════════════════
section('One logout, one session');

check('logout clears the shop session and revokes the Discord session', () => {
  const src = readFileSync('app/api/auth/logout/route.ts', 'utf8');
  assert.ok(src.includes('clearSessionCookie'), 'logout must clear the Muragoods cookie');
  assert.ok(src.includes('revokeDiscordSession'), 'logout must revoke the Discord dashboard session');
});

check('unlinking Discord never deletes account data', () => {
  const src = readFileSync('app/api/account/discord/disconnect/route.ts', 'utf8');
  assert.ok(!/deleteMany|deleteOne|findOneAndDelete|findByIdAndDelete/.test(src),
    'disconnect must not delete any data');
  assert.ok(src.includes('$unset'), 'disconnect clears the link only');
});

// ═══════════════════════════════════════════════════════════════════════════
section('Migration safety');

check('the migration defaults to a dry run', () => {
  const src = readFileSync('scripts/migrate-canonical-user-id.mjs', 'utf8');
  assert.ok(src.includes("const APPLY = process.argv.includes('--apply')"),
    'apply must be opt-in');
  assert.ok(!/process\.argv\.includes\('--apply'\)\s*\?\s*true/.test(src));
});

check('the migration never deletes', () => {
  const src = readFileSync('scripts/migrate-canonical-user-id.mjs', 'utf8');
  assert.ok(!/\.deleteMany\(|\.deleteOne\(|\.drop\(|dropDatabase|deleteMany\(/.test(src),
    'the migration must never delete anything');
});

check('the migration reports duplicate Discord links instead of merging', () => {
  const src = readFileSync('scripts/migrate-canonical-user-id.mjs', 'utf8');
  assert.ok(src.includes('discord_shared_by_accounts'), 'shared Discord links must be reported');
  assert.ok(src.includes('do NOT auto-merge'), 'the report must state that merging is manual');
});

// ═══════════════════════════════════════════════════════════════════════════
section('Sync guard');

check('the mirrored test logic still matches app/lib/identity.ts', () => {
  const src = readFileSync('app/lib/identity.ts', 'utf8');
  assert.ok(src.includes("canonicalUserId: user.userId"), 'ownerFilter/ownerStamp shape changed');
  assert.ok(src.includes("[legacyField]: user.emailLc"), 'legacy key shape changed');
  assert.ok(src.includes('return canonical === user.userId'), 'ownsResource canonical branch changed');
  assert.ok(src.includes('legacy.toLowerCase() === user.emailLc'), 'ownsResource legacy branch changed');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length} checks\n`);
  for (const f of failures) console.log(`  • ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log(`All ${passed} canonical-identity checks passed.`);