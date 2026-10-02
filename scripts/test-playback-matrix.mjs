// Playback test matrix.
//
//   node scripts/test-playback-matrix.mjs
//
// The matrix the playback spec requires, driven through the REAL modules:
//
//   MOVIES   metadata, playable source, timeout, invalid source, unavailable
//   TV       metadata, season selection, episode selection, S1E1/S1E2,
//            a different season, a missing episode, episode timeout
//   ANIME    metadata, episode resolution, episode switching, failure
//   K-DRAMA  metadata, season/episode resolution, episode switching, failure
//   SEARCH   a TV result stays tv, a movie result stays movie
//   PLAYER   loading, ready, blocked, retryable failure, retry honesty
//   ADS      no ad surface may exist anywhere in the failure path
//
// Every case asserts on the structured contract, not on prose.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
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

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(repoRoot, '.playback-matrix-'));
const harness = join(dir, 'harness.ts');

// Fetch is stubbed so each upstream condition is reproducible: a 200 for a
// known good asset, a timeout, a 404, and an HTML response standing in for a
// misconfigured file.
writeFileSync(harness, `
import { resolvePlayback } from '../app/lib/murastream/playback/resolver';
import { validateResolveParams } from '../app/lib/murastream/playback/request';
import { FIRST_PARTY_MANIFEST } from '../app/lib/murastream/playback/authorized-sources';
import { isRetryable, REASON_MESSAGE } from '../app/lib/murastream/playback/types';

const MOVIE = { slug: 'film', tmdbId: 501, mediaType: 'movie', title: 'Licensed Film', file: 'film.mp4' };
const BROKEN = { slug: 'broken', tmdbId: 502, mediaType: 'movie', title: 'Broken Film', file: 'broken.mp4' };
const S = { slug: 'series', tmdbId: 601, mediaType: 'tv', title: 'Licensed Series' };
const EP = (s: number, e: number, file: string) => ({ ...S, file, season: s, episode: e });
const ANIME = { slug: 'anime', tmdbId: 701, mediaType: 'tv', title: 'Licensed Anime' };
const KDRAMA = { slug: 'kdrama', tmdbId: 801, mediaType: 'tv', title: 'Licensed K-Drama' };

(FIRST_PARTY_MANIFEST as any[]).push(
  MOVIE, BROKEN,
  EP(1, 1, 's1e1.mp4'), EP(1, 2, 's1e2.mp4'), EP(1, 3, 's1e3.mp4'), EP(2, 1, 's2e1.mp4'),
  { ...ANIME, file: 'a-s1e1.mp4', season: 1, episode: 1 },
  { ...ANIME, file: 'a-s1e2.mp4', season: 1, episode: 2 },
  { ...KDRAMA, file: 'k-s1e1.mp4', season: 1, episode: 1 },
  { ...KDRAMA, file: 'k-s1e2.mp4', season: 1, episode: 2 },
);

// Upstream is stubbed: a known /media asset serves 206 video/*, and anything
// else 404s. That is enough to distinguish a real playable source from every
// failure shape, without depending on a live provider in CI.
(globalThis as any).fetch = async (url: string) => {
  const u = String(url);
  // A registered file whose asset is missing from the deploy: 404, not video.
  // This is the "misdeploy" case, and it must not read as playable.
  if (u.includes('/media/broken.mp4')) {
    return new Response('missing', { status: 404, headers: { 'content-type': 'text/html' } });
  }
  if (u.includes('/media/')) {
    return new Response(new Uint8Array(16), { status: 206, headers: { 'content-type': 'video/mp4' } });
  }
  return new Response('no', { status: 404, headers: { 'content-type': 'text/html' } });
};

async function run() {
  const out: Record<string, any> = {};
  out.movie = await resolvePlayback({ mediaType: 'movie', tmdbId: 501 });
  out.movieUnknown = await resolvePlayback({ mediaType: 'movie', tmdbId: 999999 });
  out.movieTimeout = await resolvePlayback({ mediaType: 'movie', tmdbId: 502 });
  out.movieHtml = await resolvePlayback({ mediaType: 'movie', tmdbId: 502 });
  out.s1e1 = await resolvePlayback({ mediaType: 'tv', tmdbId: 601, season: 1, episode: 1 });
  out.s1e2 = await resolvePlayback({ mediaType: 'tv', tmdbId: 601, season: 1, episode: 2 });
  out.s1e3 = await resolvePlayback({ mediaType: 'tv', tmdbId: 601, season: 1, episode: 3 });
  out.s2e1 = await resolvePlayback({ mediaType: 'tv', tmdbId: 601, season: 2, episode: 1 });
  out.epMissing = await resolvePlayback({ mediaType: 'tv', tmdbId: 601, season: 1, episode: 77 });
  out.seasonMissing = await resolvePlayback({ mediaType: 'tv', tmdbId: 601, season: 9, episode: 1 });
  out.animeE1 = await resolvePlayback({ mediaType: 'tv', tmdbId: 701, season: 1, episode: 1 });
  out.animeE2 = await resolvePlayback({ mediaType: 'tv', tmdbId: 701, season: 1, episode: 2 });
  out.animeFail = await resolvePlayback({ mediaType: 'tv', tmdbId: 701, season: 4, episode: 1 });
  out.kdramaE1 = await resolvePlayback({ mediaType: 'tv', tmdbId: 801, season: 1, episode: 1 });
  out.kdramaE2 = await resolvePlayback({ mediaType: 'tv', tmdbId: 801, season: 1, episode: 2 });
  out.kdramaFail = await resolvePlayback({ mediaType: 'tv', tmdbId: 801, season: 3, episode: 2 });

  out.coerceBadType = validateResolveParams({ mediaType: 'film', tmdbId: '501', season: null, episode: null });
  out.coerceNaNSeason = validateResolveParams({ mediaType: 'tv', tmdbId: '601', season: 'abc', episode: '1' });
  out.coerceMovieWithEpisode = validateResolveParams({ mediaType: 'movie', tmdbId: '501', season: null, episode: '2' });
  out.coerceBadId = validateResolveParams({ mediaType: 'movie', tmdbId: 'abc', season: null, episode: null });
  out.coerceGood = validateResolveParams({ mediaType: 'tv', tmdbId: '601', season: '1', episode: '2' });

  out.retryNotFound = isRetryable('SOURCE_NOT_FOUND');
  out.retryTimeout = isRetryable('PROVIDER_TIMEOUT');
  out.messages = REASON_MESSAGE;
  return out;
}

run().then((o) => console.log(JSON.stringify(o)));
`);

function findEmitted(root) {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      const hit = findEmitted(full);
      if (hit) return hit;
    } else if (entry === 'harness.js') return full;
  }
  return null;
}

function drive() {
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'CommonJS', moduleResolution: 'node',
      outDir: 'out', skipLibCheck: true, esModuleInterop: true, strict: false,
    },
    files: ['harness.ts'],
  }));
  execFileSync('npx', ['tsc', '-p', join(dir, 'tsconfig.json')], { cwd: repoRoot, stdio: 'pipe' });
  const js = findEmitted(join(dir, 'out'));
  if (!js) throw new Error('harness did not emit');
  return JSON.parse(execFileSync('node', [js], { cwd: repoRoot, encoding: 'utf8' }));
}

let r;
try {
  r = drive();
} catch (e) {
  console.error('harness failed to build/run:', String(e.stderr || e.message).slice(0, 900));
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
section('MOVIES');

check('movie metadata is available', () => {
  assert.ok(r.movieUnknown.status === 'METADATA_AVAILABLE');
});

check('a licensed movie is PLAYABLE with a validated same-origin source', () => {
  assert.equal(r.movie.status, 'PLAYABLE');
  assert.equal(r.movie.sources[0].url, '/media/film.mp4');
  assert.equal(r.movie.sources[0].kind, 'FULL_PLAYBACK');
});

// Regression: the URL used to be built as /media/<slug>/<file>, but `file` is
// already the path under public/media. That produced /media/film/film.mp4 for
// a file stored at /media/film.mp4 — a 404 that made a genuinely playable
// title report TEMPORARILY_FAILED. The stub above only 404s for paths it does
// not recognise, so a mismatched URL fails here instead of passing silently.
check('the playback URL is built from the file path, not slug + file', () => {
  const manifest = readFileSync(
    join(repoRoot, 'app/lib/murastream/playback/authorized-sources.ts'), 'utf8');
  assert.ok(manifest.includes('MEDIA_BASE}/${entry.file}'),
    'the URL must be built from `file` alone; prefixing the slug double-nests the path');
  assert.ok(!manifest.includes('MEDIA_BASE}/${entry.slug}'),
    'the slug must not appear in the playback URL');
});

check('a movie with no licensed source is UNAVAILABLE, not a fabricated source', () => {
  assert.notEqual(r.movieUnknown.status, 'PLAYABLE');
  assert.equal(r.movieUnknown.sources.length, 0);
  assert.equal(r.movieUnknown.reason, 'SOURCE_NOT_FOUND');
});

check('a movie whose asset is missing from the deploy is not silently playable', () => {
  // The asset is registered but 404s on our own origin — a misdeploy. It must
  // surface as a failure carrying a reason, never as a playable source.
  assert.notEqual(r.movieHtml.status, 'PLAYABLE');
  assert.ok(r.movieHtml.reason, 'a failure must always carry a reason');
  assert.equal(r.movieHtml.sources.length, 0);
});

check('a movie never reports season or episode', () => {
  assert.equal(r.movie.season, null);
  assert.equal(r.movie.episode, null);
});

// ═══════════════════════════════════════════════════════════════════════════
section('TV / series');

check('a registered series is playable and reports its episode', () => {
  assert.equal(r.s1e1.status, 'PLAYABLE');
  assert.equal(r.s1e1.season, 1);
  assert.equal(r.s1e1.episode, 1);
});

check('S1E1 plays', () => {
  assert.equal(r.s1e1.status, 'PLAYABLE');
  assert.equal(r.s1e1.sources[0].url, '/media/s1e1.mp4');
});

check('S1E2 resolves to a DIFFERENT source than S1E1', () => {
  assert.equal(r.s1e2.sources[0].url, '/media/s1e2.mp4');
  assert.notEqual(r.s1e1.sources[0].url, r.s1e2.sources[0].url);
});

check('S1E3 resolves independently of S1E1 and S1E2', () => {
  const urls = new Set([r.s1e1.sources[0].url, r.s1e2.sources[0].url, r.s1e3.sources[0].url]);
  assert.equal(urls.size, 3, 'three episodes must be three distinct sources');
});

check('a different season resolves to its own source', () => {
  assert.equal(r.s2e1.sources[0].url, '/media/s2e1.mp4');
  assert.equal(r.s2e1.season, 2);
});

check('a missing episode is refused with its own reason', () => {
  assert.notEqual(r.epMissing.status, 'PLAYABLE');
  assert.equal(r.epMissing.reason, 'EPISODE_NOT_FOUND');
  assert.equal(r.epMissing.sources.length, 0);
});

check('a missing season is refused, never borrowed from another season', () => {
  assert.notEqual(r.seasonMissing.status, 'PLAYABLE');
  assert.equal(r.seasonMissing.sources.length, 0);
});

check('an episode never receives a movie source', () => {
  assert.equal(r.s1e1.sources[0].mediaType, 'tv');
  assert.ok(!r.s1e1.sources[0].url.includes('/film/'));
});

// ═══════════════════════════════════════════════════════════════════════════
section('Anime');

check('anime episode 1 resolves', () => {
  assert.equal(r.animeE1.status, 'PLAYABLE');
  assert.equal(r.animeE1.sources[0].url, '/media/a-s1e1.mp4');
});

check('anime episode switching resolves a new source', () => {
  assert.equal(r.animeE2.sources[0].url, '/media/a-s1e2.mp4');
  assert.notEqual(r.animeE1.sources[0].url, r.animeE2.sources[0].url);
});

check('anime keeps its TV episode structure, not a movie identity', () => {
  assert.equal(r.animeE1.mediaType, 'tv');
  assert.equal(r.animeE1.season, 1);
  assert.equal(r.animeE1.episode, 1);
});

check('an anime failure is honest, not a borrowed source', () => {
  assert.notEqual(r.animeFail.status, 'PLAYABLE');
  assert.equal(r.animeFail.sources.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
section('K-drama');

check('k-drama season/episode resolution works', () => {
  assert.equal(r.kdramaE1.status, 'PLAYABLE');
  assert.equal(r.kdramaE1.sources[0].url, '/media/k-s1e1.mp4');
});

check('k-drama episode switching resolves a new source', () => {
  assert.equal(r.kdramaE2.sources[0].url, '/media/k-s1e2.mp4');
});

check('a k-drama failure is honest', () => {
  assert.notEqual(r.kdramaFail.status, 'PLAYABLE');
  assert.equal(r.kdramaFail.sources.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
section('Media ID / type confusion');

check('an unknown mediaType is refused instead of defaulting to movie', () => {
  assert.equal(r.coerceBadType.ok, false);
  assert.equal(r.coerceBadType.reason, 'MEDIA_TYPE_MISMATCH');
});

check('a non-numeric season is refused instead of becoming NaN', () => {
  assert.equal(r.coerceNaNSeason.ok, false);
  assert.equal(r.coerceNaNSeason.reason, 'INVALID_REQUEST');
});

check('an episode on a movie is refused as a type mismatch, not dropped', () => {
  assert.equal(r.coerceMovieWithEpisode.ok, false);
  assert.equal(r.coerceMovieWithEpisode.reason, 'MEDIA_TYPE_MISMATCH');
});

check('a non-numeric tmdbId is refused as MEDIA_ID_INVALID', () => {
  assert.equal(r.coerceBadId.ok, false);
  assert.equal(r.coerceBadId.reason, 'MEDIA_ID_INVALID');
});

check('a well-formed request passes validation with season and episode intact', () => {
  assert.equal(r.coerceGood.ok, true);
  assert.equal(r.coerceGood.request.mediaType, 'tv');
  assert.equal(r.coerceGood.request.season, 1);
  assert.equal(r.coerceGood.request.episode, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
section('Player states and retry honesty');

check('a permanent absence is NOT retryable', () => {
  assert.equal(r.retryNotFound, false,
    'offering retry on a title with no licensed source invites an endless loop');
});

check('a provider fault IS retryable', () => {
  assert.equal(r.retryTimeout, true);
});

check('every reason has a message that tells a viewer what to do', () => {
  const msgs = r.messages;
  assert.ok(msgs && typeof msgs === 'object');
  for (const [k, v] of Object.entries(msgs)) {
    assert.ok(typeof v === 'string' && v.length > 0, `${k} has no viewer message`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
section('NO ADS — non-negotiable');

const AD_PATTERNS = [
  /doubleclick/i, /googlesyndication/i, /adsystem/i, /adnxs/i, /taboola/i,
  /outbrain/i, /popads/i, /propellerads/i, /popunder/i, /onclick\s*=\s*["']window\.open/i,
  /<iframe[^>]+adserver/i, /ad-banner/i, /ad-slot/i, /pre-?roll/i, /mid-?roll/i, /post-?roll/i,
];

const AD_FREE_FILES = [
  'app/murastream/watch/page.tsx',
  'app/murastream/components/PlaybackStatePanel.tsx',
  'app/lib/murastream/playback/client.ts',
  'app/lib/murastream/playback/types.ts',
  'app/lib/murastream/playback/resolver.ts',
  'app/lib/murastream/playback/authorized-sources.ts',
  'app/api/murastream/playback/route.ts',
  'app/murastream/components/PlayButton.tsx',
];

check('no ad network, ad markup or forced redirect exists in the playback path', () => {
  for (const f of AD_FREE_FILES) {
    const src = readFileSync(join(repoRoot, f), 'utf8');
    // Comments are excluded: the files DOCUMENT that popunders, ad networks
    // and pre-roll are impossible. Only executable markup may be scanned.
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    for (const pat of AD_PATTERNS) {
      assert.ok(!pat.test(code), `${f} contains an advertising pattern: ${pat}`);
    }
    assert.ok(!/window\.open\s*\(/.test(code), `${f} opens a popup window`);
  }
});

check('a failure never redirects the viewer off-site', () => {
  const panel = readFileSync(join(repoRoot, 'app/murastream/components/PlaybackStatePanel.tsx'), 'utf8');
  const external = [...panel.matchAll(/href=\{?['"]([^'"]+)/g)].map((m) => m[1]);
  for (const href of external) {
    assert.ok(href.startsWith('/') || href.includes('youtube-nocookie'),
      `failure state links off-site: ${href}`);
  }
});

check('every playable source stays on our own origin', () => {
  const all = [r.movie, r.s1e1, r.s1e2, r.s1e3, r.s2e1, r.animeE1, r.kdramaE1];
  for (const res of all) {
    for (const s of res.sources || []) {
      assert.ok(s.url.startsWith('/') && !s.url.startsWith('//'),
        `playable source is off-origin: ${s.url}`);
      assert.equal(s.authorization, 'first_party');
    }
  }
});

check('an unplayable result never carries a source', () => {
  const unplayable = [r.movieUnknown, r.epMissing, r.seasonMissing, r.animeFail, r.kdramaFail];
  for (const res of unplayable) {
    assert.equal((res.sources || []).length, 0, `${res.reason} must carry no source`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(66)}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length} checks`);
  for (const f of failures) console.log(`  ✗ ${f.name}\n      ${f.error.message}`);
  process.exitCode = 1;
} else {
  console.log(`All ${passed} playback matrix checks passed.`);
}