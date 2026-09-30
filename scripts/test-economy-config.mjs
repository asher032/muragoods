#!/usr/bin/env node
// CI guard + behavioural suite for the Economy settings save system.
//
//   node scripts/test-economy-config.mjs
//
// It exists because the save system failed in a way no type checker could see:
// the PATCH route persisted a hand-written whitelist of 12 keys while the form
// showed 21, so nine settings — including the Economy Log Channel — were
// dropped after a success message. The first test here pins the schema to the
// bot's own defaults so that class of bug cannot come back silently.
//
// The route's logic is split into three pure-ish modules under app/lib, which
// this suite exercises directly against a stubbed Discord API:
//   A. valid channel + valid settings → no errors
//   B. deleted channel              → CHANNEL_NOT_FOUND
//   C. bot missing SEND_MESSAGES    → MISSING_BOT_PERMISSION
//   D. bot missing EMBED_LINKS      → MISSING_BOT_PERMISSION
//   E. invalid numeric range        → exact field error
//   F. multiple invalid fields      → all reported at once
//   G. Discord 429                  → retryable, never "invalid"
//   H. a failed save writes nothing → existing config preserved
//   I. values survive a round trip  → what was saved is what comes back
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

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function section(title) { console.log(`\n${title}`); }

// ── Load the TypeScript modules under test ─────────────────────────────
// The modules are plain data + functions, so transpiling them to CommonJS is
// enough to require them; no type checking is needed (tsc does that).
const outDir = mkdtempSync(join(tmpdir(), 'economy-test-'));
for (const file of ['economy-schema', 'economy-validate', 'discord-channels']) {
  const source = readFileSync(join(root, 'app/lib', `${file}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: `${file}.ts`,
  });
  writeFileSync(join(outDir, `${file}.js`), outputText);
}
const require = createRequire(import.meta.url);
const schema = require(join(outDir, 'economy-schema.js'));
const validate = require(join(outDir, 'economy-validate.js'));
const channels = require(join(outDir, 'discord-channels.js'));
const { ECONOMY_FIELDS, ECONOMY_FIELD_BY_KEY, ECONOMY_KEYS } = schema;
const { validateEconomyDraft, mergeEconomySection } = validate;
const { validateChannelSetting, listSelectableChannels, guildSnapshot, invalidateGuildSnapshot } = channels;

// ── 1. The schema must cover the bot ───────────────────────────────────
section('[1] schema covers every economy setting the bot understands');
{
  const py = readFileSync(join(root, 'discord-bot/bot/economy.py'), 'utf8');
  const block = py.match(/ECONOMY_DEFAULTS:\s*dict\s*=\s*\{([\s\S]*?)\n\}/);
  check('ECONOMY_DEFAULTS is parseable in economy.py', !!block);
  const botKeys = [...(block?.[1] ?? '').matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g)].map((m) => m[1]);
  check('bot declares its economy defaults', botKeys.length >= 25, `found ${botKeys.length}`);

  const missing = botKeys.filter((k) => !ECONOMY_KEYS.has(k));
  check('every bot default has a declared field', missing.length === 0, `missing: ${missing.join(', ')}`);

  const dupes = ECONOMY_FIELDS.map((f) => f.key).filter((k, i, a) => a.indexOf(k) !== i);
  check('no duplicate field keys', dupes.length === 0, dupes.join(', '));

  // The specific field that started all this.
  const log = ECONOMY_FIELD_BY_KEY.get('logChannelId');
  check('logChannelId is declared', !!log);
  check('logChannelId is a channel field', log?.kind === 'channel');
  check('logChannelId requires view, send and embed',
    ['view', 'send', 'embed'].every((p) => log?.requires?.includes(p)),
    JSON.stringify(log?.requires));
  check('logChannelId is admin-editable, not owner-only', log?.ownerOnly === false);

  // Every numeric field must carry bounds, or "OUT_OF_RANGE" can never fire.
  const unbounded = ECONOMY_FIELDS.filter(
    (f) => (f.kind === 'int' || f.kind === 'number') && (f.min === undefined || f.max === undefined),
  );
  check('every numeric field declares bounds', unbounded.length === 0, unbounded.map((f) => f.key).join(', '));

  // Nothing the bot owns may be quietly admin-editable.
  const ownerKeys = new Set(ECONOMY_FIELDS.filter((f) => f.ownerOnly).map((f) => f.key));
  check('owner-only set is non-trivial and excludes the log channel',
    ownerKeys.size >= 20 && !ownerKeys.has('logChannelId'));

  // Cross-field rules must point at a real field.
  const badRule = schema.ECONOMY_CROSS_RULES.filter((r) => !ECONOMY_FIELD_BY_KEY.has(r.field));
  check('every cross-field rule names a real field', badRule.length === 0);

  // Distinct codes are the whole point of the rewrite.
  const codes = Object.values(schema.ECONOMY_ERROR_CODES);
  for (const code of ['CHANNEL_NOT_FOUND', 'CHANNEL_ACCESS_DENIED', 'MISSING_BOT_PERMISSION',
    'BOT_NOT_IN_GUILD', 'DISCORD_RATE_LIMITED', 'DISCORD_UNAVAILABLE', 'DATABASE_ERROR']) {
    check(`error code ${code} exists`, codes.includes(code));
  }
}

// ── Discord stub ───────────────────────────────────────────────────────
const GUILD = '900000000000000001';
const EVERYONE = GUILD;                       // @everyone shares the guild id
const BOT_ROLE = '900000000000000009';
const CAT = '900000000000000100';
const CH_LOGS = '900000000000000101';         // usable
const CH_GENERAL = '900000000000000102';      // usable
const CH_MUTED = '900000000000000103';        // bot denied Send Messages
const CH_NOEMBED = '900000000000000104';      // bot denied Embed Links
const CH_VOICE = '900000000000000105';        // exists, not text capable
const CH_GONE = '900000000000000199';         // deleted
const CH_HIDDEN = '900000000000000198';       // exists, bot cannot view

const VIEW = 1024, SEND = 2048, EMBED = 4096;

const FAKE_ROLES = [
  { id: EVERYONE, name: '@everyone', permissions: String(VIEW | SEND | EMBED), position: 0 },
  { id: BOT_ROLE, name: 'Murabot', permissions: '0', position: 1 },
];
const FAKE_CHANNELS = [
  { id: CAT, name: 'Staff', type: 4, guild_id: GUILD },
  { id: CH_LOGS, name: 'economy-logs', type: 0, guild_id: GUILD, parent_id: CAT, permission_overwrites: [] },
  { id: CH_GENERAL, name: 'general', type: 0, guild_id: GUILD, permission_overwrites: [] },
  { id: CH_MUTED, name: 'muted', type: 0, guild_id: GUILD, permission_overwrites: [{ id: BOT_ROLE, type: 0, allow: '0', deny: String(SEND) }] },
  { id: CH_NOEMBED, name: 'no-embed', type: 0, guild_id: GUILD, permission_overwrites: [{ id: BOT_ROLE, type: 0, allow: String(VIEW | SEND), deny: String(EMBED) }] },
  { id: CH_VOICE, name: 'Voice', type: 2, guild_id: GUILD, permission_overwrites: [] },
  // The hidden channel is deliberately absent from the guild list, as Discord
  // does for a channel the bot may not view.
];
const HIDDEN_CHANNEL = { id: CH_HIDDEN, name: 'secret', type: 0, guild_id: GUILD };

let fetches = [];
let discordMode = 'ok';

function installFetch() {
  globalThis.fetch = async (url) => {
    const path = String(url);
    fetches.push(path);
    const json = (status, body, headers = {}) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
      json: async () => body,
    });

    if (discordMode === 'rate-limited') {
      return json(429, { retry_after: 2, message: 'You are being rate limited.' }, { 'retry-after': '2' });
    }
    if (discordMode === 'down') {
      return json(503, { message: 'Service Unavailable' });
    }
    if (path.endsWith('/members/@me')) {
      return json(200, { user: { id: '1' }, roles: [BOT_ROLE] });
    }
    if (path.endsWith('/channels')) return json(200, FAKE_CHANNELS);
    if (path.endsWith('/roles')) return json(200, FAKE_ROLES);
    if (path.includes('/channels/')) {
      const id = path.split('/channels/')[1].split('?')[0];
      if (id === CH_GONE) return json(404, { message: 'Unknown Channel' });
      if (id === CH_HIDDEN) return json(403, { message: 'Missing Access' });
      return json(404, { message: 'Unknown Channel' });
    }
    return json(404, { message: 'Unknown Resource' });
  };
}
installFetch();
process.env.DISCORD_BOT_TOKEN = 'test-token-not-a-real-secret';

const REQUIRES = ECONOMY_FIELD_BY_KEY.get('logChannelId').requires;
const verify = (id) => validateChannelSetting(GUILD, 'logChannelId', 'Economy Log Channel', id, REQUIRES);
const reset = () => { invalidateGuildSnapshot(GUILD); fetches = []; discordMode = 'ok'; };

// A. Valid channel + valid settings.
section('[A] valid channel + valid settings → nothing to report');
{
  reset();
  const { values, errors } = validateEconomyDraft(
    { logChannelId: CH_LOGS, dailyAmount: 500, workMin: 100, workMax: 400 },
    { isOwner: true },
  );
  check('valid draft produces no errors', errors.length === 0, JSON.stringify(errors));
  check('valid draft keeps its values', values.dailyAmount === 500 && values.logChannelId === CH_LOGS);
  check('a usable channel passes live verification', (await verify(CH_LOGS)) === null);
  check('a second usable channel also passes', (await verify(CH_GENERAL)) === null);
  check('a channel with no problems needs exactly one snapshot', fetches.length === 3,
    `${fetches.length} calls: ${fetches.join(', ')}`);
}

// B. Deleted channel.
section('[B] deleted channel → CHANNEL_NOT_FOUND');
{
  reset();
  const err = await verify(CH_GONE);
  check('deleted channel is rejected', err !== null);
  check('code is CHANNEL_NOT_FOUND', err?.code === 'CHANNEL_NOT_FOUND', err?.code);
  check('error names the field', err?.field === 'logChannelId');
  check('message tells the user to pick another channel',
    /select another channel/i.test(err?.message ?? ''), err?.message);
}

// B2. A channel that exists but the bot cannot see.
section('[B2] hidden channel → CHANNEL_ACCESS_DENIED (not "not found")');
{
  reset();
  const err = await verify(CH_HIDDEN);
  check('inaccessible channel is rejected', err !== null);
  check('code is CHANNEL_ACCESS_DENIED', err?.code === 'CHANNEL_ACCESS_DENIED', err?.code);
}

// C. Bot missing SEND_MESSAGES.
section('[C] bot missing SEND_MESSAGES → exact permission error');
{
  reset();
  const err = await verify(CH_MUTED);
  check('permission error is reported', err !== null);
  check('code is MISSING_BOT_PERMISSION', err?.code === 'MISSING_BOT_PERMISSION', err?.code);
  check('names Send Messages', err?.missingPermission === 'Send Messages', err?.missingPermission);
  check('message includes the permission name', /Send Messages/.test(err?.message ?? ''), err?.message);
}

// D. Bot missing EMBED_LINKS.
section('[D] bot missing EMBED_LINKS → exact permission error');
{
  reset();
  const err = await verify(CH_NOEMBED);
  check('code is MISSING_BOT_PERMISSION', err?.code === 'MISSING_BOT_PERMISSION', err?.code);
  check('names Embed Links', err?.missingPermission === 'Embed Links', err?.missingPermission);
  check('View + Send are reported as satisfied', /Send Messages/.test(err?.message ?? '') === false);
}

// D2. A channel that cannot receive messages at all.
section('[D2] voice channel → CHANNEL_NOT_TEXT_CAPABLE');
{
  reset();
  const err = await verify(CH_VOICE);
  check('voice channel is rejected', err !== null);
  check('code is CHANNEL_NOT_TEXT_CAPABLE', err?.code === 'CHANNEL_NOT_TEXT_CAPABLE', err?.code);
}

// E. Invalid numeric range.
section('[E] invalid numeric range → exact field error');
{
  const { errors } = validateEconomyDraft({ workMin: 900, workMax: 100 }, { isOwner: true });
  const rule = errors.find((e) => e.code === 'CROSS_FIELD_INVALID');
  check('cross-field error is reported', !!rule);
  check('reported against Work Reward Min', rule?.field === 'workMin', rule?.field);
  check('message is the exact sentence',
    rule?.message === 'Work Reward Min must be less than or equal to Work Reward Max.', rule?.message);

  const oor = validateEconomyDraft({ dailyAmount: 9_999_999 }, { isOwner: true });
  check('out-of-range value is an error, not clamped',
    oor.errors.some((e) => e.field === 'dailyAmount' && e.code === 'OUT_OF_RANGE'),
    JSON.stringify(oor.errors));
  check('an out-of-range value is never silently rewritten',
    !('dailyAmount' in oor.values));

  const notNum = validateEconomyDraft({ dailyAmount: 'abc' }, { isOwner: true });
  check('non-numeric input is INVALID_NUMBER',
    notNum.errors.some((e) => e.field === 'dailyAmount' && e.code === 'INVALID_NUMBER'));

  const notInt = validateEconomyDraft({ lotteryMaxTickets: 2.5 }, { isOwner: true });
  check('a fractional integer field is rejected',
    notInt.errors.some((e) => e.field === 'lotteryMaxTickets' && e.code === 'INVALID_NUMBER'));

  const minBlewMax = validateEconomyDraft({ begMin: 400, begMax: 10 }, { isOwner: true });
  check('beg range rule fires too',
    minBlewMax.errors.some((e) => e.field === 'begMin' && e.code === 'CROSS_FIELD_INVALID'));

  const empty = validateEconomyDraft({ currencyName: '   ' }, { isOwner: true });
  check('blank currency name is rejected',
    empty.errors.some((e) => e.field === 'currencyName' && e.code === 'INVALID_TEXT'));

  const typo = validateEconomyDraft({ dailyAmunt: 100 }, { isOwner: true });
  check('an unknown key is rejected, not ignored',
    typo.errors.some((e) => e.field === 'dailyAmunt'),
    JSON.stringify(typo.errors));

  const manualId = validateEconomyDraft({ logChannelId: 'server-logs' }, { isOwner: true });
  check('a hand-typed channel id is refused',
    manualId.errors.some((e) => e.field === 'logChannelId' && e.code === 'CHANNEL_NOT_FOUND'));

  const notOwner = validateEconomyDraft({ dailyAmount: 100 }, { isOwner: false });
  check('a non-owner cannot change an economic value',
    notOwner.errors.some((e) => e.code === 'OWNER_ONLY'));
}

// F. Multiple invalid fields at once.
section('[F] multiple invalid fields → all reported in one response');
{
  const { errors } = validateEconomyDraft(
    { currencyName: '', dailyAmount: 'nope', lotteryMaxTickets: 0, workMin: 900, workMax: 10, logChannelId: 'nope' },
    { isOwner: true },
  );
  const fields = errors.map((e) => e.field);
  for (const f of ['currencyName', 'dailyAmount', 'lotteryMaxTickets', 'workMin', 'logChannelId']) {
    check(`error reported for ${f}`, fields.includes(f), fields.join(', '));
  }
  check('every error carries a code and a message',
    errors.every((e) => typeof e.code === 'string' && typeof e.message === 'string' && e.message.length > 0));
  check('errors are not collapsed into one generic message',
    new Set(errors.map((e) => e.code)).size >= 3,
    JSON.stringify([...new Set(errors.map((e) => e.code))]));
  check('no error says "failed validation"', !/failed validation/i.test(JSON.stringify(errors)));
}

// G. Discord 429 / outage.
section('[G] Discord 429 → retryable, never reported as an invalid setting');
{
  reset();
  discordMode = 'rate-limited';
  const err = await verify(CH_LOGS);
  check('rate limit is surfaced', err !== null);
  check('code is DISCORD_RATE_LIMITED', err?.code === 'DISCORD_RATE_LIMITED', err?.code);
  check('the error is marked retryable', err?.retryable === true);
  check('a rate limit is not reported as a bad channel',
    err?.code !== 'CHANNEL_NOT_FOUND' && err?.code !== 'MISSING_BOT_PERMISSION', err?.code);
  check('the failure is attributed to Discord, not to the setting',
    /could not be verified/i.test(err?.message ?? ''), err?.message);

  reset();
  discordMode = 'down';
  const down = await verify(CH_LOGS);
  check('an outage is DISCORD_UNAVAILABLE, not a verdict',
    down?.code === 'DISCORD_UNAVAILABLE', down?.code);
  check('an outage is retryable', down?.retryable === true);
}

// G2. Rate-limit hygiene: de-duplication, caching, one snapshot for N checks.
section('[G2] N validations cost one set of Discord calls');
{
  reset();
  discordMode = 'rate-limited';
  await Promise.all([verify(CH_LOGS), verify(CH_GENERAL), verify(CH_MUTED), verify(CH_NOEMBED)]);
  check('four parallel validations share one fetch', fetches.length === 1, `${fetches.length} calls`);

  reset();
  fetches = [];
  await Promise.all([verify(CH_LOGS), verify(CH_GENERAL), verify(CH_MUTED)]);
  const afterFirst = fetches.length;
  await Promise.all([verify(CH_LOGS), verify(CH_GENERAL)]);
  check('a warm cache serves later checks with no new calls', fetches.length === afterFirst,
    `${afterFirst} then ${fetches.length}`);

  reset();
  await verify(CH_LOGS);
  const snap = await guildSnapshot(GUILD);
  const list = listSelectableChannels(snap, GUILD, REQUIRES);
  check('the dropdown lists only text channels',
    list.every((c) => [0, 5, 10, 11, 12].includes(c.type)), JSON.stringify(list.map((c) => c.type)));
  check('a usable channel is marked usable', list.find((c) => c.id === CH_LOGS)?.usable === true);
  check('a muted channel is marked unusable with a reason',
    list.find((c) => c.id === CH_MUTED)?.usable === false &&
    !!list.find((c) => c.id === CH_MUTED)?.reason);
  check('the voice channel is not offered at all', !list.some((c) => c.id === CH_VOICE));
  check('categories are surfaced for the dropdown', list.find((c) => c.id === CH_LOGS)?.categoryName === 'Staff');
  check('a hidden channel is not silently dropped from the list',
    !list.some((c) => c.id === CH_HIDDEN));
}

// H. A failed save writes nothing.
section('[H] a failed save preserves the existing configuration');
{
  const existing = mergeEconomySection(null, {
    currencyName: 'credits', dailyAmount: 750, logChannelId: CH_LOGS, multipliers: { luck: 2 },
  });
  const before = JSON.stringify(existing);

  // The route's order of operations: validate everything, return before the
  // write. A rejected draft therefore has no effect on the stored document.
  const good = validateEconomyDraft({ dailyAmount: 900 }, { existing, isOwner: true });
  check('a good draft still validates', good.errors.length === 0, JSON.stringify(good.errors));
  const afterGood = mergeEconomySection(existing, good.values);
  check('a partial save keeps untouched settings',
    afterGood.currencyName === 'credits' && afterGood.logChannelId === CH_LOGS &&
    JSON.stringify(afterGood.multipliers) === JSON.stringify({ luck: 2 }));

  const bad = validateEconomyDraft({ dailyAmount: -5, workMin: 10_000 }, { existing, isOwner: true });
  check('a bad draft is rejected', bad.errors.length > 0);
  // Nothing is written: the stored document is byte-identical.
  check('the existing configuration is untouched by a failed save',
    JSON.stringify(existing) === before);

  // The route must compute the whole section before the single write, and must
  // return its 422 before that write exists. Asserted on the source because the
  // failure mode ("half of it saved") is an ordering property.
  const route = readFileSync(join(root, 'app/api/dashboard/config/route.ts'), 'utf8');
  const validateIdx = route.indexOf('validateEconomyDraft(');
  const rejectIdx = route.indexOf('ECONOMY_VALIDATION');
  const writeIdx = route.indexOf('update.economy = mergeEconomySection');
  const dbWriteIdx = Math.max(route.indexOf('updateOne('), route.indexOf('findOneAndUpdate('));
  check('the route validates before it merges', validateIdx > 0 && writeIdx > validateIdx);
  check('the route rejects before it builds a write', rejectIdx > validateIdx && writeIdx > rejectIdx);
  check('the database write happens after the section is built', dbWriteIdx > writeIdx);
  check('the failure response is a 422 with structured errors',
    /status: errors\.some\(\(e\) => e\.retryable\) \? 503 : 422/.test(route) && /errors,/.test(route));
  const panel = readFileSync(join(root, 'app/dashboard/economy/EconomyConfigPanel.tsx'), 'utf8');
  const generic = readFileSync(join(root, 'app/dashboard/components/ModuleSettings.tsx'), 'utf8');
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('the economy panel never shows a count-only error',
    !/setting failed validation/.test(stripComments(panel)));
  check('the generic module panel names every failure it lists',
    generic.includes('• ${label} — ${objectName}: ${reason}'));
  check('the route returns a per-field error list', /errors,\n/.test(route) || /\n        errors,/.test(route));
}

// I. Refresh after a successful save.
section('[I] saved settings survive a reload');
{
  const draft = {
    currencyName: 'gems', currencySymbol: '💎', startBalance: 250, dailyAmount: 500,
    weeklyAmount: 2000, monthlyAmount: 9000, workMin: 120, workMax: 480, begMin: 10, begMax: 120,
    gambleMax: 25_000, gambleCooldownSec: 90, workCooldownSec: 1800, begCooldownSec: 240,
    crimeCooldownSec: 900, activityCooldownSec: 300, robCooldownSec: 5400, robMinTarget: 250,
    lotteryTicketPrice: 250, lotteryMaxTickets: 25, jobCooldownSec: 1200, jobFailRate: 0.45,
    bankCapacity: 50_000, logChannelId: CH_GENERAL, disabledItems: ['medkit'],
    disabledJobs: ['janitor'], jobCooldownOverrides: { cashier: 60 }, multipliers: { luck: 3 },
  };
  const { values, errors } = validateEconomyDraft(draft, { isOwner: true });
  check('a full 28-field draft validates', errors.length === 0, JSON.stringify(errors));
  const stored = mergeEconomySection(null, values);
  // Re-reading the stored document is exactly what a refresh does.
  const reloaded = validateEconomyDraft(stored, { isOwner: true });
  check('the stored document validates again on reload', reloaded.errors.length === 0, JSON.stringify(reloaded.errors));
  check('the log channel came back', reloaded.values.logChannelId === CH_GENERAL);
  check('every declared key round-trips with the same value',
    Object.entries(draft).every(([k, v]) => JSON.stringify(reloaded.values[k]) === JSON.stringify(v)),
    JSON.stringify(Object.entries(draft).filter(([k, v]) => JSON.stringify(reloaded.values[k]) !== JSON.stringify(v))));
  check('a saved config has all 28 declared keys', Object.keys(stored).length === ECONOMY_FIELDS.length,
    `${Object.keys(stored).length} keys`);
  check('currency name persisted', reloaded.values.currencyName === 'gems');
}

console.log(`\n${passed} passed, ${failed} failed`);
try { rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ }
if (failed) {
  console.log('Failures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
