#!/usr/bin/env node
// Level card theme parity: the dashboard and Murabot must agree.
//
//   node scripts/check-level-card-parity.mjs
//
// Why this exists. The dashboard's Leveling picker and the bot's card renderer
// each carried their OWN list of theme ids, and nothing compared them. That is
// how "I picked a background and the Discord card did not change" could be
// true while both halves looked correct in isolation: the site offered ids the
// renderer's dictionary did not contain, and the renderer silently substituted
// its default for anything it did not recognise.
//
// The renderer MUST keep resolving unknown ids to the default — a missing
// background must never crash a card — so the drift could not announce itself.
// Only a build-time comparison catches it.
//
// This asserts four things:
//   1. the site list and the bot list have identical ids
//   2. names and emoji match, so the picker labels what the bot calls it
//   3. the default id exists in both
//   4. every referenced asset file exists on BOTH sides
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (msg) => { failed++; console.log(`  FAIL  ${msg}`); };
const ok = (msg) => console.log(`  ok    ${msg}`);

// ── The site side ────────────────────────────────────────────────────────
const siteSrc = readFileSync(join(root, 'app/lib/level-card-themes.ts'), 'utf8');
const siteDefault = siteSrc.match(/LEVEL_CARD_DEFAULT_THEME\s*=\s*'([^']+)'/)?.[1];
const siteThemes = new Map();
const rowRe = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*emoji:\s*'([^']+)',\s*file:\s*'([^']+)'\s*\}/g;
for (const m of siteSrc.matchAll(rowRe)) {
  siteThemes.set(m[1], { name: m[2], emoji: m[3], file: m[4] });
}
if (!siteDefault) fail('could not read LEVEL_CARD_DEFAULT_THEME from the site');
if (siteThemes.size === 0) fail('could not read any themes from app/lib/level-card-themes.ts');
else ok(`site declares ${siteThemes.size} themes`);

// ── The bot side ─────────────────────────────────────────────────────────
const botSrc = readFileSync(join(root, 'discord-bot/bot/leveling_sys.py'), 'utf8');
const botDefault = botSrc.match(/SERVER_CARD_DEFAULT\s*=\s*"([^"]+)"/)?.[1];
const botBlock = botSrc.match(/SERVER_CARD_BACKGROUNDS:\s*dict\s*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const botThemes = new Map();
const botRowRe = /"([^"]+)"\s*:\s*\{\s*"name"\s*:\s*"([^"]*)"\s*,\s*"emoji"\s*:\s*"([^"]*)"\s*,\s*"file"\s*:\s*"([^"]+)"\s*,?\s*\}/g;
for (const m of botBlock.matchAll(botRowRe)) {
  botThemes.set(m[1], { name: m[2], emoji: m[3], file: m[4] });
}
if (!botDefault) fail('could not read SERVER_CARD_DEFAULT from the bot');
if (botThemes.size === 0) fail('could not read any themes from leveling_sys.py');
else ok(`bot declares ${botThemes.size} themes`);

// ── 1. Identical id sets ─────────────────────────────────────────────────
const siteIds = [...siteThemes.keys()].sort();
const botIds = [...botThemes.keys()].sort();
const onlySite = siteIds.filter((id) => !botThemes.has(id));
const onlyBot = botIds.filter((id) => !siteThemes.has(id));
if (onlySite.length === 0 && onlyBot.length === 0) ok('both sides declare exactly the same theme ids');
else {
  if (onlySite.length) fail(`the dashboard offers ids the BOT cannot render: ${onlySite.join(', ')}`);
  if (onlyBot.length) fail(`the bot can render ids the dashboard does not offer: ${onlyBot.join(', ')}`);
}

// ── 2. Names and emoji agree ─────────────────────────────────────────────
for (const [id, site] of siteThemes) {
  const bot = botThemes.get(id);
  if (!bot) continue;
  if (site.name !== bot.name) fail(`${id}: name differs — site "${site.name}" vs bot "${bot.name}"`);
  if (site.emoji !== bot.emoji) fail(`${id}: emoji differs — site "${site.emoji}" vs bot "${bot.emoji}"`);
}
if (!failed) ok('every shared theme has the same name and emoji on both sides');

// ── 3. The default exists on both sides ──────────────────────────────────
if (siteDefault && siteThemes.has(siteDefault)) ok(`site default "${siteDefault}" is a real theme`);
else fail(`site default "${siteDefault}" is not in the site's theme list`);
if (botDefault && botThemes.has(botDefault)) ok(`bot default "${botDefault}" is a real theme`);
else fail(`bot default "${botDefault}" is not in the bot's theme list`);
if (siteDefault && botDefault && siteDefault !== botDefault) {
  fail(`the two sides disagree on the default theme: site "${siteDefault}" vs bot "${botDefault}"`);
}

// ── 4. Assets exist on BOTH sides ────────────────────────────────────────
// A theme whose file is missing renders the dark fallback on one side, which
// looks like "the setting did nothing" in the place the operator is watching.
for (const [id, site] of siteThemes) {
  if (!existsSync(join(root, 'public', site.file.replace(/^\//, '')))) {
    fail(`${id}: the site's asset ${site.file} does not exist under public/`);
  }
  const bot = botThemes.get(id);
  if (bot && !existsSync(join(root, 'discord-bot/bot/assets/level_backgrounds', bot.file))) {
    fail(`${id}: the bot's asset ${bot.file} does not exist under discord-bot/bot/assets/level_backgrounds/`);
  }
}
if (!failed) ok('every referenced asset exists on both the site and the bot');

// ── 5. One list only ─────────────────────────────────────────────────────
// A second, divergent theme list is the exact failure this file guards.
const themeFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) themeFiles.push(p);
  }
};
walk(join(root, 'app'));
const inlineLists = themeFiles.filter((f) =>
  /SERVER_CARD_BACKGROUNDS:\s*(ServerCardBackground)?\[\]?\s*=|SERVER_CARD_BACKGROUNDS\s*=\s*\[/.test(readFileSync(f, 'utf8'))
  && !f.endsWith(join('lib', 'level-card-themes.ts')));
if (inlineLists.length === 0) ok('no second copy of the theme list exists in app/');
else fail(`a second theme list lives in: ${inlineLists.map((f) => f.replace(root + '/', '')).join(', ')}`);

console.log(failed === 0 ? '\nlevel card parity OK' : `\n${failed} parity problem(s)`);
if (failed) process.exit(1);
