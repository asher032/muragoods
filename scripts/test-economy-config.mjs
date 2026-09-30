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
// The route's logic is split into three modules under app/lib, which this suite
// exercises against a STUBBED MURABOT — the channel verdicts come from the
// bot's gateway, not from a site-side Discord call, so the stub answers the
// bot's endpoint and mirrors the verdicts it would return:
//
//   A. valid channel + valid settings → no errors
//   B. deleted channel              → CHANNEL_NOT_FOUND
//   C. bot missing SEND_MESSAGES    → MISSING_BOT_PERMISSION
//   D. bot missing EMBED_LINKS      → MISSING_BOT_PERMISSION
//   E. invalid numeric range        → exact field error
//   F. multiple invalid fields      → all reported at once
//   G. Discord 429 / outage         → retryable, never "invalid"
//   H. a failed save writes nothing → existing config preserved
//   I. values survive a round trip  → what was saved is what comes back
//
// The bot side of the same contract — how it computes a verdict from its
// gateway cache — is covered by discord-bot/scripts/test_economy_owner_and_channels.py.
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
for (const file of ['economy-schema', 'economy-validate', 'discord-channels', 'bot-presence']) {
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
const presence = require(join(outDir, 'bot-presence.js'));
const { ECONOMY_FIELDS, ECONOMY_FIELD_BY_KEY, ECONOMY_KEYS } = schema;
const { validateEconomyDraft, mergeEconomySection } = validate;
const { validateChannelSetting, listSelectableChannels, invalidateBotPresence } = channels;
const { invalidateBotPresence: dropPresence } = presence;

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
    'BOT_NOT_IN_GUILD', 'BOT_OFFLINE', 'BOT_GATEWAY_NOT_READY', 'DISCORD_RATE_LIMITED',
    'DISCORD_UNAVAILABLE', 'DATABASE_ERROR']) {
    check(`error code ${code} exists`, codes.includes(code));
  }

  // Every bot-state failure the bot can report needs its own code, or the UI
  // is back to one sentence for all of them.
  const botCodes = ['BOT_ONLINE', 'BOT_OFFLINE', 'BOT_GATEWAY_NOT_READY', 'BOT_NOT_IN_GUILD',
    'BOT_PERMISSION_MISSING', 'DISCORD_RATE_LIMITED', 'DISCORD_API_ERROR',
    'AUTHENTICATION_ERROR', 'BRIDGE_NOT_CONFIGURED', 'INTERNAL_ERROR'];
  const pyCodes = readFileSync(join(root, 'discord-bot/bot/main.py'), 'utf8');
  const clientCodes = readFileSync(join(root, 'app/lib/bot-presence.ts'), 'utf8');
  for (const code of botCodes) {
    check(`${code} is declared by the site client`, clientCodes.includes(`'${code}'`));
  }
  // The bot reads from its gateway cache and makes no REST calls, so a
  // throttle cannot originate there — but it must still be able to report the
  // states that CAN originate there.
  for (const code of ['BOT_OFFLINE', 'BOT_GATEWAY_NOT_READY', 'BOT_NOT_IN_GUILD']) {
    check(`the bot can emit ${code}`, pyCodes.includes(`"${code}"`));
  }
  // The channel handler itself must not touch REST — that is what makes it
  // immune to throttling. (An unrelated API-reachability probe elsewhere in
  // main.py is fine and is not part of this path.)
  const channelsHandler = pyCodes.match(/async def economy_channels[\s\S]*?add_get\("\/economy\/channels/);
  check('the bot has a gateway-cached channel handler', !!channelsHandler);
  check('the channel handler makes no REST call', !!channelsHandler && !/session\.|aiohttp|discord\.com\/api/.test(channelsHandler[0]));
  check('the channel handler reads the guild from the bot cache',
    !!channelsHandler && /bot\.get_guild\(/.test(channelsHandler[0]));
  check('the site still handles a 429 from the bot as retryable',
    clientCodes.includes('DISCORD_RATE_LIMITED') && clientCodes.includes('retryAfterMs'));
  // Comments may explain the old failure; shipped STRINGS may not contain it.
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//', 1)[0]).join('\n');
  check('the site has no catch-all bot-check message left',
    !/Discord did not answer the bot check/.test(
      [
        'app/dashboard/economy/EconomyLogChannelSelect.tsx',
        'app/dashboard/economy/EconomyConfigPanel.tsx',
        'app/lib/discord-channels.ts',
        'app/lib/bot-presence.ts',
        'app/api/dashboard/economy/channels/route.ts',
        'app/api/dashboard/resources/validate/route.ts',
        'app/dashboard/components/selectors.tsx',
      ].map((f) => stripComments(readFileSync(join(root, f), 'utf8'))).join('\n')));
}

// ── The stubbed Murabot ────────────────────────────────────────────────
// Channel verdicts now come from the bot's gateway cache, so the stub answers
// the bot's own endpoint with the verdicts it would have computed. The bot's
// side of that computation is asserted in the bot's own test suite.
const GUILD = '900000000000000001';
const CH_LOGS = '900000000000000101';         // usable
const CH_GENERAL = '900000000000000102';      // usable
const CH_MUTED = '900000000000000103';        // bot denied Send Messages
const CH_NOEMBED = '900000000000000104';      // bot denied Embed Links
const CH_GONE = '900000000000000199';         // deleted
const CH_HIDDEN = '900000000000000198';       // exists, bot cannot view

const REQUIREMENT_LABEL = { view: 'View Channel', send: 'Send Messages', embed: 'Embed Links' };

/** The channel list Murabot would report, with a verdict per channel. */
function botChannelList() {
  const verdict = (id, name, categoryName, missingRequirement) => {
    const missing = missingRequirement
      ? { requirement: missingRequirement, permission: `${missingRequirement}_channel`.replace('view_channel_channel', 'view_channel'), label: REQUIREMENT_LABEL[missingRequirement] }
      : null;
    return {
      id, name, type: 0, categoryName, usable: !missing, missing,
      checks: (botMode === 'ok' ? ['view', 'send', 'embed'] : ['view', 'send', 'embed'])
        .map((r) => ({ requirement: r, label: `Murabot can: ${REQUIREMENT_LABEL[r]}`, ok: r !== missingRequirement })),
    };
  };
  return [
    verdict(CH_LOGS, 'economy-logs', 'Staff', null),
    verdict(CH_GENERAL, 'general', null, null),
    verdict(CH_MUTED, 'muted', null, 'send'),
    verdict(CH_NOEMBED, 'no-embed', null, 'embed'),
  ];
}

let fetches = [];
let botMode = 'ok';

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
    const presence = {
      online: true, installed: true, guildAccessible: true,
      botUserId: '100000000000000000', botUsername: 'muragoods',
      gatewayState: 'ONLINE', heartbeatAgeSeconds: 3, latencyMs: 81,
    };
    if (botMode === 'rate-limited') {
      return json(429, { ok: false, error: { code: 'DISCORD_RATE_LIMITED', message: 'Slow down.' } }, { 'retry-after': '2' });
    }
    if (botMode === 'down') {
      return json(500, { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Murabot exploded.' } });
    }
    if (botMode === 'refused') {
      return json(401, { ok: false, code: 'AUTHENTICATION_ERROR', error: 'Unauthorized' });
    }
    // Murabot reports its own bot state as `ok: true` plus an `error` object and
    // a non-2xx status — it DID answer; the answer is "I cannot see that guild".
    // The site must read that shape, or a bot that is simply absent from the
    // server looks exactly like a deleted channel.
    if (botMode === 'offline') {
      return json(503, { ok: true, state: 'OFFLINE', channels: [], bot: { installed: false, online: false, guildAccessible: false }, error: { code: 'BOT_OFFLINE', message: 'Murabot is not connected to Discord right now.' } });
    }
    if (botMode === 'gateway-not-ready') {
      return json(503, { ok: true, state: 'CONNECTING', channels: [], bot: { installed: false, online: false, guildAccessible: false }, error: { code: 'BOT_GATEWAY_NOT_READY', message: 'Murabot is still identifying with Discord.' } });
    }
    if (botMode === 'not-in-guild') {
      return json(404, { ok: true, state: 'ONLINE', channels: [], bot: { installed: false, online: true, guildAccessible: false }, error: { code: 'BOT_NOT_IN_GUILD', message: 'Murabot is not installed in this server.' } });
    }
    if (path.includes('/economy/channels/')) {
      return json(200, { ok: true, state: 'ONLINE', bot: presence, requires: ['view', 'send', 'embed'], channels: botChannelList() });
    }
    if (path.includes('/bot/status')) {
      return json(200, { ok: true, state: 'ONLINE', ready: true, latencyMs: 81, uptimeSeconds: 975, heartbeatAgeSeconds: 3, reconnectCount: 0, guildIds: [GUILD], botUserId: presence.botUserId, botUsername: 'muragoods' });
    }
    return json(404, { ok: false, code: 'UNKNOWN' });
  };
}
installFetch();
process.env.DISCORD_BOT_TOKEN = 'test-token-not-a-real-secret';
process.env.DISCORD_BRIDGE_SECRET = 'test-bridge-secret-not-a-real-secret';
process.env.BOT_HEALTH_URL = 'https://bot.invalid';

const REQUIRES = ECONOMY_FIELD_BY_KEY.get('logChannelId').requires;
const verify = (id) => validateChannelSetting(GUILD, 'logChannelId', 'Economy Log Channel', id, REQUIRES);
const reset = () => {
  invalidateBotPresence(GUILD);
  dropPresence(GUILD);
  fetches = [];
  botMode = 'ok';
};

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
  check('a usable channel passes verification', (await verify(CH_LOGS)) === null);
  check('a second usable channel also passes', (await verify(CH_GENERAL)) === null);
  check('verifying N settings costs one bot call', fetches.length === 1, `${fetches.length} calls`);
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

// B2. A channel the bot exists but cannot see.
section('[B2] hidden channel → refused, not silently accepted');
{
  reset();
  const err = await verify(CH_HIDDEN);
  check('inaccessible channel is rejected', err !== null);
  check('the code is one of the precise ones',
    ['CHANNEL_NOT_FOUND', 'CHANNEL_ACCESS_DENIED'].includes(err?.code), err?.code);
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
  check('the message names the channel', /no-embed/.test(err?.message ?? ''), err?.message);
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
  check('a non-owner can still change the log channel',
    validateEconomyDraft({ logChannelId: CH_LOGS }, { isOwner: false }).errors.length === 0);
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

// G. Discord 429 / outage / refusal / bot state.
section('[G] transport failures are retryable, never "invalid"');
{
  reset();
  botMode = 'rate-limited';
  const limited = await verify(CH_LOGS);
  check('rate limit is surfaced', limited !== null);
  check('code is DISCORD_RATE_LIMITED', limited?.code === 'DISCORD_RATE_LIMITED', limited?.code);
  check('the error is marked retryable', limited?.retryable === true);
  check('a rate limit is not reported as a bad channel',
    limited?.code !== 'CHANNEL_NOT_FOUND' && limited?.code !== 'MISSING_BOT_PERMISSION', limited?.code);
  check('the failure is attributed to the connection, not to the setting',
    /could not be verified/i.test(limited?.message ?? ''), limited?.message);

  reset();
  botMode = 'down';
  const down = await verify(CH_LOGS);
  check('an outage is DISCORD_UNAVAILABLE, not a verdict', down?.code === 'DISCORD_UNAVAILABLE', down?.code);
  check('an outage is retryable', down?.retryable === true);

  reset();
  botMode = 'refused';
  const refused = await verify(CH_LOGS);
  check('a rejected connection is BRIDGE_NOT_CONFIGURED, not a channel problem',
    refused?.code === 'BRIDGE_NOT_CONFIGURED', refused?.code);

  reset();
  botMode = 'offline';
  const offline = await verify(CH_LOGS);
  check('an offline bot has its own code', offline?.code === 'BOT_OFFLINE', offline?.code);
  check('an offline bot is retryable', offline?.retryable === true);
  check('an offline bot is not blamed on the channel',
    offline?.code !== 'CHANNEL_NOT_FOUND' && offline?.code !== 'MISSING_BOT_PERMISSION');

  reset();
  botMode = 'gateway-not-ready';
  const connecting = await verify(CH_LOGS);
  check('an unready gateway has its own code', connecting?.code === 'BOT_GATEWAY_NOT_READY', connecting?.code);
  check('an unready gateway is retryable', connecting?.retryable === true);

  reset();
  botMode = 'not-in-guild';
  const absent = await verify(CH_LOGS);
  check('a bot that is not in the guild says so', absent?.code === 'BOT_NOT_IN_GUILD', absent?.code);
  check('a bot that is not in the guild is not retryable', absent?.retryable === false, String(absent?.retryable));
  check('an absent bot is NOT reported as a deleted channel',
    absent?.code !== 'CHANNEL_NOT_FOUND', absent?.code);
  check('an absent bot quotes the bot, not the channel',
    /not installed in this server/i.test(absent?.message ?? ''), absent?.message);
}

// G2. Rate-limit hygiene: de-duplication and caching.
section('[G2] N validations cost one bot call');
{
  reset();
  botMode = 'rate-limited';
  await Promise.all([verify(CH_LOGS), verify(CH_GENERAL), verify(CH_MUTED), verify(CH_NOEMBED)]);
  check('four parallel validations share one call', fetches.length === 1, `${fetches.length} calls`);

  reset();
  fetches = [];
  await Promise.all([verify(CH_LOGS), verify(CH_GENERAL), verify(CH_MUTED)]);
  const afterFirst = fetches.length;
  await Promise.all([verify(CH_LOGS), verify(CH_GENERAL)]);
  check('a warm cache serves later checks with no new calls', fetches.length === afterFirst,
    `${afterFirst} then ${fetches.length}`);

  reset();
  const list = await listSelectableChannels(GUILD, REQUIRES);
  check('the bot check succeeded', list.error === null, JSON.stringify(list.error));
  check('usable channels are offered', list.channels.filter((c) => c.usable).length === 2,
    JSON.stringify(list.channels.map((c) => [c.id, c.usable])));
  check('unusable channels are offered with a reason',
    list.channels.filter((c) => !c.usable).every((c) => !!c.missing?.label));
  check('categories are surfaced for the dropdown',
    list.channels.find((c) => c.id === CH_LOGS)?.categoryName === 'Staff');
  check('a hidden channel is not silently offered as usable',
    !list.channels.some((c) => c.id === CH_HIDDEN && c.usable));
}

// H. A failed save writes nothing.
section('[H] a failed save preserves the existing configuration');
{
  const existing = mergeEconomySection(null, {
    currencyName: 'credits', dailyAmount: 750, logChannelId: CH_LOGS, multipliers: { luck: 2 },
  });
  const before = JSON.stringify(existing);

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
    /status: errors\.some\(\(e\) => e\.retryable\) \? 503 : 422/.test(route) || /status = ownerOnly \? 403/.test(route));
  check('the failure response carries the per-field errors', /\n        errors,/.test(route));
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//', 1)[0]).join('\n');
  const panel = strip(readFileSync(join(root, 'app/dashboard/economy/EconomyConfigPanel.tsx'), 'utf8'));
  const generic = strip(readFileSync(join(root, 'app/dashboard/components/ModuleSettings.tsx'), 'utf8'));
  check('the economy panel never shows a count-only error',
    !/setting failed validation/.test(panel));
  check('the generic module panel names every failure it lists',
    generic.includes('• ${label} — ${objectName}: ${reason}'));
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
