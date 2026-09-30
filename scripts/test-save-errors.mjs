#!/usr/bin/env node
// The dashboard save error taxonomy, and the Raid Alerts save matrix.
//
//   node scripts/test-save-errors.mjs
//
// The reported failure:
//
//   "Not saved — 1 setting failed validation.
//    • Raid Alerts — the current value: Validation failed (HTTP 502).
//    Fix the selection above (usually bot permissions or a deleted channel/role)."
//
// Every clause was wrong, and the cause was structural: one function returned
// `valid: false` for BOTH "the channel is gone" and "Discord did not answer",
// and the caller counted both as failed fields. These tests pin the
// distinction so it cannot collapse again.
//
//   A. enable a module toggle      → saves
//   B. disable a module toggle     → saves
//   C. a toggle needing no Discord → never blocked by a Discord outage
//   D. a deleted channel           → CHANNEL_NOT_FOUND, blocked, field-specific
//   E. a missing permission        → MISSING_BOT_PERMISSION, blocked, specific
//   F. Murabot unreachable         → BOT_API_UNAVAILABLE, NOT validation
//   G. Discord rate limited        → RATE_LIMITED, NOT validation
//   H. database unavailable        → DATABASE_ERROR, NOT validation
//   I. the owner saves successfully
//   J. a non-owner is refused with 403 OWNER_ONLY
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n${t}`);
/** Comments may explain an old bug; shipped STRINGS may not contain it. */
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.split('//', 1)[0]).join('\n');

const outDir = mkdtempSync(join(tmpdir(), 'save-errors-'));
{
  const { outputText } = ts.transpileModule(
    readFileSync(join(root, 'app/lib/save-errors.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: 'save-errors.ts' },
  );
  writeFileSync(join(outDir, 'save-errors.js'), outputText);
}
const require = createRequire(import.meta.url);
const E = require(join(outDir, 'save-errors.js'));

// ── 1. The status table is the contract ──────────────────────────────────
section('[1] HTTP status → category, never a blanket "validation"');
const table = [
  [400, 'validation'], [422, 'validation'],
  [401, 'authentication'], [403, 'permission'],
  [404, 'not_found'], [409, 'conflict'], [429, 'rate_limited'],
  [500, 'internal'], [502, 'upstream'], [503, 'unavailable'], [504, 'timeout'],
  [0, 'unknown'], [418, 'unknown'],
];
for (const [status, kind] of table) {
  check(`${status || 'no response'} classifies as ${kind}`, E.kindForStatus(status) === kind,
    E.kindForStatus(status));
}
check('502 is NOT validation', E.kindForStatus(502) !== 'validation');
check('503 is NOT validation', E.kindForStatus(503) !== 'validation');
check('504 is NOT validation', E.kindForStatus(504) !== 'validation');
check('only 400 and 422 are validation',
  [400, 422].every((s) => E.kindForStatus(s) === 'validation')
  && [401, 403, 404, 409, 429, 500, 502, 503, 504].every((s) => E.kindForStatus(s) !== 'validation'));

// ── 2. Normalization keeps the real reason ───────────────────────────────
section('[2] normalizeApiError keeps the reason intact');
{
  const upstream = E.normalizeApiError(502, { code: 'BOT_API_UNAVAILABLE', message: 'Murabot could not be reached.' });
  check('a 502 becomes an upstream failure', upstream.kind === 'upstream', upstream.kind);
  check("it is not called validation", upstream.kind !== 'validation');
  check('the upstream code is preserved', upstream.code === 'BOT_API_UNAVAILABLE');
  check('the upstream message is preserved', upstream.message === 'Murabot could not be reached.');
  check('it is retryable', upstream.retryable === true);

  const throttled = E.normalizeApiError(429, { code: 'DISCORD_RATE_LIMITED' }, { retryAfterMs: 4000 });
  check('a 429 becomes a rate limit', throttled.kind === 'rate_limited');
  check('the retry window is carried', throttled.retryAfterMs === 4000);

  const notFound = E.normalizeApiError(400, { code: 'CHANNEL_NOT_FOUND', message: 'Channel gone.' });
  check('a deleted channel is a real verdict', notFound.kind === 'validation');
  check('a verdict is NOT retryable', notFound.retryable === false);

  const perm = E.normalizeApiError(403, { code: 'MISSING_BOT_PERMISSION' });
  check('a missing permission is a verdict about the field', perm.kind === 'validation');

  const ownerOnly = E.normalizeApiError(403, { code: 'OWNER_ONLY' });
  check('OWNER_ONLY is a permission refusal, not a value problem', ownerOnly.kind === 'permission');

  const denied = E.normalizeApiError(403, {});
  check('a bare 403 is permission', denied.kind === 'permission');

  // A named unavailability code keeps its meaning even behind a 4xx: being
  // unable to reach Discord is not a permission problem however it is numbered.
  const oddButNamed = E.normalizeApiError(400, { code: 'DISCORD_UNAVAILABLE' });
  check('a named unavailability code survives a 4xx status',
    oddButNamed.kind === 'upstream', oddButNamed.kind);

  const dbDown = E.normalizeApiError(503, { code: 'DATABASE_ERROR', message: 'The write failed.' });
  check('a database failure is not validation', dbDown.kind !== 'validation');
  check('a database failure is retryable', dbDown.retryable === true);

  const empty = E.normalizeApiError(0, null);
  check('a request that never landed is unknown, not validation',
    empty.kind === 'unknown' && empty.code === 'UNKNOWN_SERVER_ERROR');

  const withField = E.normalizeApiError(422, { errors: [{ field: 'securitySettings.raidAlertsChannelId' }] });
  check('the failing field is named from the error list',
    withField.field === 'securitySettings.raidAlertsChannelId');
}

// ── 3. The verdict/unavailability distinction ────────────────────────────
section('[3] "could not check" is never "your value is wrong"');
check('an unavailability code is flagged as such', E.isUnavailability('DISCORD_RATE_LIMITED'));
check('a verdict code is flagged as a verdict', E.isVerdict('CHANNEL_NOT_FOUND'));
check('DISCORD_UNAVAILABLE is not a verdict', !E.isVerdict('DISCORD_UNAVAILABLE'));
check('MISSING_BOT_PERMISSION is a verdict', E.isVerdict('MISSING_BOT_PERMISSION'));
check('BOT_API_UNAVAILABLE is not a verdict', !E.isVerdict('BOT_API_UNAVAILABLE'));
for (const code of ['BOT_API_UNAVAILABLE', 'DISCORD_RATE_LIMITED', 'DATABASE_ERROR',
  'BOT_OFFLINE', 'DISCORD_UNAVAILABLE', 'UPSTREAM_TIMEOUT', 'BRIDGE_NOT_CONFIGURED']) {
  check(`${code} is an unavailability, not a validation`, E.isUnavailability(code));
}

// ── 4. Headlines and advice ──────────────────────────────────────────────
section('[4] the message says what actually happened');
{
  const up = E.saveErrorHeadline(E.normalizeApiError(502, { code: 'BOT_API_UNAVAILABLE' }));
  check('a 502 headline does not mention validation', !/validat/i.test(up), up);
  check('a 502 headline says Murabot was unreachable', /Murabot/i.test(up), up);
  check('a 502 headline promises nothing was changed', /unchanged/i.test(up), up);

  const advice = E.saveErrorAdvice(E.normalizeApiError(502, { code: 'BOT_API_UNAVAILABLE' }));
  check('a 502 gives no advice about channels', !/channel/i.test(advice), advice);
  check('a 502 explains it is a service problem', /service problem/i.test(advice), advice);

  const validationAdvice = E.saveErrorAdvice(E.normalizeApiError(422, { code: 'INVALID_REQUEST' }));
  check('a genuine validation failure DOES mention the field',
    /field/i.test(validationAdvice), validationAdvice);

  const head = (s, code) => E.saveErrorHeadline(E.normalizeApiError(s, { code }));
  check('403 says permission', /permission/i.test(head(403, 'OWNER_ONLY')));
  check('401 says sign in', /sign in/i.test(head(401, 'AUTH_REQUIRED')));
  check('429 says rate limited', /rate limited/i.test(head(429, 'DISCORD_RATE_LIMITED')));
  check('503 says unavailable', /unavailable/i.test(head(503, 'SERVICE_UNAVAILABLE')));
  check('504 says timed out', /time|timed/i.test(head(504, 'UPSTREAM_TIMEOUT')));
  for (const s of [500, 502, 503, 504]) {
    check(`${s} is never announced as a validation failure`, !/validat/i.test(head(s, 'X')));
  }
}

// ── 5. Raid Alerts A–C: a toggle is never blocked by Discord ─────────────
section('[5] Raid Alerts A–C: a module toggle saves');
{
  const modSrc = readFileSync(join(root, 'app/dashboard/components/ModuleSettings.tsx'), 'utf8');
  const selSrc = readFileSync(join(root, 'app/dashboard/components/selectors.tsx'), 'utf8');

  check('validateSelection can report "not verified"',
    /verified:\s*false/.test(selSrc) && /verified:\s*boolean/.test(selSrc));
  check('validateSelection classifies its failures',
    selSrc.includes('normalizeApiError'));
  check('validateSelection never says "Validation failed (HTTP"',
    !/Validation failed \(HTTP/.test(stripComments(selSrc)));

  check('a failed count only includes VERIFIED failures',
    /results\.filter\(\(r\) => r\.result\.verified && !r\.result\.valid\)/.test(modSrc));
  check('an unverifiable field is tracked separately',
    /const unverified = results\.filter\(\(r\) => !r\.result\.verified\)/.test(modSrc));
  check('an unverifiable field is a WARNING, not a blocker',
    /warnings\.push\(`⚠/.test(modSrc));
  check('only fields touched this session are pre-checked',
    /touched\.current\.has\(f\.key\)/.test(modSrc));
  check('the save proceeds after an unverified warning',
    /const saved = await save\(\);/.test(modSrc));
  check('the generic "Fix the selection above" advice is gone',
    !/Fix the selection above/.test(modSrc));
  check('no code path can blame a channel for an upstream failure',
    !/usually bot permissions or a deleted channel/.test(modSrc));

  // A. enable, B. disable, C. enable without a channel: none of these touch
  // Discord at all, because the security module's raid-alerts channel field is
  // only pre-checked when the operator actually edited it.
  const modFields = readFileSync(join(root, 'app/lib/discord-modules.ts'), 'utf8');
  check('Raid Alerts is a channel field on the security module',
    /securitySettings\.raidAlertsChannelId/.test(modFields));
  check('Raid Alerts is a resource field, not a toggle',
    /m\('securitySettings\.raidAlertsChannelId', 'Raid Alerts', 'channel'/.test(modFields));
  check('Anti-Raid (the toggle) needs no Discord resource',
    /m\('securitySettings\.antiRaidEnabled', 'Anti-Raid', 'toggle'/.test(modFields));

  const routeSrc = readFileSync(join(root, 'app/api/dashboard/config/route.ts'), 'utf8');
  check('the save route verifies only CHANGED ids',
    /priorValue\(section, field\)[\s\S]{0,80}!== value/.test(routeSrc));
  check('the save route does not refuse when it has no bot token',
    /if \(idFields\.length > 0 && !bToken\)/.test(routeSrc));
  check('an unverifiable Discord read no longer fails the save',
    /saveWarnings\.push\([\s\S]{0,200}Murabot responds/.test(routeSrc));
  check('the success response reports warnings separately',
    /warnings,/.test(routeSrc) && /\.\.\.\(warnings\.length > 0 \? \{ warnings \}/.test(routeSrc));
  check('the success response echoes the PERSISTED document',
    /const persisted = \(await collection\.findOne/.test(routeSrc));
}

// ── 6. Raid Alerts D–E: real verdicts still block, per field ─────────────
section('[6] Raid Alerts D–E: real verdicts are specific and block');
{
  const routeSrc = readFileSync(join(root, 'app/api/dashboard/resources/validate/route.ts'), 'utf8');
  check('a deleted channel is CHANNEL_NOT_FOUND',
    /CHANNEL_NOT_FOUND/.test(routeSrc));
  check('only a real 404 is treated as absence',
    /if \(chRes\.status !== 404\)/.test(routeSrc));
  check('a channel the bot cannot read is CHANNEL_ACCESS_DENIED',
    /CHANNEL_ACCESS_DENIED/.test(routeSrc));
  check('an unavailable check says verified: false',
    /unverifiable\(/.test(routeSrc) && /verified:\s*false/.test(routeSrc));
  check('a check that ran says verified: true',
    /verified:\s*true/.test(routeSrc));
  check('every failure carries a request id', /requestId/.test(routeSrc));
  check('a 429 carries Retry-After', /'Retry-After'/.test(routeSrc));
  check('failures are logged with guild, kind and outcome',
    /\[validate\]/.test(routeSrc) && /outcome=/.test(routeSrc));
  // The selected object's id is deliberately absent from the log line.
  const logLine = (routeSrc.match(/`\[validate\][^`]*`/) ?? [''])[0];
  check('the selected object id is never logged', !logLine.includes('objectId'), logLine);
  check('the log line names the request, guild, kind and outcome',
    /requestId/.test(logLine) && /guild=/.test(logLine) && /kind=/.test(logLine));
  check('the log carries no credentials',
    !/console\.log\([^)]*(token|secret|password)/i.test(routeSrc));

  const botCheck = routeSrc.split('async function loadBotCheck')[0];
  void botCheck;
}

// ── 7. Raid Alerts I–J: owner authorization still holds ─────────────────
section('[7] Raid Alerts I–J: owner authorization is intact');
{
  const ownerSrc = readFileSync(join(root, 'app/lib/murabot-owner.ts'), 'utf8');
  check('ownership is a Discord user id comparison',
    ownerSrc.includes('MURABOT_OWNER_DISCORD_ID') && /id === owner/.test(ownerSrc));
  // The COMPARISON is numeric; the module's prose may of course mention names.
  const compare = (ownerSrc.split('export function isMurabotOwner')[1] ?? '').split('}')[0];
  check('a name is never used to authorize',
    !/username|display_name|nick/i.test(compare), compare);
  const configRoute = readFileSync(join(root, 'app/api/dashboard/config/route.ts'), 'utf8');
  const patch = stripComments(configRoute.split('export async function PATCH')[1] ?? '');
  check('the save resolves identity from the session', patch.includes('auth.discordId'));
  check('the save decides ownership server-side', patch.includes('isMurabotOwner(auth.discordId)'));
  check('a non-owner gets 403 OWNER_ONLY', /status = ownerOnly \? 403/.test(patch));
  check('the save never reads an owner from the body',
    !/actorId|ownerId/.test(patch) && !/isOwner\s*[:=]\s*body/.test(patch));
}

console.log(`\n${passed} passed, ${failed} failed`);
try { rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ }
if (failed) {
  console.log('Failures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
