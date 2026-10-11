#!/usr/bin/env node
// CI guard + behavioural suite for the Phase 2 general-settings work.
//
//   node scripts/test-general-settings.mjs
//
// Phase 2 added four things that are easy to get subtly wrong, and each one has
// a failure mode nobody sees until a real server is affected:
//
//   A. the language list — the dashboard offering a language Murabot cannot
//      speak produces a setting that silently does nothing;
//   B. message templates — a `{usr}` typo is posted to every new member
//      forever, and the operator only finds out by watching a join;
//   C. embed limits — Discord rejects an over-long embed AFTER the operator
//      typed it, chose a channel and pressed Send; the previous code hid that
//      by truncating the text and reporting success;
//   D. permissions — the send and save routes must re-check the caller and the
//      channel on the SERVER, because the page is the untrusted party.
//
// The modules are executed (transpiled to CommonJS, exactly like
// scripts/test-economy-config.mjs); the routes are checked structurally, since
// executing them needs a Next request context.
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
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
function read(...parts) { return readFileSync(join(root, ...parts), 'utf8'); }
/** Source with comments removed, so prose about a rule is not the rule. */
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

// ── Load the TypeScript modules under test ───────────────────────────────
const outDir = mkdtempSync(join(tmpdir(), 'general-settings-test-'));
for (const file of ['economy-schema', 'general-settings', 'embed-schema']) {
  const { outputText } = ts.transpileModule(read('app', 'lib', `${file}.ts`), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: `${file}.ts`,
  });
  writeFileSync(join(outDir, `${file}.js`), outputText);
}
const require = createRequire(import.meta.url);
const general = require(join(outDir, 'general-settings.js'));
const embedSchema = require(join(outDir, 'embed-schema.js'));

const {
  SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, MESSAGE_MAX_LENGTH, MESSAGE_PLACEHOLDERS,
  GENERAL_ERROR_CODES, validateGeneralDraft, validateMessage, validateChannelId,
  validateLanguage, normalizeGeneralSettings, changedGeneralFields, defaultMessagePreview,
} = general;
const { EMBED_LIMITS, EMBED_ERROR_CODES, validateEmbed, validateEmbeds, embedTotalChars } = embedSchema;

// ── [A] the language list is the bot's list ──────────────────────────────
section('[A] the dashboard speaks exactly the languages Murabot speaks');
{
  const py = read('discord-bot', 'bot', 'i18n.py');
  const botCodes = [...py.matchAll(/^\s{4}"([a-z]{2})":\s*\{/gm)].map((m) => m[1]);
  check('the bot declares a non-trivial language table', botCodes.length >= 2, botCodes.join(', '));
  check('the dashboard offers exactly those codes',
    JSON.stringify(SUPPORTED_LANGUAGES.map((l) => l.code)) === JSON.stringify(botCodes),
    `dashboard: ${SUPPORTED_LANGUAGES.map((l) => l.code).join(', ')} vs bot: ${botCodes.join(', ')}`);
  check('the bot default matches the dashboard default',
    new RegExp(`DEFAULT_LANGUAGE = "${DEFAULT_LANGUAGE}"`).test(py),
    `dashboard default: ${DEFAULT_LANGUAGE}`);

  // The preview copy shown in the message fields must be the bot's actual
  // default copy — a preview that differs from what is sent is a lie.
  function botDefaults(code) {
    const block = py.match(new RegExp(`"${code}":\\s*\\{([\\s\\S]*?)\\n    \\},`));
    const get = (key) => (block?.[1].match(new RegExp(`"${key}":\\s*"([^"]*)"`)) || [])[1];
    return { join: get('join.body'), leave: get('leave.body') };
  }
  for (const code of botCodes) {
    const bot = botDefaults(code);
    check(`${code}: the welcome preview is Murabot's real default`,
      bot.join && defaultMessagePreview(code, 'welcome') === bot.join,
      `dashboard: ${defaultMessagePreview(code, 'welcome')} | bot: ${bot.join}`);
    check(`${code}: the leave preview is Murabot's real default`,
      bot.leave && defaultMessagePreview(code, 'leave') === bot.leave,
      `dashboard: ${defaultMessagePreview(code, 'leave')} | bot: ${bot.leave}`);
  }
  check('an unknown language previews the default language, not a crash',
    defaultMessagePreview('xx', 'welcome') === defaultMessagePreview(DEFAULT_LANGUAGE, 'welcome'));
}

// ── [A2] language validation ─────────────────────────────────────────────
section('[A2] language validation');
{
  check('a supported code passes', validateLanguage('de').ok && validateLanguage('de').value === 'de');
  check('a region tag resolves to its primary subtag',
    validateLanguage('en-GB').ok && validateLanguage('en-GB').value === 'en');
  check('an unsupported language is refused with a reason',
    !validateLanguage('klingon').ok && /supported/i.test(validateLanguage('klingon').error));
  check('an empty language is refused', !validateLanguage('').ok);
  check('a non-string is refused', !validateLanguage(7).ok);
  const stored = normalizeGeneralSettings({ language: 'xx', prefix: 'mg!' }, 'mg!');
  check('a stored but unsupported language falls back to the default',
    stored.language === DEFAULT_LANGUAGE, stored.language);
  check('a document with no settings at all normalizes to real defaults',
    normalizeGeneralSettings(null, 'mg!').language === DEFAULT_LANGUAGE
    && normalizeGeneralSettings(null, 'mg!').welcomeChannelId === '');
  check('the fallback prefix is used when the document has none',
    normalizeGeneralSettings({}, 'mg!').prefix === 'mg!');
}

// ── [B] message templates ────────────────────────────────────────────────
section('[B] welcome/leave message validation');
{
  check('an empty message is allowed (it means "Murabot default")',
    validateMessage('welcomeMessage', '').ok && validateMessage('welcomeMessage', '').value === '');
  check('a whitespace-only message normalizes to empty',
    validateMessage('welcomeMessage', '   ').value === '');
  check('declared placeholders are accepted',
    validateMessage('welcomeMessage', 'Hi {user}, welcome to {server} ({member_count})').ok);
  const typo = validateMessage('welcomeMessage', 'Hi {usr}!');
  check('an unknown placeholder is refused', !typo.ok);
  check('the placeholder error names the offending token',
    !typo.ok && typo.error.includes('{usr}'), !typo.ok ? typo.error : '');
  check('the placeholder error lists the allowed tokens',
    !typo.ok && MESSAGE_PLACEHOLDERS.every((p) => typo.error.includes(p.token)));
  check('the placeholder error carries its own code',
    !typo.ok && typo.code === GENERAL_ERROR_CODES.UNKNOWN_PLACEHOLDER);
  const long = validateMessage('leaveMessage', 'x'.repeat(MESSAGE_MAX_LENGTH + 1));
  check('an over-long message is refused, not truncated', !long.ok);
  check('the length error reports both lengths',
    !long.ok && long.error.includes(String(MESSAGE_MAX_LENGTH)) && long.error.includes(String(MESSAGE_MAX_LENGTH + 1)),
    !long.ok ? long.error : '');
  check('the limit boundary itself is accepted (not off by one)',
    validateMessage('leaveMessage', 'x'.repeat(MESSAGE_MAX_LENGTH)).ok);
  check('placeholders are declared for the operator to copy',
    MESSAGE_PLACEHOLDERS.length >= 4 && MESSAGE_PLACEHOLDERS.some((p) => p.token === '{user}'));
}

// ── [B2] channel ids ─────────────────────────────────────────────────────
section('[B2] channel id validation');
{
  check('an empty channel is allowed (it turns the notice off)',
    validateChannelId('welcomeChannelId', '').ok && validateChannelId('welcomeChannelId', '').value === '');
  check('a snowflake is accepted',
    validateChannelId('welcomeChannelId', '123456789012345678').value === '123456789012345678');
  const bad = validateChannelId('leaveChannelId', 'not-a-channel');
  check('a malformed id is refused', !bad.ok && bad.code === GENERAL_ERROR_CODES.INVALID_CHANNEL_ID);
  check('the malformed-id error names the field', !bad.ok && /Leave channel/.test(bad.error));
}

// ── [B3] whole-draft validation + diffing ────────────────────────────────
section('[B3] draft validation reports every problem at once');
{
  const ok = validateGeneralDraft({
    language: 'fr', welcomeChannelId: '', welcomeMessage: 'Hi {user}',
    leaveChannelId: '', leaveMessage: '',
  });
  check('a valid draft passes and is normalized', ok.ok && ok.value.language === 'fr');

  const many = validateGeneralDraft({
    language: 'nope', welcomeMessage: 'Hi {usr}', leaveMessage: 'y'.repeat(MESSAGE_MAX_LENGTH + 5),
    welcomeChannelId: 'bad', leaveChannelId: 'bad',
  });
  check('an invalid draft is refused', !many.ok);
  check('every invalid field is reported, not just the first',
    !many.ok && new Set(many.errors.map((e) => e.field)).size === 5,
    !many.ok ? many.errors.map((e) => e.field).join(', ') : '');
  check('each error carries a field label for the UI',
    !many.ok && many.errors.every((e) => e.label && e.message));
  check('a non-object payload is refused, not coerced',
    !validateGeneralDraft(null).ok && !validateGeneralDraft([]).ok && !validateGeneralDraft('x').ok);

  const before = normalizeGeneralSettings(
    { prefix: 'mg!', language: 'en', welcomeChannelId: '111', welcomeMessage: 'a' }, 'mg!',
  );
  const changed = changedGeneralFields(before, {
    language: 'en', welcomeChannelId: '111', welcomeMessage: 'b', leaveChannelId: '222', leaveMessage: '',
  });
  check('only the fields that really changed are written',
    JSON.stringify(changed) === JSON.stringify(['welcomeMessage', 'leaveChannelId']),
    changed.join(', '));
  check('a no-op draft writes nothing',
    changedGeneralFields(before, {
      language: 'en', welcomeChannelId: '111', welcomeMessage: 'a', leaveChannelId: '', leaveMessage: '',
    }).length === 0);
}

// ── [C] embed limits ─────────────────────────────────────────────────────
section('[C] Discord embed limits are enforced, never truncated');
{
  const base = { title: 'Hi', description: 'Body', fields: [] };
  check('a simple embed passes', validateEmbed(base).ok);

  const longTitle = validateEmbed({ ...base, title: 'x'.repeat(EMBED_LIMITS.TITLE + 1) });
  check('an over-long title is refused', !longTitle.ok
    && longTitle.errors.some((e) => e.code === EMBED_ERROR_CODES.TOO_LONG && e.field === 'title'));
  check('the title error carries the limit', !longTitle.ok
    && longTitle.errors[0].limit === EMBED_LIMITS.TITLE && longTitle.errors[0].current === EMBED_LIMITS.TITLE + 1);
  check('the title boundary itself passes',
    validateEmbed({ ...base, title: 'x'.repeat(EMBED_LIMITS.TITLE) }).ok);

  const longDesc = validateEmbed({ ...base, description: 'x'.repeat(EMBED_LIMITS.DESCRIPTION + 1) });
  check('an over-long description is refused (not sliced)',
    !longDesc.ok && longDesc.errors.some((e) => e.code === EMBED_ERROR_CODES.TOO_LONG));

  const tooMany = validateEmbed({
    ...base,
    fields: Array.from({ length: EMBED_LIMITS.FIELDS + 1 }, (_, i) => ({ name: `f${i}`, value: 'v' })),
  });
  check('more fields than Discord allows is refused',
    !tooMany.ok && tooMany.errors.some((e) => e.code === EMBED_ERROR_CODES.TOO_MANY_FIELDS));
  check('exactly the field limit passes',
    validateEmbed({
      ...base,
      fields: Array.from({ length: EMBED_LIMITS.FIELDS }, (_, i) => ({ name: `f${i}`, value: 'v' })),
    }).ok);

  // The 6000-character total is the limit operators actually hit.
  const huge = validateEmbed({
    description: 'x'.repeat(EMBED_LIMITS.DESCRIPTION),
    fields: Array.from({ length: 3 }, () => ({ name: 'n', value: 'y'.repeat(EMBED_LIMITS.FIELD_VALUE) })),
  });
  check('an embed over the 6000-character total is refused',
    !huge.ok && huge.errors.some((e) => e.code === EMBED_ERROR_CODES.TOTAL_TOO_LONG));

  check('a plain-text URL for an image is refused',
    !validateEmbed({ ...base, image: { url: 'not a url' } }).ok);
  check('a non-http scheme is refused',
    !validateEmbed({ ...base, thumbnail: { url: 'javascript:alert(1)' } }).ok);
  check('an https image passes', validateEmbed({ ...base, thumbnail: { url: 'https://cdn.discordapp.com/a.png' } }).ok);
  check('a non-hex colour is refused',
    !validateEmbed({ ...base, color: 0xffffff + 1 }).ok
    && validateEmbed({ ...base, color: 0xffffff + 1 }).errors.some((e) => e.code === EMBED_ERROR_CODES.INVALID_COLOR));
  check('a colour given as "#ff8800" is accepted',
    validateEmbed({ ...base, color: '#ff8800' }).ok
    && validateEmbed({ ...base, color: '#ff8800' }).embed.color === 0xff8800);
  check('an unparseable timestamp is refused',
    !validateEmbed({ ...base, timestamp: 'not-a-date' }).ok);
  check('a real timestamp is normalized to ISO',
    validateEmbed({ ...base, timestamp: '2026-01-02T03:04:05Z' }).embed.timestamp === '2026-01-02T03:04:05.000Z');
  check('an empty embed is refused with its own code',
    validateEmbed({ fields: [] }).errors.some((e) => e.code === EMBED_ERROR_CODES.EMPTY_EMBED));
  check('a field with a name but no value is refused',
    validateEmbed({ ...base, fields: [{ name: 'n', value: '' }] }).errors
      .some((e) => e.code === EMBED_ERROR_CODES.REQUIRED && e.field === 'fields.0.value'));
  check('a blank field row is dropped rather than rejected',
    validateEmbed({ ...base, fields: [{ name: '', value: '' }, { name: 'a', value: 'b' }] }).ok);
  check('every problem in one embed is reported together', (() => {
    const r = validateEmbed({
      title: 'x'.repeat(EMBED_LIMITS.TITLE + 1),
      fields: [{ name: 'n', value: 'v' }, { name: 'n2', value: 'v' }],
      color: -5, timestamp: 'nope', url: 'ftp://x',
    });
    // title length, title URL, colour, timestamp — all four in one answer.
    return !r.ok && r.errors.length === 4;
  })());

  const ok = validateEmbed({
    title: 'T', description: 'D', color: 0x123456,
    author: { name: 'A', icon_url: 'https://x/y.png' },
    footer: { text: 'F' }, fields: [{ name: 'n', value: 'v', inline: true }],
    thumbnail: { url: 'https://x/t.png' },
  });
  check('a fully populated embed validates', ok.ok);
  check('the parsed embed drops empty blocks instead of sending ""',
    ok.ok && !('url' in ok.embed) && ok.embed.footer.text === 'F');
  check('field inline flags survive parsing', ok.ok && ok.embed.fields[0].inline === true);

  check('more embeds than a message allows is refused',
    !validateEmbeds(Array.from({ length: EMBED_LIMITS.PER_MESSAGE + 1 }, () => base)).ok);
  check('an embed error is labelled with which embed failed', (() => {
    const r = validateEmbeds([base, { title: 'x'.repeat(EMBED_LIMITS.TITLE + 1), fields: [] }]);
    return !r.ok && r.errors.every((e) => e.label.startsWith('Embed 2'));
  })());
  check('two valid embeds pass together', validateEmbeds([base, { description: 'two', fields: [] }]).ok);
  check('the character total counts title, description, fields, footer and author', (() => {
    const total = embedTotalChars({
      title: 'ab', description: 'cde', fields: [{ name: 'f', value: 'gh', inline: false }],
      footer: { text: 'ij' }, author: { name: 'kl' },
    });
    return total === 2 + 3 + 1 + 2 + 2 + 2;
  })());
}

// ── [D] the routes enforce this server-side ──────────────────────────────
section('[D] the API routes enforce permissions and validation on the server');
{
  const settings = strip(read('app', 'api', 'dashboard', 'settings', 'route.ts'));
  check('the settings PATCH authenticates through the session guard',
    /requireSession\(guildId\)/.test(settings));
  check('the settings GET re-verifies Manage on the requested guild',
    /requireGuildManage\(token, guildId\)/.test(settings));
  check('settings are validated before anything is written',
    settings.indexOf('validateGeneralDraft(body.settings)') < settings.indexOf('saveGuildGeneralFields('));
  check('a channel setting is verified against Discord before the write',
    /validateChannelSetting\(/.test(settings));
  check('a failed channel verdict returns a per-field error and saves nothing',
    /errors,\n?\s*message: 'Nothing was saved/.test(settings) || /'Nothing was saved\. '/.test(settings));
  check('a partial write is refused rather than clearing the omitted fields',
    /INCOMPLETE_SETTINGS/.test(settings) && /GENERAL_SETTINGS_FIELDS\.filter\(\(key\) => !\(key in incoming\)\)/.test(settings));
  check('the prefix goes through its one canonical writer',
    /saveGuildPrefix\(guildId/.test(settings) && !/['"]dashboardPrefix['"]/.test(settings));
  check('the route distinguishes applied from pending',
    /propagation === 'applied'/.test(settings) && /'pending'/.test(settings));
  check('the route writes an audit entry with real before/after values',
    /diffConfigUpdate\(/.test(settings) && /auditConfigChange\(/.test(settings));

  const messages = strip(read('app', 'api', 'dashboard', 'messages', 'route.ts'));
  check('the send route validates embeds through the shared schema',
    /validateEmbeds\(/.test(messages));
  check('the send route no longer truncates embed text', !/slice\(0,\s*4096\)/.test(messages));
  check('the send route verifies the caller manages the guild',
    /requireGuildManage\(token, guildId\)/.test(messages));
  check('a real 403 is reported as a permission problem, not a generic failure',
    /MISSING_BOT_PERMISSION/.test(messages));
  check('a 404 is reported as a missing channel', /CHANNEL_NOT_FOUND/.test(messages));
  check('a 429 forwards Discord Retry-After',
    /'Retry-After': String\(Math.ceil\(retryAfterMs \/ 1000\)\)/.test(messages));
  check('only a channel VERDICT blocks a send; an unavailable bot does not',
    /verdict\.code === ECONOMY_ERROR_CODES\.CHANNEL_NOT_FOUND/.test(messages)
    && /verdict\.code === ECONOMY_ERROR_CODES\.MISSING_BOT_PERMISSION/.test(messages));
  check('a 2xx with no message id is not reported as a delivered message',
    /UNCONFIRMED/.test(messages));

  const embeds = strip(read('app', 'api', 'dashboard', 'embeds', 'route.ts'));
  for (const handler of ['GET', 'POST', 'DELETE']) {
    const at = embeds.indexOf(`export async function ${handler}(`);
    const body = at === -1 ? '' : embeds.slice(at, embeds.indexOf('\nexport async function', at + 10) === -1
      ? undefined : embeds.indexOf('\nexport async function', at + 10));
    check(`the embeds ${handler} handler guards on Manage before doing work`,
      at !== -1 && body.includes('await guard(token, guildId)'));
  }
  check('saved drafts are validated with the same limits as a send',
    /validateEmbed\(body\.embed\)/.test(embeds));
  check('the channel list comes from Murabot (permission verdicts included)',
    /listSelectableChannels\(guildId, \['view', 'send', 'embed'\]\)/.test(embeds));

  const config = strip(read('app', 'lib', 'murabot-config.ts'));
  check('the general-field writer refuses fields it does not own',
    /GENERAL_CONFIG_KEYS\.includes\(key\)/.test(config));
  check('the general-field writer lists no prefix field (one writer only)',
    !/GENERAL_CONFIG_KEYS[\s\S]{0,200}?'prefix'/.test(config));
  check('an applied general-settings write means Murabot read the values back',
    /entries\.every\(\(\[key, value\]\) => stored\[key\] === value\)/.test(config));
  check('a bridge that is not configured leaves the write pending, not applied',
    /if \(!secret\)[\s\S]{0,400}?propagation: 'pending'/.test(config));
}

// ── [E] one field list, declared in three places ─────────────────────────
section('[E] the schema, the canonical writer and the bot agree on the fields');
{
  // These three lists describe the SAME settings. A field added to one and
  // forgotten in another is silently dropped on the way to Murabot — the same
  // class of bug as the economy route that persisted 12 of 21 keys.
  const schemaFields = [...general.GENERAL_SETTINGS_FIELDS].sort();
  const configSrc = read('app', 'lib', 'murabot-config.ts');
  const writerBlock = configSrc.slice(configSrc.indexOf('GENERAL_CONFIG_KEYS'));
  const writerFields = [...writerBlock.slice(0, writerBlock.indexOf('];')).matchAll(/'([a-zA-Z]+)'/g)]
    .map((m) => m[1]).sort();
  const pySrc = read('discord-bot', 'bot', 'main.py');
  const pyBlock = pySrc.slice(pySrc.indexOf('GENERAL_CONFIG_FIELDS = ('));
  const botFields = [...pyBlock.slice(0, pyBlock.indexOf(')')).matchAll(/"([a-zA-Z]+)"/g)]
    .map((m) => m[1]).sort();

  check('the schema declares the general settings', schemaFields.length === 5, schemaFields.join(', '));
  check('the canonical writer persists exactly those fields',
    JSON.stringify(writerFields) === JSON.stringify(schemaFields),
    `writer: ${writerFields.join(', ')} | schema: ${schemaFields.join(', ')}`);
  check("the bot's endpoint stores exactly those fields",
    JSON.stringify(botFields) === JSON.stringify(schemaFields),
    `bot: ${botFields.join(', ')} | schema: ${schemaFields.join(', ')}`);
  check('none of the three lists carries the command prefix',
    !writerFields.includes('prefix') && !botFields.includes('prefix'));
}

// ── [F] JSON on every path ───────────────────────────────────────────────
section('[F] the routes answer JSON even on an unexpected throw');
{
  for (const [label, file] of [
    ['settings', ['app', 'api', 'dashboard', 'settings', 'route.ts']],
    ['embeds', ['app', 'api', 'dashboard', 'embeds', 'route.ts']],
    ['messages', ['app', 'api', 'dashboard', 'messages', 'route.ts']],
  ]) {
    const src = strip(read(...file));
    const parts = src.split(/export async function /).slice(1);
    check(`${label}: the route exports handlers`, parts.length >= 2, `${parts.length}`);
    const unguarded = parts
      .map((p, i) => ({ name: (p.match(/^([A-Z]+)/) || [])[1] ?? `#${i}`, body: p }))
      .filter((h) => !/try\s*\{/.test(h.body) || !/catch\s*(\{|\()/.test(h.body))
      .map((h) => h.name);
    // A thin `export` wrapper around an inner handler satisfies the contract
    // too, so look at the whole module: every entry point must reach a catch.
    check(`${label}: every handler has a catch (a DB outage is JSON, not HTML 500)`,
      unguarded.length === 0, `unguarded: ${unguarded.join(', ')}`);
    check(`${label}: unexpected throws are reported as retryable`, /retryable: true/.test(src));
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed) {
  console.log('FAILED:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('general settings: OK');
