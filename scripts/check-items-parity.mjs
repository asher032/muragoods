#!/usr/bin/env node
// CI guard for the item system.
//
// The Discord bot catalog (discord-bot/bot/items.py) is the ONLY definition of
// items, rarities, categories and loot tables. The site reads a generated
// snapshot at app/lib/items-table.json. This guard fails when:
//
//   1. the snapshot is stale (the bot changed, the site was not re-exported),
//   2. a rarity outside the five-tier system appears (esp. "legendary"),
//   3. the catalog falls below the required per-rarity minimums,
//   4. an item id is not a stable machine-readable slug,
//   5. a Godly item is anything other than a collectible (no effect, no sell),
//   6. an item carries another bot's identity.
//
// Run: node scripts/check-items-parity.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = join(root, 'app/lib/items-table.json');

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'godly'];
const MINIMUMS = { common: 35, uncommon: 25, rare: 20, epic: 15, godly: 5 };

// Identity that must never appear in Murabot's own catalog. The report this
// system answers to explicitly required an original identity.
const BANNED = ['dankmemer', 'dank_memer', 'dank', 'freek', 'hacker'];

let failures = [];

// ── 1. snapshot freshness ──────────────────────────────────────────────
try {
  execFileSync('python3', [join(root, 'discord-bot/scripts/export_items.py'), '--check'], {
    stdio: 'pipe',
    encoding: 'utf8',
  });
} catch (err) {
  failures.push(
    `item snapshot is stale or unbuildable: ${(err.stdout || err.stderr || '').toString().trim()}`
  );
}

if (!existsSync(TABLE)) {
  console.error('FAIL: app/lib/items-table.json is missing.');
  process.exit(1);
}
const table = JSON.parse(readFileSync(TABLE, 'utf8'));

// ── 2. the five-rarity system ──────────────────────────────────────────
if (JSON.stringify(table.rarities) !== JSON.stringify(RARITIES)) {
  failures.push(`rarity list must be exactly ${RARITIES.join(' < ')}, got ${table.rarities}`);
}
for (const item of table.items) {
  if (item.rarity === 'legendary' || item.rarity === 'mythic') {
    failures.push(`item ${item.id} uses a forbidden rarity: ${item.rarity}`);
  }
  if (!RARITIES.includes(item.rarity)) {
    failures.push(`item ${item.id} has unknown rarity: ${item.rarity}`);
  }
  if (item.effectType === 'legendary_bonus') {
    failures.push(`item ${item.id} has a forbidden effect type`);
  }
}

// ── 3. per-rarity minimums ─────────────────────────────────────────────
for (const [rarity, min] of Object.entries(MINIMUMS)) {
  const n = (table.counts && table.counts[rarity]) || 0;
  if (n < min) failures.push(`rarity ${rarity} has ${n} items, minimum is ${min}`);
}
if (table.items.length < 100) {
  failures.push(`catalog has ${table.items.length} items, minimum is 100`);
}

// ── 4. stable machine-readable ids ─────────────────────────────────────
const ID_RE = /^[a-z][a-z0-9_]{1,48}$/;
const seen = new Set();
for (const item of table.items) {
  if (!ID_RE.test(item.id)) failures.push(`item id is not a stable slug: ${item.id}`);
  if (item.id === item.name) failures.push(`item ${item.id} uses its display name as its id`);
  if (seen.has(item.id)) failures.push(`duplicate item id: ${item.id}`);
  seen.add(item.id);
  if (!table.categories.includes(item.category)) {
    failures.push(`item ${item.id} has unknown category: ${item.category}`);
  }
}

// ── 5. Godly is prestigious and collectible, not powerful ──────────────
for (const item of table.items.filter((i) => i.rarity === 'godly')) {
  if (item.effectType) failures.push(`godly item ${item.id} must not grant an effect`);
  if (item.sellPrice > 0) failures.push(`godly item ${item.id} must not be sellable`);
  if (item.tradeable) failures.push(`godly item ${item.id} must not be tradeable`);
}

// ── 6. original identity ───────────────────────────────────────────────
for (const item of table.items) {
  const hay = `${item.id} ${item.name}`.toLowerCase();
  for (const bad of BANNED) {
    if (hay.includes(bad)) failures.push(`item ${item.id} carries banned identity: ${bad}`);
  }
}

// ── report ─────────────────────────────────────────────────────────────
if (failures.length) {
  console.error('ITEM PARITY FAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `item parity OK — ${table.items.length} items, ${table.rarities.length} rarities, ` +
    `counts ${JSON.stringify(table.counts)}, snapshot fresh`
);
