#!/usr/bin/env node
/**
 * Control test for the secret scanner.
 *
 * A scanner that finds nothing is indistinguishable from a scanner that is
 * broken. This builds a throwaway Git repository, plants one known credential
 * at a time, and asserts `secret-scan.mjs` exits 1 — and, just as importantly,
 * that it exits 0 on the shapes that must NOT trip it, because a scanner that
 * cries wolf on every `process.env` read gets disabled within a week.
 *
 * The two new guarantees this pins down:
 *
 *   1. `mongodb-uri-assigned-literal` — a connection string bound to a
 *      variable, with or without `user:password@`. The pre-existing rule only
 *      fired on the credential shape, so a local URI or a half-redacted paste
 *      passed clean.
 *   2. Tracked env files are refused by FILENAME, independent of contents,
 *      while `.env.example` / `.env.sample` stay committable.
 *
 * Hermetic: a temp directory, no network, no credentials of its own.
 *
 *   node scripts/test-secret-scan.mjs
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCANNER = resolve(dirname(fileURLToPath(import.meta.url)), 'secret-scan.mjs');

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail ? `  [${detail}]` : ''}`);
    failures += 1;
  }
}

/**
 * Build a throwaway repo containing `files` and run the scanner inside it.
 * Returns { code, stdout, stderr }.
 */
function scan(files) {
  const dir = mkdtempSync(join(tmpdir(), 'secret-scan-test-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    for (const [name, content] of Object.entries(files)) {
      const target = join(dir, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    // `--all` so untracked fixtures are scanned too: `git add` is not the
    // behaviour under test, the pattern matching is.
    const result = spawnSync(process.execPath, [SCANNER, '--all'], {
      cwd: dir,
      encoding: 'utf8',
    });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A shape that trips NO rule: process.env reads, comments, docs.
const CLEAN = {
  'app/lib/db.ts': `
    const uri = process.env.MURABOT_MONGODB_URI ?? '';
    const legacy = process.env.MONGODB_URI;
    export function resolve() { return uri || legacy; }
  `,
  'README.md': 'Set MONGODB_URI in your deployment environment. Never commit it.',
  'bot/config.py': 'MONGO_URI = MURABOT_MONGODB_URI or _get("MONGODB_URI")\n',
};

console.log('secret-scan control: shapes that must PASS');
{
  const { code, out } = scan(CLEAN);
  check('a clean repository is clean', code === 0, out.trim().split('\n')[0]);
}

console.log('\nsecret-scan control: credential shapes that must FAIL');
const POSITIVES = [
  [
    'mongodb SRV URI with user:password',
    { 'a.ts': 'const u = "mongodb+srv://someone:hunter2222@cluster0.abcde.mongodb.net/?retryWrites=true";' },
    'mongodb-uri-with-credentials',
  ],
  [
    'MURAGOODS_MONGODB_URI assigned a literal (no credentials in it)',
    { 'a.ts': 'export const MURAGOODS_MONGODB_URI = "mongodb+srv://cluster0.abcde.mongodb.net";' },
    'mongodb-uri-assigned-literal',
  ],
  [
    'MURABOT_MONGODB_URI assigned a local literal',
    { 'b.py': 'MURABOT_MONGODB_URI = "mongodb://localhost:27017/murastream_bot"' },
    'mongodb-uri-assigned-literal',
  ],
  [
    'MONGODB_URI assigned a literal',
    { 'c.js': 'const MONGODB_URI = `mongodb://user:pw@localhost:27017/x`;' },
    'mongodb-uri-assigned-literal',
  ],
  [
    'MONGO_URI assigned a literal',
    { 'd.ts': 'const MONGO_URI: string = "mongodb+srv://host/db";' },
    'mongodb-uri-assigned-literal',
  ],
  [
    'a Discord bot token',
    { 'e.py': 'TOKEN = "MTIzNDU2Nzg5MDEyMzQ1Njc4.GaBcDe.FfGgHhIiJjKkLlMmNnOoPpQqRrSs"' },
    'discord-bot-token',
  ],
  [
    'a tracked .env holding nothing sensitive',
    { '.env': 'MURABOT_MONGO_DB=murastream_bot\n' },
    'environment file is tracked',
  ],
  [
    'a tracked nested .env.local',
    { 'discord-bot/.env.local': 'DEBUG=1\n' },
    'environment file is tracked',
  ],
  [
    'a tracked .id_rsa',
    { 'deploy/.id_rsa': 'not even a key — the FILENAME is the finding\n' },
    'credential file is tracked',
  ],
  [
    'a credential-shaped URI inside a comment',
    // A commented-out line is still a committed secret. The one safe way to
    // document the shape is a redaction, which is its own fixture below.
    { 'notes.md': '# was: mongodb+srv://someone:hunter2222@cluster0.abcde.mongodb.net\n' },
    'mongodb-uri-with-credentials',
  ],
];

for (const [label, files, rule] of POSITIVES) {
  const { code, out } = scan({ ...CLEAN, ...files });
  check(`${label} → exit 1`, code === 1, `exit ${code}`);
  check(`${label} → reports "${rule}"`, out.includes(rule), out.trim().split('\n')[0]);
}

console.log('\nsecret-scan control: false positives that must NOT fire');
const NEGATIVES = [
  ['a .env.example naming variables', { '.env.example': 'MURAGOODS_MONGODB_URI=\nMURABOT_MONGODB_URI=\n' }],
  ['a .env.sample', { 'app/.env.sample': 'MONGODB_URI=\n' }],
  ['a source file called env.ts', { 'src/env.ts': 'export const region = "eu";' }],
  ['a file called environment.ts', { 'lib/environment.ts': 'export const nodeEnv = "test";' }],
  ['a validation regex naming the scheme', { 'f.ts': 'const RE = /^mongodb(?:\\+srv)?:\\/\\//;' }],
  ['a .env.example documenting a REDACTED connection shape', { '.env.example': '# format: mongodb+srv://<user>:<password>@<host>/<db>\nMURAGOODS_MONGODB_URI=\n' }],
  ['a doc showing the shape with angle-bracket placeholders', { 'docs/db.md': 'Set MONGODB_URI to mongodb+srv://user:password@cluster0.example.invalid/db\n' }],
];

for (const [label, files] of NEGATIVES) {
  const { code, out } = scan({ ...CLEAN, ...files });
  check(label, code === 0, out.trim().split('\n')[0]);
}

console.log();
if (failures) {
  console.log(`${failures} failure(s) of ${checks} checks`);
  process.exit(1);
}
console.log(`secret-scan control: all ${checks} checks passed`);
