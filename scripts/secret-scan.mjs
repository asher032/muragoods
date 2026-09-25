#!/usr/bin/env node
/**
 * Secret scanner — blocks credentials from reaching the repository.
 *
 * The failure this prevents: production values were pasted into a chat, a file
 * or a commit while a deadline was being chased, and once they are in Git
 * history they must be rotated. Scanning is cheap; rotation is not.
 *
 * Scans only tracked (or staged) files, never prints a full match, and is
 * deliberately pattern-based so it needs no network and no dependencies:
 *
 *   node scripts/secret-scan.mjs            # every tracked file (CI)
 *   node scripts/secret-scan.mjs --staged   # files staged for commit (hook)
 *   node scripts/secret-scan.mjs --all      # also scan untracked files
 *
 * Exit code 1 when a real credential shape is found.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const MODE = args.has('--staged') ? 'staged' : args.has('--all') ? 'all' : 'tracked';

/**
 * High-signal credential shapes. Anything generic (a bare "secret" word, a
 * short password) is handled by the assignment rule below instead, so this
 * list stays precise enough to run on every commit.
 */
const RULES = [
  { id: 'discord-bot-token', re: /\b[MNO][A-Za-z\d_-]{23,}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}\b/ },
  { id: 'mongodb-uri-with-credentials', re: /mongodb(\+srv)?:\/\/[^\s:@/]+:[^\s:@/]{6,}@/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { id: 'openai-style-key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'aws-access-key-id', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'stripe-live-key', re: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
  { id: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'credentials-in-url', re: /\bhttps?:\/\/[A-Za-z0-9._%-]{3,}:[^\s:@/'"]{6,}@/ },
  { id: 'youtube-cookie-jar-line', re: /^\.youtube\.com\tTRUE\t/m },
  {
    id: 'assigned-literal-secret',
    // KEY = "long opaque value" in any language, including JSON/YAML/.env.
    re: /(SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CLIENT_SECRET|BRIDGE_SECRET|COOKIES?)\s*[:=]\s*["']([A-Za-z0-9_\-./+=]{24,})["']/i,
  },
];

/**
 * Values that look like secrets but are documented placeholders, CI-only
 * throwaways, or already-redacted examples. Kept explicit so a genuine leak
 * cannot hide behind a broad wildcard.
 */
const ALLOWED = [
  /ci-only/i,
  /not-a-real-secret/i,
  /placeholder/i,
  /example/i,
  /your[-_]/i,
  /<[^>]*>/, // <secret>, <REDACTED>, <hook-url>
  /redacted/i,
  /change[-_]?me/i,
  /^\*+$/,
  /^x+$/i,
  /process\.env/i,
  /os\.environ/i,
  /import\.meta\.env/i,
];

const SKIP_PATH = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|mp[34]|webm|zip|pdf)$/i,
  /(^|\/)(node_modules|\.next|dist|build|\.git)\//,
];

function mask(value) {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return `${trimmed[0] ?? ''}***`;
  return `${trimmed.slice(0, 4)}***(${trimmed.length} chars)`;
}

function listFiles() {
  const git = (gitArgs) => execFileSync('git', gitArgs, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (MODE === 'staged') return git(['diff', '--cached', '--name-only', '--diff-filter=ACM']);
  if (MODE === 'all') return git(['ls-files', '--cached', '--others', '--exclude-standard']);
  return git(['ls-files']);
}

function isAllowed(match, line) {
  return ALLOWED.some((pattern) => pattern.test(match) || pattern.test(line));
}

const findings = [];
const files = listFiles();

for (const file of files) {
  if (SKIP_PATH.some((pattern) => pattern.test(file))) continue;
  let text;
  try {
    if (statSync(file).size > 4 * 1024 * 1024) continue;
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // binary, unreadable, or staged-but-deleted
  }
  if (text.includes('\u0000')) continue; // binary
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      const match = line.match(rule.re);
      if (!match) continue;
      const value = match[2] ?? match[1] ?? match[0];
      if (isAllowed(value, line)) continue;
      findings.push({ file, line: index + 1, rule: rule.id, preview: mask(value) });
    }
  });
}

if (findings.length === 0) {
  console.log(`secret scan: clean (${files.length} ${MODE} file(s) checked)`);
  process.exit(0);
}

console.error(`secret scan: ${findings.length} potential credential(s) found\n`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}  ${finding.rule}  ${finding.preview}`);
}
console.error(
  '\nRemove the value from the file, keep it in the provider/host environment,\n' +
  'and rotate it if it was ever committed or pasted anywhere.',
);
process.exit(1);
