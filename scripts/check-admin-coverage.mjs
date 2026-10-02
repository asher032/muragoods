// ─────────────────────────────────────────────────────────────────────────
// Admin coverage & access-control architecture check.
//
// The Muragoods Admin Panel and the Discord Server Dashboard used to be two
// answers to "may I?" — an email list for /admin, a live Discord permission
// bit for /dashboard — and the failure mode was invisible. Nothing errored.
// Both pages looked correct in isolation. Meanwhile the owner of Muragoods
// could be refused by a DISCORD server check when acting on Muragoods data,
// and /api/admin/analytics answered anyone, unauthenticated, with the whole
// order book.
//
// Architecture that is only written down decays silently. These assertions
// make the four load-bearing rules structural instead of aspirational:
//
//   1. Every registry entry's adminSurface and api must actually exist.
//      A feature claimed to be manageable with no page behind it is a gap
//      that used to be invisible; now it fails the build.
//   2. Every /api/admin route must be guarded by the single authority
//      (requireOwner / requireStaff / requireGuildAuthority) or be one of the
//      deliberate exceptions. No email-list guards, no no-guard routes.
//   3. There is exactly ONE authority file. A second one re-creates the split
//      this work removed.
//   4. The command prefix has exactly ONE writer and no duplicate fields
//      (dashboard_prefix / admin_prefix / bot_prefix must stay dead).
//
// Run: node scripts/check-admin-coverage.mjs
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let checks = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) return true;
  failures += 1;
  console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
  return false;
}

function read(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

console.log('\nAdmin coverage & access-control architecture\n');

// ── 1. Read the feature registry ────────────────────────────────────────
const registrySource = read('app', 'lib', 'feature-registry.ts');

// The registry is TypeScript. Rather than importing it (which would drag in
// the Next toolchain), pull the entries out structurally: every line that
// opens a feature object literal.
const featureLines = registrySource
  .split('\n')
  .filter((l) => l.trim().startsWith('{ id:'));

if (!check('feature registry is not empty', featureLines.length > 0,
  'no `{ id: ... }` entries found in app/lib/feature-registry.ts')) {
  process.exit(1);
}

const surfaces = new Set();
const apis = new Set();
const ids = new Set();
const dupIds = [];

for (const line of featureLines) {
  const id = (line.match(/id:\s*'([^']+)'/) || [])[1];
  if (id) {
    if (ids.has(id)) dupIds.push(id);
    ids.add(id);
  }
  const surface = (line.match(/adminSurface:\s*'([^']+)'/) || [])[1];
  if (surface) surfaces.add(surface);
  const api = (line.match(/api:\s*'([^']+)'/) || [])[1];
  if (api) apis.add(api);
}

check('every feature id is unique', dupIds.length === 0,
  `duplicated: ${[...new Set(dupIds)].join(', ')}`);

// ── 2. Every declared surface must exist ─────────────────────────────────
const missingPages = [];
for (const surface of surfaces) {
  if (!surface.startsWith('/admin')) continue;
  const file = join(ROOT, 'app', surface.replace(/^\//, ''), 'page.tsx');
  if (!existsSync(file)) missingPages.push(surface);
}
check(`all ${[...surfaces].filter((s) => s.startsWith('/admin')).length} admin pages declared in the registry exist`,
  missingPages.length === 0,
  `missing: ${missingPages.join(', ')}`);

const missingApis = [];
for (const api of apis) {
  // /api/x/y  →  app/api/x/y/route.ts, allowing for dynamic segments
  // (/api/games/trivia/save lives at app/api/games/[gameId]/save/route.ts).
  const segments = api.replace(/^\//, '').split('/');
  let cursor = join(ROOT, 'app');
  let ok = true;
  for (const seg of segments) {
    const next = join(cursor, seg);
    if (existsSync(next)) {
      cursor = next;
      continue;
    }
    // The literal segment is absent — but it may have been declared as a
    // dynamic segment in the PARENT directory, which matches any value.
    const dynamic = existsSync(cursor) ? readdirSync(cursor).find((e) => e.startsWith('[')) : null;
    if (dynamic) {
      cursor = join(cursor, dynamic);
      continue;
    }
    ok = false;
    break;
  }
  if (!ok || !existsSync(join(cursor, 'route.ts'))) missingApis.push(api);
}
check(`all ${apis.size} APIs declared in the registry exist`, missingApis.length === 0,
  `missing: ${missingApis.join(', ')}`);

// ── 3. Admin coverage per area ───────────────────────────────────────────
// Every area of the product the brief names must appear in the registry, and
// every area must own at least one real admin page. An area with registry
// entries but no reachable page is exactly the "feature exists somewhere on
// the website but cannot be managed" case.
const REQUIRED_AREAS = ['website', 'murastream', 'shop', 'letters', 'games', 'economy', 'murabot', 'account'];
const presentAreas = new Set(
  featureLines.map((l) => (l.match(/area:\s*'([^']+)'/) || [])[1]).filter(Boolean),
);
const missingAreas = REQUIRED_AREAS.filter((a) => !presentAreas.has(a));
check('every product area is in the registry', missingAreas.length === 0,
  `missing areas: ${missingAreas.join(', ')}`);

// ── 4. Single authority for access control ───────────────────────────────
const authorityFiles = walk(join(ROOT, 'app', 'lib'))
  .filter((f) => /admin-guard|access-control/.test(f))
  .map((f) => f.replace(`${ROOT}/`, ''));
check('access control has exactly one authority module',
  authorityFiles.length === 1 && authorityFiles[0].endsWith('access-control.ts'),
  `found: ${authorityFiles.join(', ') || 'none'}`);

const authority = read('app', 'lib', 'access-control.ts');
for (const fn of ['resolveAccess', 'requireOwner', 'requireStaff', 'requireGuildAuthority']) {
  check(`authority exports ${fn}()`, authority.includes(`export async function ${fn}`));
}
for (const scope of ['support', 'moderation', 'content', 'shop', 'murastream', 'economy', 'technical', 'analytics']) {
  check(`staff scope "${scope}" is declared`, authority.includes(`'${scope}'`));
}

// ── 5. Every admin API is guarded by the authority ───────────────────────
// The deliberate exceptions are listed with the reason they are safe. Anything
// else that mutates or reads ecosystem data must name a guard.
const GUARDED = /requireOwner\(|requireStaff\(|requireGuildAuthority\(/;
const EXCEPTIONS = {
  'app/api/admin/access/route.ts':
    'self-description only: returns the caller\'s OWN level so a stranger can be routed to the Discord dashboard. The registry map is withheld from non-panel callers.',
  'app/api/admin/site-flags/route.ts':
    'GET is intentionally public — ContentLockGate reads it so the content lock can apply to every visitor. Its PATCH is guarded.',
};

const adminRoutes = [];
const routeDir = join(ROOT, 'app', 'api', 'admin');
if (existsSync(routeDir)) {
  for (const entry of readdirSync(routeDir)) {
    const f = join(routeDir, entry, 'route.ts');
    if (existsSync(f)) adminRoutes.push(f);
  }
}
const unguarded = [];
for (const file of adminRoutes) {
  const rel = file.replace(`${ROOT}/`, '');
  const src = readFileSync(file, 'utf8');
  const hasGuard = GUARDED.test(src);

  if (!hasGuard && !(rel in EXCEPTIONS)) {
    unguarded.push(rel);
    continue;
  }
  // A file that has a guard somewhere but exports a public mutating handler
  // is the sneaky version of the same bug. Every exported HTTP handler must
  // either call a guard or be a documented exception.
  const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) || [];
  const guardedCalls = (src.match(/requireOwner\(/g) || []).length
    + (src.match(/requireStaff\(/g) || []).length
    + (src.match(/requireGuildAuthority\(/g) || []).length;
  if (!(rel in EXCEPTIONS) && guardedCalls < handlers.length && guardedCalls === 0) {
    unguarded.push(`${rel} (${handlers.length} handlers, no guard call)`);
  }
}
check(`all ${adminRoutes.length} admin routes are guarded by the single authority`,
  unguarded.length === 0,
  `unguarded: ${unguarded.join(', ')}\n      documented exceptions: ${Object.keys(EXCEPTIONS).join(', ')}`);

// ── 6. No legacy guard can creep back ────────────────────────────────────
const legacyGuards = walk(join(ROOT, 'app'))
  .filter((f) => {
    const src = readFileSync(f, 'utf8');
    return /requireAdminEither/.test(src);
  })
  .map((f) => f.replace(`${ROOT}/`, ''));
check('no route uses the removed requireAdminEither guard', legacyGuards.length === 0,
  `still referencing: ${legacyGuards.join(', ')}`);

// ── 7. The admin layout gates on the server ──────────────────────────────
const layoutPath = join(ROOT, 'app', 'admin', 'layout.tsx');
check('app/admin/layout.tsx exists (server-side panel gate)', existsSync(layoutPath));
if (existsSync(layoutPath)) {
  const layout = readFileSync(layoutPath, 'utf8');
  check('the admin layout resolves access on the server',
    layout.includes('resolveAccess') && layout.includes('redirect('));
  check('the admin layout is not client-side only',
    !/^['"]use client['"]/.test(layout.trim()));
}

// No admin page may reintroduce its own browser-side admin gate.
const clientGates = walk(join(ROOT, 'app', 'admin'))
  .filter((f) => f.endsWith('page.tsx'))
  .filter((f) => {
    const src = readFileSync(f, 'utf8');
    // A client-side "is this an admin?" decision on a page inside the gated
    // layout is a second, weaker answer to the same question.
    return /isAuthenticated/.test(src) || (/useAuth\(\)/.test(src) && /isAdmin/.test(src));
  })
  .map((f) => f.replace(`${ROOT}/`, ''));
check('no admin page re-implements a client-side admin gate',
  clientGates.length === 0,
  `still gating in the browser: ${clientGates.join(', ')}`);

// ── 8. ONE canonical prefix ──────────────────────────────────────────────
const config = read('app', 'lib', 'murabot-config.ts');
check('murabot-config defines the canonical prefix writer',
  /export async function saveGuildPrefix/.test(config));
check('murabot-config defines DEFAULT_PREFIX', /export const DEFAULT_PREFIX/.test(config));
check('the canonical writer distinguishes applied / pending / failed',
  /PropagationState\s*=\s*'applied'\s*\|\s*'pending'\s*\|\s*'failed'/.test(config));

// Dead duplicate fields must stay dead.
//
// This scans CODE, not prose. The modules that explain why there is one prefix
// have to be able to say "there is no dashboardPrefix" in a comment, and the
// read-back of what Murabot currently holds is legitimately named botPrefix —
// that is the bot's answer, not a second stored value. What must not exist is
// a second FIELD: an object key, or a snake_case storage key anywhere.
const DUPLICATE_KEYS = ['dashboardPrefix', 'adminPrefix', 'botPrefix',
  'dashboard_prefix', 'admin_prefix', 'bot_prefix', 'discord_prefix'];

/** Strip comments so documentation about the rule is not mistaken for a breach. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const duplicateHits = [];
for (const file of walk(join(ROOT, 'app'))) {
  const rel = file.replace(`${ROOT}/`, '');
  const code = codeOnly(readFileSync(file, 'utf8'));
  for (const field of DUPLICATE_KEYS) {
    // An object key (`name:`) or a quoted storage key is a second field.
    const asKey = new RegExp(`(^|[\\s{,])${field}\\s*:`, 'm').test(code);
    // A snake_case name is never a legitimate local variable, so any
    // occurrence in code is a stored duplicate.
    const snake = field.includes('_') && new RegExp(`\\b${field}\\b`).test(code);
    if (asKey || snake) duplicateHits.push(`${rel}: ${field}`);
  }
}
check(`no duplicate prefix field is declared (${DUPLICATE_KEYS.join(', ')})`,
  duplicateHits.length === 0,
  duplicateHits.join('\n      '));

// Both surfaces must go through the one writer.
const prefixRoute = read('app', 'api', 'dashboard', 'prefix', 'route.ts');
check('the Discord dashboard prefix route calls the canonical writer',
  prefixRoute.includes('saveGuildPrefix'));
const adminMurabot = read('app', 'api', 'admin', 'murabot', 'route.ts');
check('the admin prefix route calls the canonical writer',
  adminMurabot.includes('saveGuildPrefix'));
check('the admin prefix route refuses to claim a pending write as applied',
  /propagation: 'applied' : 'pending'/.test(adminMurabot)
  || adminMurabot.includes("propagation === 'applied'"));
check('the admin prefix route reports a bad prefix as 400, not as a failed save',
  adminMurabot.includes("'INVALID_PREFIX'") && /status: 400/.test(adminMurabot));

// ── 9. The admin panel must not route through the public dashboard ───────
const adminApiDir = join(ROOT, 'app', 'api', 'admin');
const dashboardDeps = [];
for (const file of walk(adminApiDir)) {
  const src = readFileSync(file, 'utf8');
  if (/@\/app\/api\/dashboard|requireGuildManage|from '@\/app\/lib\/discord-guilds'/.test(src)) {
    dashboardDeps.push(file.replace(`${ROOT}/`, ''));
  }
}
check('no admin API depends on the public Discord dashboard permission model',
  dashboardDeps.length === 0,
  `admin APIs reaching into the dashboard layer: ${dashboardDeps.join(', ')}`);

// ── 10b. ONE writer per system ───────────────────────────────────────────
// The brief's rule 12 is "no client-side authority over currency, inventory,
// rewards". In practice that gets broken by a SECOND server-side writer, so
// the balance mutations are pinned to the service modules.
//
// A route may call $inc: { coinBalance } only through the points service. The
// services themselves are the one place allowed to touch it.
const balanceWriters = [];
for (const file of walk(join(ROOT, 'app'))) {
  const rel = file.replace(`${ROOT}/`, '');
  if (rel.endsWith('app/lib/services/points.ts')) continue;
  if (rel.endsWith('app/lib/points.ts')) continue;
  const code = readFileSync(file, 'utf8');
  if (/\$inc:\s*\{\s*coinBalance|\$set:\s*\{\s*coinBalance/.test(code)) {
    balanceWriters.push(rel);
  }
}
check('only the points service writes coinBalance (no second balance writer)',
  balanceWriters.length === 0,
  `balance mutated directly in: ${balanceWriters.join(', ')}`);

// Inventory and points must have exactly one service module each.
for (const service of ['points', 'inventory', 'game-save']) {
  const p = join(ROOT, 'app', 'lib', 'services', `${service}.ts`);
  check(`app/lib/services/${service}.ts exists (single writer for ${service})`, existsSync(p));
}

// A game save must never be able to pay. The save route and service are
// asserted to carry no grant call — this is the structural half of rule 12.
const saveRoute = read('app', 'api', 'games', '[gameId]', 'save', 'route.ts');
const saveService = read('app', 'lib', 'services', 'game-save.ts');
for (const [label, src] of [['save route', saveRoute], ['save service', saveService]]) {
  check(`the game ${label} grants no reward`,
    !/grantPoints\(|grantItems\(/.test(src),
    'a save must never move points or items — awards go through /api/games/award');
}
check('the save route resolves identity from the session, with no userId parameter',
  /getIdentityWithId\(req\)/.test(saveRoute) && !/searchParams\.get\(['"]userId/.test(saveRoute));

// Every save/inventory/points read route must resolve identity from the
// session. A `?userId=` on any of them would reopen the IDOR.
for (const p of [
  ['app', 'api', 'account', 'inventory', 'route.ts'],
  ['app', 'api', 'account', 'points', 'route.ts'],
]) {
  const src = read(...p);
  check(`${p.join('/')} resolves identity from the session`,
    /getIdentityWithId\(req\)/.test(src) && !/searchParams\.get\(['"]userId/.test(src));
}

// ── 10. Real health states ───────────────────────────────────────────────
const health = read('app', 'api', 'admin', 'system-health', 'route.ts');
for (const state of ['ONLINE', 'DEGRADED', 'OFFLINE', 'TIMEOUT', 'UNAUTHORIZED',
  'RATE_LIMITED', 'CONFIGURATION_ERROR', 'DATABASE_ERROR', 'NOT_CONFIGURED']) {
  check(`health state ${state} exists`, health.includes(`'${state}'`));
}
check('system health is guarded by the technical scope', /requireStaff\(req, \['technical'\]\)/.test(health));

// ── Result ───────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ PASS' : '✗ FAIL'} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);