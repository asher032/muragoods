#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Unified identity: the invariants that must not regress.
//
// This is not a snapshot of behaviour. Each block below pins a rule from the
// brief that used to be violated in a way nothing else caught, because the
// failure was SILENT — the page rendered, the number looked right, and the
// data was split between two systems that both believed they were correct.
//
// The rules, and what each block would catch if it broke:
//
//   ONE identity          app/lib/identity.ts stays the only identity resolver
//   server-side saves     a game save lives on the server, not in a browser
//   save ≠ reward         a save must never move points or items
//   one points writer     only the points service may mutate coinBalance
//   idempotency           grants are keyed on a transaction/grant id
//   no browser authority  no points/inventory/save route accepts ?userId=
//   guild ≠ user          Discord SERVER economy is never merged into points
//   full access ≠ bypass  Discord hierarchy is still enforced where it applies
//
// Run: node scripts/test-unified-identity.mjs
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const has = (...p) => existsSync(join(ROOT, ...p));

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, error: err });
    console.log(`  ✗ ${name}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const APP_FILES = walk(join(ROOT, 'app')).map((f) => f.replace(`${ROOT}/`, ''));
const APP_SRC = APP_FILES.map((f) => read(f));

// ─────────────────────────────────────────────────────────────────────────
section('ONE identity');

check('app/lib/identity.ts is the single canonical identity resolver', () => {
  const src = read('app', 'lib', 'identity.ts');
  for (const fn of ['getIdentity', 'getIdentityWithId', 'ownerFilter', 'ownsResource', 'ownerStamp']) {
    assert.ok(src.includes(`export function ${fn}`) || src.includes(`export async function ${fn}`),
      `${fn} must be exported from the identity resolver`);
  }
});

check('identity is derived from the session, never from a request field', () => {
  const src = read('app', 'lib', 'identity.ts');
  // The resolver must not read an id off the request.
  assert.ok(!/searchParams|req\.json/.test(src),
    'the identity resolver must not parse caller-supplied identifiers');
});

check('no personal-data route reads another account by ?userId=', () => {
  const offenders = [];
  for (const [i, f] of APP_FILES.entries()) {
    if (!f.startsWith('app/api/')) continue;
    // Two legitimate exceptions, both for reasons that are structural rather
    // than incidental:
    //
    //  app/api/admin/*   — the admin already proved authority server-side and
    //                      is acting ON someone else's behalf by design.
    //  app/api/dashboard/* — `userId` there is a DISCORD SNOWFLAKE scoped to a
    //                      guild, not a Muragoods account, and those routes
    //                      are gated by requireGuildManage.
    if (f.startsWith('app/api/admin/') || f.startsWith('app/api/dashboard/')) continue;
    if (!/searchParams\.get\(['"]userId['"]\)|searchParams\.get\(['"]ownerId['"]\)/.test(APP_SRC[i])) continue;
    const src = APP_SRC[i];
    // A route MAY accept ?userId= as long as it proves the caller IS that
    // user before returning anything (group-orders does exactly this). So the
    // question is not "does it read the flag" but "does it check".
    const guarded =
      // an explicit comparison against the resolved caller, or
      /(!==|\===)\s*(identity|viewer|owner)\b/.test(src)
      || /\b(identity|viewer|owner)\.[a-zA-Z]*\s*!==\s*/.test(src)
      // or the flag is only used to refuse
      || /NOT_YOUR_ACCOUNT/.test(src)
      // or the value is never used in a database filter at all
      || !/find(?:One)?\(\s*\{[^}]*\buserId\s*:/.test(src.replace(/\s+/g, ' '));
    if (!guarded) offenders.push(f);
  }
  assert.equal(offenders.length, 0,
    `these routes filter personal data by a caller-supplied userId: ${offenders.join(', ')}`);
});

check('no route trusts a client-supplied admin flag', () => {
  // `?isAdmin=true` answering a request is a client-side bypass, which the
  // brief forbids outright. It used to return every review in the database.
  const offenders = [];
  for (const [i, f] of APP_FILES.entries()) {
    if (!f.startsWith('app/api/')) continue;
    if (!/searchParams\.get\(['"]isAdmin['"]\)/.test(APP_SRC[i])) continue;
    // Reading the flag in order to explicitly IGNORE it is correct.
    if (/client flag is gone|never trusted|is gone:/.test(APP_SRC[i])) continue;
    offenders.push(f);
  }
  assert.equal(offenders.length, 0,
    `these routes branch on a caller-supplied admin flag: ${offenders.join(', ')}`);
});

check('reviews require a session and verify the order belongs to the caller', () => {
  const src = read('app', 'api', 'reviews', 'route.ts');
  assert.ok(/getIdentityWithId\(req\)/.test(src), 'a review must be attributed from the session');
  assert.ok(/requireStaff\(req, \['support'\]\)/.test(src),
    'the every-reviews view must require a real staff scope');
  // Attribution must not be taken from the body.
  assert.ok(!/const \{ orderId, userId, userName/.test(src),
    'review attribution must not be read from the request body');
});

check('a Discord session resolves to the LINKED account, never a second profile', () => {
  const src = read('app', 'lib', 'identity.ts');
  assert.ok(/discord\.discordId/.test(src), 'the Discord session must resolve through the linked account');
  // The old bug: a Discord session with no link silently created a profile.
  assert.ok(!/User\.create|new User/.test(src),
    'resolving identity must never create an account as a side effect');
});

// ─────────────────────────────────────────────────────────────────────────
section('Server-side game saves');

check('a per-game save API exists (GET and PUT)', () => {
  const p = ['app', 'api', 'games', '[gameId]', 'save', 'route.ts'];
  assert.ok(has(...p), 'app/api/games/[gameId]/save/route.ts must exist');
  const src = read(...p);
  assert.ok(src.includes('export async function GET'), 'GET must read the save');
  assert.ok(src.includes('export async function PUT'), 'PUT must write the save');
});

check('the save API resolves the owner from the session', () => {
  const src = read('app', 'api', 'games', '[gameId]', 'save', 'route.ts');
  assert.ok(/getIdentityWithId\(req\)/.test(src), 'the save route must resolve identity from the session');
  assert.ok(!/searchParams\.get\(['"]userId['"]\)/.test(src),
    'the save route must not accept a target userId');
});

check('a save is keyed by canonical userId, so it follows the person', () => {
  const src = read('app', 'lib', 'models', 'GameSave.ts');
  assert.ok(/canonicalUserId[\s\S]{0,80}index: true/.test(src),
    'game saves must be indexed by canonical userId');
});

check('a high score only moves up unless an explicit reset is requested', () => {
  const src = read('app', 'lib', 'services', 'game-save.ts');
  assert.ok(/Math\.max\(existing\?\.highScore/.test(src),
    'a stale client must not be able to lower a recorded high score');
  assert.ok(/resetScore/.test(src), 'an explicit reset must be a distinct, deliberate path');
});

check('a partial update does not ERASE the game state', () => {
  const src = read('app', 'lib', 'services', 'game-save.ts');
  // Bug this pins: `state` was `$set` unconditionally from `input.state ?? {}`,
  // so a call that only reported a new high score silently wiped the game's
  // save (trivia lost its legendaryHighScore this way). `state` must only be
  // written when the caller actually sent one.
  assert.ok(/stateProvided/.test(src), 'the service must distinguish "no state sent" from "empty state"');
  assert.ok(/if \(stateProvided\) set\.state = state;/.test(src),
    'state must be written conditionally, not from a defaulted value');
});

check('the save service never leaks internal document fields', () => {
  const src = read('app', 'lib', 'services', 'game-save.ts');
  assert.ok(/function shape\(/.test(src), 'the service must project saves into a public shape');
  assert.ok(!/__v|_id:/.test(src), 'a public save must not carry mongoose internals');
});

check('games keep a local cache, but localStorage is never the record', () => {
  const hook = read('app', 'lib', 'use-game-save.ts');
  assert.ok(/localStorage/.test(hook), 'a write-through cache is expected for offline play');
  assert.ok(/api\/games/.test(hook), 'the hook must read and write the server save');
});

// ─────────────────────────────────────────────────────────────────────────
section('A save never pays');

check('the save route and service grant no reward', () => {
  for (const p of [['app', 'api', 'games', '[gameId]', 'save', 'route.ts'],
    ['app', 'lib', 'services', 'game-save.ts']]) {
    const src = read(...p);
    assert.ok(!/grantPoints\(|grantItems\(/.test(src),
      `${p.join('/')} must not move points or items — awards go through /api/games/award`);
    assert.ok(!/coinBalance/.test(src), `${p.join('/')} must not touch the balance`);
  }
});

check('rewards are still issued by the validated award endpoint', () => {
  const src = read('app', 'api', 'games', 'award', 'route.ts');
  assert.ok(/awardPlay/.test(src), 'awards must flow through awardPlay');
  const server = read('app', 'lib', 'gameserver.ts');
  assert.ok(/sessionToken/.test(server), 'a play must consume a single-use session token');
  assert.ok(/idempotencyKey/.test(server), 'a reward must be claimed with an idempotency key');
});

// ─────────────────────────────────────────────────────────────────────────
section('One points writer, idempotently');

check('only the points service mutates coinBalance', () => {
  const offenders = [];
  for (const [i, f] of APP_FILES.entries()) {
    if (f === 'app/lib/services/points.ts') continue;
    if (/\$inc:\s*\{\s*coinBalance|\$set:\s*\{\s*coinBalance/.test(APP_SRC[i])) offenders.push(f);
  }
  assert.equal(offenders.length, 0,
    `these files move the balance outside the points service: ${offenders.join(', ')}`);
});

check('every points movement is a ledger row with an id, source and reason', () => {
  const src = read('app', 'lib', 'models', 'PointsTransaction.ts');
  assert.ok(/txId[\s\S]{0,80}unique: true/.test(src), 'txId must be unique — that is the idempotency key');
  for (const field of ['canonicalUserId', 'source', 'amount', 'reason', 'createdAt']) {
    assert.ok(src.includes(field), `the ledger must record ${field}`);
  }
});

check('the ledger is written BEFORE the balance moves', () => {
  const src = read('app', 'lib', 'services', 'points.ts');
  const create = src.indexOf('PointsTransaction.create');
  const inc = src.indexOf('$inc: { coinBalance');
  assert.ok(create > -1 && inc > -1, 'both the ledger write and the balance update must exist');
  assert.ok(create < inc,
    'the ledger row must be claimed first, so a crash leaves a reportable inconsistency '
    + 'rather than a silent balance change with no record');
});

check('an overdraw is refused, not silently clamped', () => {
  const src = read('app', 'lib', 'services', 'points.ts');
  assert.ok(/INSUFFICIENT_FUNDS/.test(src), 'spending more than the balance must be a distinct outcome');
});

check('the atomic debit keeps its balance guard', () => {
  const src = read('app', 'lib', 'services', 'points.ts');
  assert.ok(/coinBalance:\s*\{\s*\$gte:/.test(src),
    'the concurrent-spend path must guard in the filter, not check-then-write');
});

// ─────────────────────────────────────────────────────────────────────────
section('Unified inventory');

check('a user inventory model exists with an idempotent grant key', () => {
  const src = read('app', 'lib', 'models', 'InventoryItem.ts');
  assert.ok(/grantKey/.test(src), 'a grant must be keyed so a retry cannot double-credit');
  assert.ok(/canonicalUserId/.test(src), 'inventory must be owned by the canonical user');
  assert.ok(/unique: true/.test(src), 'the (user, item, grant) tuple must be unique');
});

check('the inventory API resolves the caller from the session', () => {
  const src = read('app', 'api', 'account', 'inventory', 'route.ts');
  assert.ok(/getIdentityWithId\(req\)/.test(src), 'inventory must be read from the session');
  assert.ok(!/searchParams\.get\(['"]userId['"]\)/.test(src), 'inventory must not accept a target userId');
});

check('one inventory service owns grants and consumption', () => {
  const src = read('app', 'lib', 'services', 'inventory.ts');
  assert.ok(/export async function grantItems/.test(src));
  assert.ok(/export async function consumeItems/.test(src));
  // A repeat grant reports "already_granted" rather than erroring, so a
  // retrying webhook is safe.
  assert.ok(/already_granted/.test(src), 'a repeated grant must be reported, not counted twice');
});

// ─────────────────────────────────────────────────────────────────────────
section('Guild data is never merged into personal data');

check('inventory items must declare what they are for', () => {
  const src = read('app', 'lib', 'services', 'inventory.ts');
  assert.ok(/ITEM_KINDS/.test(src));
  assert.ok(/kind/.test(src), 'an item must declare whether it is website/game/discord');
});

check('no automatic Muragoods→server currency conversion exists', () => {
  // The brief: a purchased item must not secretly become Discord coins.
  const offenders = [];
  for (const [i, f] of APP_FILES.entries()) {
    if (f.includes('services/points.ts')) continue;
    // A write into the Murabot economy cluster from a personal-data path.
    if (/economy_tx|economy_shop_stock/.test(APP_SRC[i])
      && !/economy-store|dashboard|admin/.test(f)) {
      offenders.push(f);
    }
  }
  assert.equal(offenders.length, 0,
    `personal-data paths must not write server economy: ${offenders.join(', ')}`);
});

check('server economy and Muragoods points are documented as separate', () => {
  const points = read('app', 'lib', 'services', 'points.ts');
  assert.ok(/guild/i.test(points) && /not/i.test(points),
    'the points service must state that guild-scoped economy is out of its reach');
});

check('Murabot resolves Discord users to the canonical account', () => {
  const src = read('app', 'api', 'discord', 'identity', 'route.ts');
  assert.ok(/discordId/.test(src), 'the Discord identity route must key on the Discord snowflake');
});

// ─────────────────────────────────────────────────────────────────────────
section('Full access does not mean bypassing security');

check('Discord hierarchy is still enforced where actions touch Discord', () => {
  const src = read('app', 'lib', 'access-control.ts');
  assert.ok(/requireGuildAuthority/.test(src));
  // The owner passes for Muragoods data, but guild authority is still proven
  // live for a Discord-only caller.
  assert.ok(/requireGuildManage/.test(src),
    'a Discord admin must still be proven by a live permission check');
});

check('the unified identity suite runs in CI', () => {
  const ci = read('.github', 'workflows', 'ci.yml');
  assert.ok(ci.includes('check-admin-coverage.mjs'), 'the architecture check must run in CI');
  assert.ok(ci.includes('test-unified-identity.mjs'), 'the identity suite must run in CI');
});

check('access control resolves identity from the session only', () => {
  const src = read('app', 'lib', 'access-control.ts');
  assert.ok(!/searchParams|req\.json/.test(src),
    'the access authority must not read caller-supplied identifiers');
});

check('admin coverage and access-control checks are wired into CI', () => {
  const ci = read('.github', 'workflows', 'ci.yml');
  assert.ok(ci.includes('check-admin-coverage.mjs'), 'the architecture check must run in CI');
});

// ─────────────────────────────────────────────────────────────────────────
section('The admin panel can trace one person end to end');

check('a cross-system trace endpoint exists and is scope-guarded', () => {
  const src = read('app', 'api', 'admin', 'trace', 'route.ts');
  assert.ok(/requireStaff\(req, \['technical'\]\)/.test(src),
    'reading a full cross-system footprint needs the technical scope');
});

check('the trace walks shop, points, inventory, games and Murastream', () => {
  const src = read('app', 'api', 'admin', 'trace', 'route.ts');
  for (const section of ['shop', 'points', 'inventory', 'games', 'murastream', 'letters', 'murabot']) {
    assert.ok(src.includes(`${section}:`), `the trace must report ${section}`);
  }
});

check('the trace resolves the person once, by any of the three identifiers', () => {
  const src = read('app', 'api', 'admin', 'trace', 'route.ts');
  for (const key of ['discordId', 'userId', 'email']) {
    assert.ok(src.includes(`'${key}'`), `the trace must accept ${key}`);
  }
});

check('the trace never returns letter content', () => {
  const src = read('app', 'api', 'admin', 'trace', 'route.ts');
  assert.ok(!/content:\s*1/.test(src), 'letter text must not be selected by a trace');
  assert.ok(/Counts only/.test(src) || /never returned/.test(src),
    'the trace must state that letter text is excluded');
});

check('the trace explains empty sections instead of hiding them', () => {
  const src = read('app', 'api', 'admin', 'trace', 'route.ts');
  assert.ok(/note:/.test(src), 'a trace must annotate its thin sections');
  assert.ok(/not merged|not merged into/.test(src) || /intentionally not merged/.test(src),
    'the trace must state that server-scoped Discord data is not merged in');
});

// ─────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(64)}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length} checks\n`);
  for (const f of failures) console.log(`  • ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log(`All ${passed} unified-identity checks passed.`);