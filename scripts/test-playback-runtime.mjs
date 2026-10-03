// Runtime behaviour tests for the playback resolver.
//
//   node scripts/test-playback-runtime.mjs
//
// The static suite proves the SHAPE of the contract. This proves the
// BEHAVIOUR, by driving the real resolver through a fake fetch and asserting
// what it actually returns — including the case that matters most: that a
// series with no authorized source says so honestly rather than serving a
// movie source or a neighbour episode.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, error: e }); console.log(`  ✗ ${name}\n      ${e.message}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

// The registry is a module-level constant, so the tests exercise it through a
// temporary manifest rather than mutating shared state. The harness is written
// INTO the real source tree so its relative imports of the resolver resolve.
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(repoRoot, '.playback-harness-'));
const harness = join(dir, 'harness.ts');

writeFileSync(harness, `
import { resolvePlayback, firstPartyInventory } from '../app/lib/murastream/playback/resolver';
import { FIRST_PARTY_MANIFEST } from '../app/lib/murastream/playback/authorized-sources';

// Fake fetch: 200 video/* for /media assets, 404 for anything else.
(globalThis as any).fetch = async (url: string) => {
  const u = String(url);
  if (u.includes('/media/')) {
    return new Response(new Uint8Array(16), {
      status: 206,
      headers: { 'content-type': 'video/mp4' },
    });
  }
  return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
};

const out: Record<string, unknown> = {};

// These are SYNTHETIC fixtures, not claims about real titles. The rights gate
// refuses anything that does not declare its own licence, so a fixture that is
// meant to be playable has to declare one. MURAGOODS_OWNED is the honest label
// for a file this repo commits and serves itself.
const OWNED = {
  rightsStatus: 'MURAGOODS_OWNED',
  licenseType: 'Muragoods-owned test fixture',
  licenseUrl: null,
  rightsSourceUrl: 'https://example.invalid/test-fixture-rights',
  attributionRequired: false,
  attributionText: null,
  verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  verifiedBy: 'test fixture',
};

const ALICE = { slug: 'authorized-film', tmdbId: 101, mediaType: 'movie', title: 'Authorized Film', file: 'a.mp4', ...OWNED };
const SERIES = { slug: 'authorized-series', tmdbId: 202, mediaType: 'tv', title: 'Authorized Series', file: 's1e1.mp4', season: 1, episode: 1, ...OWNED };
const SERIES_E2 = { slug: 'authorized-series', tmdbId: 202, mediaType: 'tv', title: 'Authorized Series', file: 's1e2.mp4', season: 1, episode: 2, ...OWNED };
const SERIES_S2 = { slug: 'authorized-series', tmdbId: 202, mediaType: 'tv', title: 'Authorized Series', file: 's2e1.mp4', season: 2, episode: 1, ...OWNED };
const SPECIALS_S1E1 = { slug: 'authorized-specials', tmdbId: 303, mediaType: 'tv', title: 'Authorized Specials', file: 'specials-s1e1.mp4', season: 0, episode: 1, ...OWNED };
(FIRST_PARTY_MANIFEST as any[]).push(ALICE, SERIES, SERIES_E2, SERIES_S2, SPECIALS_S1E1);

async function run() {
  out.movie = await resolvePlayback({ mediaType: 'movie', tmdbId: 101 });
  out.movieUnknown = await resolvePlayback({ mediaType: 'movie', tmdbId: 999 });
  out.ep1 = await resolvePlayback({ mediaType: 'tv', tmdbId: 202, season: 1, episode: 1 });
  out.ep2 = await resolvePlayback({ mediaType: 'tv', tmdbId: 202, season: 1, episode: 2 });
  out.s2e1 = await resolvePlayback({ mediaType: 'tv', tmdbId: 202, season: 2, episode: 1 });
  out.epMissing = await resolvePlayback({ mediaType: 'tv', tmdbId: 202, season: 1, episode: 99 });
  out.seriesUnknown = await resolvePlayback({ mediaType: 'tv', tmdbId: 888, season: 1, episode: 1 });
  out.badId = await resolvePlayback({ mediaType: 'movie', tmdbId: 0 });
  out.specialsS1E1 = await resolvePlayback({ mediaType: 'tv', tmdbId: 303, season: 0, episode: 1 });
  out.specialsMissing = await resolvePlayback({ mediaType: 'tv', tmdbId: 303, season: 0, episode: 9 });
  out.inventory = firstPartyInventory();
  console.log(JSON.stringify(out));
}
run();
`);

function findEmitted(root) {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      const hit = findEmitted(full);
      if (hit) return hit;
    } else if (entry === 'harness.js') {
      return full;
    }
  }
  return null;
}

function drive() {
  // tsc emits runnable JS so the harness executes the REAL modules.
  // A tsconfig is more reliable than CLI flags here: it compiles the harness
  // AND the modules it imports, so the emitted tree actually contains it.
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'CommonJS',
      moduleResolution: 'node',
      outDir: 'out',
      skipLibCheck: true,
      esModuleInterop: true,
      strict: false,
      types: ['node'],
      // The harness compiles the REAL app modules, so it needs the app's
      // own '@/' alias (which maps to the repo root in this project).
      baseUrl: repoRoot,
      paths: { '@/*': ['./*'] },
    },
    files: ['harness.ts'],
  }));
  execFileSync('npx', ['tsc', '-p', join(dir, 'tsconfig.json')], {
    cwd: repoRoot, stdio: 'pipe',
  });

  // tsc preserves the directory structure relative to the common root, so the
  // emitted harness sits under out/<path-of-harness>. Find it rather than
  // assuming a layout.
  const outDir = join(dir, 'out');
  const js = findEmitted(outDir);
  if (!js) throw new Error('harness did not emit');
  return JSON.parse(execFileSync('node', [js], { cwd: repoRoot, encoding: 'utf8' }));
}

let r;
try {
  r = drive();
} catch (e) {
  console.error('harness failed to build/run:', String(e.stderr || e.message).slice(0, 800));
  process.exitCode = 1;
  r = null;
} finally {
  // Always clean up, including on failure: a leftover harness in the repo
  // root is an untracked directory that can be committed by accident.
  rmSync(dir, { recursive: true, force: true });
}
if (!r) process.exit(1);

// ═══════════════════════════════════════════════════════════════════════════
section('Movie resolution');

check('a registered, validated movie is PLAYABLE', () => {
  assert.equal(r.movie.status, 'PLAYABLE');
  assert.equal(r.movie.reason, null);
  assert.equal(r.movie.sources.length, 1);
  assert.equal(r.movie.sources[0].kind, 'FULL_PLAYBACK');
  assert.equal(r.movie.sources[0].authorization, 'first_party');
});

check('a movie result never carries season or episode', () => {
  assert.equal(r.movie.season, null);
  assert.equal(r.movie.episode, null);
});

check('a movie with no authorized source is UNAVAILABLE, not fake-available', () => {
  // Spec section 12: an address with no registered source is UNAVAILABLE
  // with an exact reason — never a resolver fault, never a fabricated URL.
  assert.equal(r.movieUnknown.status, 'UNAVAILABLE');
  assert.equal(r.movieUnknown.sources.length, 0);
  assert.ok(r.movieUnknown.reason, 'an honest reason is required');
});

// ═══════════════════════════════════════════════════════════════════════════
section('TV / series resolution');

check('S01E01 resolves to its own source', () => {
  assert.equal(r.ep1.status, 'PLAYABLE');
  assert.equal(r.ep1.sources[0].url, '/media/s1e1.mp4');
});

check('S01E02 resolves to a DIFFERENT source', () => {
  assert.equal(r.ep2.status, 'PLAYABLE');
  assert.equal(r.ep2.sources[0].url, '/media/s1e2.mp4');
});

check('S01E01 and S01E02 do not share a cached answer', () => {
  assert.notEqual(r.ep1.sources[0].url, r.ep2.sources[0].url);
  assert.notEqual(r.ep1.season + ':' + r.ep1.episode, r.ep2.season + ':' + r.ep2.episode);
});

check('a different season resolves independently', () => {
  assert.equal(r.s2e1.status, 'PLAYABLE');
  assert.equal(r.s2e1.season, 2);
  assert.equal(r.s2e1.sources[0].url, '/media/s2e1.mp4');
});

check('a missing episode is refused, never served from a neighbour', () => {
  assert.notEqual(r.epMissing.status, 'PLAYABLE');
  assert.equal(r.epMissing.sources.length, 0);
  assert.equal(r.epMissing.reason, 'EPISODE_NOT_FOUND',
    'the reason must say the episode is missing, not the series');
});

check('an unknown series is distinguished from a missing episode', () => {
  // Spec section 12: an address with no registered source is UNAVAILABLE
  // with an exact reason — never a resolver fault, never a fabricated URL.
  assert.equal(r.seriesUnknown.status, 'UNAVAILABLE');
  assert.notEqual(r.seriesUnknown.reason, 'EPISODE_NOT_FOUND');
});

check('an episode never falls back to a movie source', () => {
  const url = r.ep2.sources[0].url;
  assert.ok(!url.includes('authorized-film'), 'a TV result must not carry the movie asset');
  assert.equal(r.ep2.sources[0].mediaType, 'tv');
});

check('the episode result reports the season and episode asked for', () => {
  assert.equal(r.ep2.season, 1);
  assert.equal(r.ep2.episode, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
section('Invalid requests');

check('a non-positive tmdbId is rejected', () => {
  assert.equal(r.badId.status, 'UNAVAILABLE');
  assert.equal(r.badId.reason, 'MEDIA_ID_INVALID');
  assert.equal(r.badId.sources.length, 0);
});

// Season 0 is TMDB's specials bucket. It used to be rejected outright and then
// silently coerced to 1 in the resolver. It is now a real, separately
// addressable season — but it must NEVER borrow season 1's sources, which is
// the bug that would show a viewer the wrong episode.
check('season 0 (specials) is addressable, not coerced to season 1', () => {
  assert.equal(r.specialsS1E1.status, 'PLAYABLE',
    'specials must resolve through their own manifest entry');
  assert.equal(r.specialsS1E1.season, 0);
  assert.ok(r.specialsS1E1.sources[0].url.includes('specials-s1e1.mp4'),
    'a specials episode must not be served season 1 media');
});

check('a missing episode is still refused rather than falling back to a special', () => {
  assert.notEqual(r.specialsMissing.status, 'PLAYABLE');
  assert.equal(r.specialsMissing.sources.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
section('Ad-free guarantee');

check('every PLAYABLE source is authorized', () => {
  const all = [r.movie, r.ep1, r.ep2, r.s2e1];
  for (const res of all) {
    for (const s of res.sources) {
      assert.ok(s.authorization === 'first_party' || s.authorization === 'licensed',
        `unauthorized source returned: ${s.authorization}`);
    }
  }
});

check('every PLAYABLE source is same-origin', () => {
  const all = [r.movie, r.ep1, r.ep2, r.s2e1];
  for (const res of all) {
    for (const s of res.sources) {
      assert.ok(s.url.startsWith('/') && !s.url.startsWith('//'),
        `a first_party source must be same-origin, got ${s.url}`);
    }
  }
});

check('no returned source points at a third-party host', () => {
  const all = [r.movie, r.ep1, r.ep2, r.s2e1];
  for (const res of all) {
    for (const s of res.sources) {
      assert.ok(!/^https?:\/\/(?!localhost)/.test(s.url),
        `off-origin playback URL: ${s.url}`);
    }
  }
});

check('no full-playback source is ever a trailer', () => {
  for (const res of [r.movie, r.ep1, r.ep2]) {
    for (const s of res.sources) {
      assert.equal(s.kind, 'FULL_PLAYBACK');
    }
  }
});

console.log(`\n${'─'.repeat(60)}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length} checks\n`);
  for (const f of failures) console.log(`  • ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log(`All ${passed} resolver runtime checks passed.`);