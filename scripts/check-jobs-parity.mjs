#!/usr/bin/env node
// CI guard: the Discord bot catalog (discord-bot/bot/jobs.py JOBS) must match
// the authoritative site table (app/lib/jobs-table.json) exactly —
// shifts/day, cooldowns, unlocks, salaries, work items and games.
// Run: node scripts/check-jobs-parity.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const table = JSON.parse(readFileSync(join(root, 'app/lib/jobs-table.json'), 'utf8'));
const py = readFileSync(join(root, 'discord-bot/bot/jobs.py'), 'utf8');

const FIELDS = ['shiftsPerDay', 'cooldownMin', 'unlock', 'salary', 'workItem', 'game'];
const PY_KEY = { shiftsPerDay: 'shiftsPerDay', cooldownMin: 'cooldownMin', unlock: 'unlock', salary: 'salary', workItem: 'workItem', game: 'game' };

function pyBlock(id) {
  const m = py.match(new RegExp(`"${id}":\\s*\\{([^}]+)\\}`, 's'));
  return m ? m[1] : null;
}

function pyValue(block, key) {
  const m = block.match(new RegExp(`"${key}":\\s*("[^"]*"|\\d+)`));
  if (!m) return undefined;
  return m[1].startsWith('"') ? m[1].slice(1, -1) : Number(m[1]);
}

let failures = [];
const siteIds = new Set(table.jobs.map((j) => j.id));

// Banned jobs must appear in NEITHER catalog.
for (const banned of ['cosplayer', 'troll', 'karen', 'dictator', 'dankmemer', 'internet']) {
  if (siteIds.has(banned)) failures.push(`banned job present in site table: ${banned}`);
  if (py.includes(`"${banned}"`)) failures.push(`banned job present in bot catalog: ${banned}`);
}

for (const job of table.jobs) {
  const block = pyBlock(job.id);
  if (!block) {
    failures.push(`missing in bot catalog: ${job.id}`);
    continue;
  }
  for (const f of FIELDS) {
    const want = job[f];
    const got = pyValue(block, PY_KEY[f]);
    if (got !== want) failures.push(`${job.id}.${f}: site=${JSON.stringify(want)} bot=${JSON.stringify(got)}`);
  }
}

// Bot must not carry extra jobs the table doesn't define.
for (const m of py.matchAll(/"([a-z0-9]+)":\s*\{\s*"id":/g)) {
  if (!siteIds.has(m[1])) failures.push(`extra job in bot catalog: ${m[1]}`);
}

console.log(`checked ${table.jobs.length} jobs: ${failures.length} mismatches`);
for (const f of failures) console.log(`  MISMATCH ${f}`);
process.exit(failures.length ? 1 : 0);
