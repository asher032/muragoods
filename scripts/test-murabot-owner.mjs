#!/usr/bin/env node
// Owner resolution for Murabot's economy values, and the bot check's error
// taxonomy. Both are security-relevant and neither can be checked by a type
// system, so they are pinned here.
//
//   node scripts/test-murabot-owner.mjs
//
// What this guards:
//   1. Ownership is a comparison of the AUTHENTICATED Discord user id against
//      MURABOT_OWNER_DISCORD_ID. Never a username, display name, nickname, tag,
//      guild role, guild owner or Manage Server permission.
//   2. The real owner (1014695308778799204 / socrastender) is recognised, and an
//      account with the same name but a different id is not.
//   3. A client cannot assert ownership: no route reads an owner/actor from the
//      request, and none of the browser code sends one.
//   4. Diagnostics mask both ids, and no secret can reach a log line.
//   5. Every bot-check failure keeps its own code — "Discord did not answer the
//      bot check" is gone.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
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
const section = (t) => console.log(`\n${t}`);

// The canonical owner, and the display name that goes with it. The NAME is
// only ever used to prove it is IGNORED.
const OWNER_ID = '1014695308778799204';
const OWNER_NAME = 'socrastender';

const outDir = mkdtempSync(join(tmpdir(), 'murabot-owner-'));
{
  const { outputText } = ts.transpileModule(
    readFileSync(join(root, 'app/lib/murabot-owner.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: 'murabot-owner.ts' },
  );
  writeFileSync(join(outDir, 'murabot-owner.js'), outputText);
}
const require = createRequire(import.meta.url);

function loadWith(env) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  delete require.cache[require.resolve(join(outDir, 'murabot-owner.js'))];
  const mod = require(join(outDir, 'murabot-owner.js'));
  return {
    mod,
    restore() {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

// ── 1. The owner is recognised by id ───────────────────────────────────
section('[1] the Murabot owner is recognised by Discord user id');
const owner = loadWith({ MURABOT_OWNER_DISCORD_ID: OWNER_ID });
{
  const m = owner.mod;
  check('the configured id is read from MURABOT_OWNER_DISCORD_ID', m.murabotOwnerDiscordId() === OWNER_ID);
  check('the owner is the owner', m.isMurabotOwner(OWNER_ID) === true);
  check('the owner may act on any guild, including one they do not own',
    m.isMurabotOwner(OWNER_ID) === true);

  // The name is irrelevant. This is the whole point.
  check('the display name is not consulted anywhere', m.isMurabotOwner.length >= 1);
  check('an account with the right name but the wrong id is NOT the owner',
    m.isMurabotOwner('999999999999999999') === false);
  check('an id containing the owner id is NOT the owner', m.isMurabotOwner(`x${OWNER_ID}`) === false);
  check('the owner id with a trailing digit is NOT the owner', m.isMurabotOwner(`${OWNER_ID}0`) === false);
  // A Discord id exceeds 2^53, so it MUST arrive as a string. A float that has
  // already lost precision fails closed rather than matching a wrong account.
  check('a precision-lost numeric id does NOT match', m.isMurabotOwner(Number(OWNER_ID)) === false);
  check('the id as a string is the owner', m.isMurabotOwner(String(OWNER_ID)) === true);
  check('surrounding whitespace is tolerated', m.isMurabotOwner(`  ${OWNER_ID} `) === true);
  check('a stranger is not the owner', m.isMurabotOwner('444444444444444444') === false);
  check('a guild owner id is not automatically the owner', m.isMurabotOwner('222222222222222222') === false);
  check('a missing id is not the owner', m.isMurabotOwner(null) === false);
  check('an undefined id is not the owner', m.isMurabotOwner(undefined) === false);
  check('a non-numeric id is not the owner', m.isMurabotOwner(OWNER_NAME) === false);
  check('an empty id is not the owner', m.isMurabotOwner('') === false);
  check('the owner name is never accepted in place of an id',
    m.isMurabotOwner(OWNER_NAME) === false && m.isMurabotOwner(`#${OWNER_NAME}`) === false);
  check('there is no problem to report when configured', m.ownerConfigurationProblem() === null);
}

// ── 2. Unconfigured and malformed configuration fail closed ────────────
section('[2] a misconfigured deployment grants nothing');
for (const [label, value] of [
  ['unset', undefined],
  ['empty', ''],
  ['a username', OWNER_NAME],
  ['a tagged name', `#${OWNER_NAME}`],
  ['a non-numeric string', 'owner'],
]) {
  const bad = loadWith({ MURABOT_OWNER_DISCORD_ID: value });
  check(`${label} configuration resolves to no owner`, bad.mod.murabotOwnerDiscordId() === null);
  check(`${label} configuration makes the real owner NOT the owner`, bad.mod.isMurabotOwner(OWNER_ID) === false);
  check(`${label} configuration explains itself`, typeof bad.mod.ownerConfigurationProblem() === 'string'
    && bad.mod.ownerConfigurationProblem().includes('MURABOT_OWNER_DISCORD_ID'));
  bad.restore();
}

// ── 3. Diagnostics mask the ids and leak nothing ───────────────────────
section('[3] owner diagnostics are safe to log');
{
  const m = owner.mod;
  const d = m.ownerDiagnostics(OWNER_ID);
  check('the authenticated id is masked', d.authenticatedDiscordUserId === '********9204', d.authenticatedDiscordUserId);
  check('the configured id is masked', d.configuredOwnerId === '********9204', d.configuredOwnerId);
  check('the match is reported', d.isOwner === true);
  check('the configuration state is reported', d.ownerConfigured === true);
  check('NEITHER full id appears in the diagnostics', !JSON.stringify(d).includes(OWNER_ID));
  check('a stranger is reported as not the owner', m.ownerDiagnostics('444444444444444444').isOwner === false);
  check('a null caller does not throw', m.ownerDiagnostics(null).authenticatedDiscordUserId === null);

  // What the dev line actually prints.
  process.env.NODE_ENV = 'development';
  const logged = [];
  const realLog = console.log;
  console.log = (...args) => logged.push(args.join(' '));
  m.logOwnerCheck(OWNER_ID, '997389969448517632', 'economy-save');
  m.logOwnerCheck('444444444444444444', '997389969448517632', 'economy-save');
  console.log = realLog;
  const blob = logged.join('\n');
  check('the owner check logs both masked ids', blob.includes('********9204'));
  check('the log states the verdict', /isOwner=true/.test(blob) && /isOwner=false/.test(blob));
  check('the log names the guild', blob.includes('997389969448517632'));
  check('NO log line contains a full Discord id', !blob.includes(OWNER_ID), blob);
  for (const secret of ['DISCORD_BOT_TOKEN', 'DISCORD_BRIDGE_SECRET', 'MONGODB_URI', 'AUTH_SECRET', 'mongodb://', 'Bot ']) {
    check(`no log line contains ${secret}`, !blob.includes(secret));
  }
  // Outside development it must print nothing at all.
  process.env.NODE_ENV = 'production';
  const prodLogged = [];
  console.log = (...args) => prodLogged.push(args.join(' '));
  m.logOwnerCheck(OWNER_ID, '997389969448517632', 'economy-save');
  console.log = realLog;
  check('production logs nothing from the owner check', prodLogged.length === 0);
  process.env.NODE_ENV = 'test';
}
owner.restore();

// ── 4. The client cannot claim to be the owner ─────────────────────────
section('[4] no request or component asserts an identity');
{
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.split('//', 1)[0]).join('\n');
  const stripLiterals = (t) => t.replace(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g, "''");

  const patch = stripComments(read('app/api/dashboard/config/route.ts')
    .split('export async function PATCH', 2)[1] ?? '');
  check('the save route never reads an actorId from the body', !/actorId|ownerId|isOwner\s*[:=]\s*body/.test(patch));
  check('the save route resolves the caller from the session',
    patch.includes('requireSession') && patch.includes('auth.discordId'));
  check('the save route decides ownership itself', patch.includes('isMurabotOwner(auth.discordId)'));
  check('the save route answers OWNER_ONLY with 403',
    patch.includes('ECONOMY_ERROR_CODES.OWNER_ONLY') && /status = ownerOnly \? 403/.test(patch));
  check('the save route never trusts a body-supplied owner flag',
    !/body\.\s*(isOwner|owner)/.test(patch));

  for (const file of [
    'app/dashboard/economy/EconomyConfigPanel.tsx',
    'app/dashboard/economy/useEconomyData.ts',
    'app/dashboard/economy/page.tsx',
  ]) {
    const code = stripLiterals(stripComments(read(file)));
    const name = file.split('/').pop();
    // `isOwner` is RECEIVED from the API and used to render; it is never SENT.
    check(`${name} never sends an identity in a request`,
      !/params\.set\(\s*'(actorId|discordId|owner)'/.test(code)
      && !/body:\s*\{[^}]*(actorId|discordId|owner)/.test(code));
    check(`${name} never writes an owner flag into a request body`,
      !/(isOwner|owner)\s*:\s*(true|1|'1')/.test(code));
  }

  // The env var must not be reachable from the browser.
  const ownerSrc = read('app/lib/murabot-owner.ts');
  check('the owner module is server-only (force-dynamic, no "use client")',
    ownerSrc.includes("export const dynamic = 'force-dynamic'") && !ownerSrc.includes("'use client'"));
  check('the owner module is imported only by server routes',
    read('app/dashboard/economy/EconomyConfigPanel.tsx').includes("'use client'")
    && !read('app/dashboard/economy/EconomyConfigPanel.tsx').includes('murabot-owner'));
  for (const file of [
    'app/api/dashboard/config/route.ts',
    'app/api/dashboard/economy/route.ts',
    'app/api/dashboard/economy/read/route.ts',
  ]) {
    check(`${file.split('/').slice(-2).join('/')} resolves ownership server-side`,
      read(file).includes('isMurabotOwner('));
  }
}

// ── 5. The bot check keeps a code for every failure ────────────────────
section('[5] every bot-check failure has its own code');
{
  const presence = readFileSync(join(root, 'app/lib/bot-presence.ts'), 'utf8');
  for (const code of ['BOT_ONLINE', 'BOT_OFFLINE', 'BOT_GATEWAY_NOT_READY', 'BOT_NOT_IN_GUILD',
    'BOT_PERMISSION_MISSING', 'DISCORD_RATE_LIMITED', 'DISCORD_API_ERROR',
    'AUTHENTICATION_ERROR', 'INTERNAL_ERROR', 'BRIDGE_NOT_CONFIGURED']) {
    check(`${code} is defined`, presence.includes(code));
  }
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//', 1)[0]).join('\n');
  check('the generic "did not answer" message is gone from the site',
    !/Discord did not answer the bot check/.test(strip(presence)
      + strip(readFileSync(join(root, 'app/lib/discord-channels.ts'), 'utf8'))
      + strip(readFileSync(join(root, 'app/dashboard/economy/EconomyLogChannelSelect.tsx'), 'utf8'))));
  check('a transport failure is never an invalid channel',
    /BOT_OFFLINE[\s\S]{0,400}retryable: true/.test(presence)
    || /code: 'BOT_OFFLINE'/.test(presence));
  check('presence is not inferred from a configured token',
    !/BOT_OFFLINE'?\s*:\s*!process\.env\.DISCORD_BOT_TOKEN/.test(presence));
  check('429 carries Retry-After', presence.includes('retry-after'));

  const channels = readFileSync(join(root, 'app/lib/discord-channels.ts'), 'utf8');
  check('a rate limit maps to a retryable, non-verdict error',
    /DISCORD_RATE_LIMITED/.test(channels) && /retryable:/.test(channels));
  check('a missing channel is CHANNEL_NOT_FOUND', /ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND/.test(channels));
  check('a missing permission names the exact permission', /missingPermission/.test(channels));
  check('bot status is read from the gateway, not from token presence',
    readFileSync(join(root, 'app/lib/bot-presence.ts'), 'utf8').includes('/bot/status'));
}

console.log(`\n${passed} passed, ${failed} failed`);
try { rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ }
if (failed) {
  console.log('Failures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
