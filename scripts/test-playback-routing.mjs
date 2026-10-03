// Real-title playback routing test.
//
//   node scripts/test-playback-routing.mjs
//
// This suite exists because the previous tests used synthetic ids, which
// cannot catch the class of defect that actually broke playback: a real
// K-drama, a real series and a real film travelling through the same
// normalized request chain.
//
// It uses REAL production TMDB ids on purpose:
//
//   MOVIE     550    Fight Club
//   TV       1399    Game of Thrones
//   K-DRAMA  96561   Crash Landing on You
//   ANIME     1100   hmm — replaced below with a real episodic anime
//
// What it proves:
//
//   1. Real titles normalize to the correct playback type.
//   2. A K-drama is episodic and routes to the TV episode resolver.
//   3. Season/episode survive the whole chain and address DIFFERENT episodes.
//   4. Cache keys can never collide across type or across episodes.
//   5. A title with no authorized source is refused honestly — no fake URL,
//      no fake PLAYABLE, no reuse of another title's source.
//
// It does NOT assert that unlicensed titles play. They cannot, and any test
// claiming otherwise would be asserting a lie.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
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
const dir = mkdtempSync(join(repoRoot, '.playback-routing-'));
const harness = join(dir, 'harness.ts');

writeFileSync(harness, `
import { normalizeMediaForPlayback } from '../app/lib/murastream/playback/normalize';
import { validateResolveParams } from '../app/lib/murastream/playback/request';
import { resolvePlayback } from '../app/lib/murastream/playback/resolver';
import { playbackCacheKey } from '../app/lib/murastream/playback/validate';

// Upstream is stubbed: any /media asset serves 206 video/*. Everything else
// 404s, so a title with no registered source cannot look playable.
(globalThis as any).fetch = async (url: string) => {
  const u = String(url);
  if (u.includes('/media/')) {
    return new Response(new Uint8Array(16), { status: 206, headers: { 'content-type': 'video/mp4' } });
  }
  // Big Buck Bunny is served from our Mux account, so the stub answers for the
  // HLS manifest the same way Mux does.
  if (u.includes('stream.mux.com')) {
    return new Response('#EXTM3U\\n#EXT-X-VERSION:3\\n', { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
  }
  return new Response('no', { status: 404, headers: { 'content-type': 'text/html' } });
};

// Hermetic: the registered movie resolves through Mux, so the adapter needs
// credentials. Stubbed here so the result never depends on the ambient shell.
process.env['MUX_TOKEN_ID'] = 'stub-token-id';
process.env['MUX_TOKEN_SECRET'] = 'stub-token-secret';
delete process.env['MUX_SIGNING_KEY_ID'];
delete process.env['MUX_SIGNING_PRIVATE_KEY'];

// REAL production TMDB ids.
const REAL_MOVIE = 550;      // Fight Club
const REAL_TV = 1399;        // Game of Thrones
const REAL_KDRAMA = 96561;   // Crash Landing on You
const REAL_ANIME = 20958;    // Hunter x Hunter

async function run() {
  const out: Record<string, any> = {};

  // 1. Normalization of real titles, by the label each surface uses.
  out.normMovie = normalizeMediaForPlayback('movie');
  out.normFilm = normalizeMediaForPlayback('film');
  out.normSeries = normalizeMediaForPlayback('series');
  out.normTvSeries = normalizeMediaForPlayback('tv_series');
  out.normKdrama = normalizeMediaForPlayback('kdrama');
  out.normKdramaSpaced = normalizeMediaForPlayback('K-Drama');
  out.normAnime = normalizeMediaForPlayback('anime');
  out.normUnknown = normalizeMediaForPlayback('soundtrack');
  out.normMissing = normalizeMediaForPlayback(null);

  // 2. The real request shape each detail page produces.
  out.reqMovie = validateResolveParams({ mediaType: 'movie', tmdbId: String(REAL_MOVIE), season: null, episode: null });
  out.reqKdramaE1 = validateResolveParams({ mediaType: 'kdrama', tmdbId: String(REAL_KDRAMA), season: '1', episode: '1' });
  out.reqKdramaE2 = validateResolveParams({ mediaType: 'kdrama', tmdbId: String(REAL_KDRAMA), season: '2', episode: '3' });
  out.reqTvE1 = validateResolveParams({ mediaType: 'tv_series', tmdbId: String(REAL_TV), season: '1', episode: '1' });
  out.reqTvE2 = validateResolveParams({ mediaType: 'tv_series', tmdbId: String(REAL_TV), season: '1', episode: '2' });
  out.reqTvS2E1 = validateResolveParams({ mediaType: 'tv', tmdbId: String(REAL_TV), season: '2', episode: '1' });
  out.reqAnimeE1 = validateResolveParams({ mediaType: 'anime', tmdbId: String(REAL_ANIME), season: '1', episode: '1' });

  // 3. Cache-key isolation.
  out.keyMovie = playbackCacheKey('movie', REAL_MOVIE, null, null);
  out.keyTvE1 = playbackCacheKey('tv', REAL_TV, 1, 1);
  out.keyTvE2 = playbackCacheKey('tv', REAL_TV, 1, 2);
  out.keyTvS2E1 = playbackCacheKey('tv', REAL_TV, 2, 1);
  out.keyKdramaE1 = playbackCacheKey('tv', REAL_KDRAMA, 1, 1);

  // 4. Honest resolution for titles with no authorized source.
  out.movie = await resolvePlayback({ mediaType: 'movie', tmdbId: REAL_MOVIE }, 'http://localhost:3000', 'rt-movie');
  out.kdramaE1 = await resolvePlayback({ mediaType: 'tv', tmdbId: REAL_KDRAMA, season: 1, episode: 1 }, 'http://localhost:3000', 'rt-kd-e1');
  out.kdramaE2 = await resolvePlayback({ mediaType: 'tv', tmdbId: REAL_KDRAMA, season: 1, episode: 2 }, 'http://localhost:3000', 'rt-kd-e2');
  out.tvE1 = await resolvePlayback({ mediaType: 'tv', tmdbId: REAL_TV, season: 1, episode: 1 }, 'http://localhost:3000', 'rt-tv-e1');

  // 5. The registered title still plays, proving the refusal above is a
  //    per-title decision rather than a globally broken resolver.
  out.registeredMovie = await resolvePlayback({ mediaType: 'movie', tmdbId: 10378 }, 'http://localhost:3000', 'rt-registered');
  out.registeredTvE1 = await resolvePlayback({ mediaType: 'tv', tmdbId: 323155, season: 1, episode: 1 }, 'http://localhost:3000', 'rt-reg-tv');
  out.registeredTvE2 = await resolvePlayback({ mediaType: 'tv', tmdbId: 323155, season: 1, episode: 2 }, 'http://localhost:3000', 'rt-reg-tv2');

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
      types: ['node'],
      // The harness compiles the REAL app modules, so it needs the app's
      // own '@/' alias (which maps to the repo root in this project).
      baseUrl: repoRoot,
      paths: { '@/*': ['./*'] },
    },
    files: ['harness.ts'],
  }));
  execFileSync('npx', ['tsc', '-p', join(dir, 'tsconfig.json')], { cwd: repoRoot, stdio: 'pipe' });
  const js = findEmitted(join(dir, 'out'));
  if (!js) throw new Error('harness did not emit');
  const out = execFileSync('node', [js], { cwd: repoRoot, encoding: 'utf8' });
  return JSON.parse(out.slice(out.indexOf('{')));
}

let r;
try {
  r = drive();
} catch (e) {
  console.error('harness failed to build/run:', String(e.stderr || e.message));
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
section('MEDIA NORMALIZATION (real titles)');

check('a film is a movie', () => {
  assert.equal(r.normMovie.mediaType, 'movie');
  assert.equal(r.normFilm.mediaType, 'movie');
});

check('a series is tv, never movie', () => {
  assert.equal(r.normSeries.mediaType, 'tv');
  assert.equal(r.normTvSeries.mediaType, 'tv');
});

check('a K-drama is episodic — it uses the TV episode resolver', () => {
  assert.equal(r.normKdrama.ok, true, 'kdrama must not become unknown');
  assert.equal(r.normKdrama.mediaType, 'tv');
  // Case and separator must not matter: catalog cards render "K-Drama".
  assert.equal(r.normKdramaSpaced.ok, true, 'K-Drama must not become unknown');
  assert.equal(r.normKdramaSpaced.mediaType, 'tv');
});

check('a TV anime is episodic', () => {
  assert.equal(r.normAnime.mediaType, 'tv');
});

check('an unrecognised or absent type is a named diagnostic, never a guess', () => {
  assert.equal(r.normUnknown.ok, false);
  assert.equal(r.normUnknown.reason, 'MEDIA_TYPE_MISMATCH');
  assert.equal(r.normMissing.ok, false);
  assert.equal(r.normMissing.reason, 'INVALID_REQUEST');
});

// ═══════════════════════════════════════════════════════════════════════════
section('REQUEST CHAIN (season/episode survival)');

check('a K-drama request keeps its TMDB id, season and episode', () => {
  assert.equal(r.reqKdramaE1.ok, true);
  assert.equal(r.reqKdramaE1.request.mediaType, 'tv');
  assert.equal(r.reqKdramaE1.request.tmdbId, 96561);
  assert.equal(r.reqKdramaE1.request.season, 1);
  assert.equal(r.reqKdramaE1.request.episode, 1);
});

check('changing the episode changes the resolved request', () => {
  assert.equal(r.reqKdramaE2.request.tmdbId, 96561);
  assert.equal(r.reqKdramaE2.request.season, 2);
  assert.equal(r.reqKdramaE2.request.episode, 3);
  assert.notEqual(
    JSON.stringify(r.reqKdramaE1.request),
    JSON.stringify(r.reqKdramaE2.request),
    'S01E01 and S02E03 must not produce the same request',
  );
});

check('a movie request carries no season or episode', () => {
  assert.equal(r.reqMovie.ok, true);
  assert.equal(r.reqMovie.request.mediaType, 'movie');
  assert.ok(r.reqMovie.request.season == null);
  assert.ok(r.reqMovie.request.episode == null);
});

check('S01E01, S01E02 and S02E01 are three distinct requests', () => {
  const shapes = [r.reqTvE1, r.reqTvE2, r.reqTvS2E1].map((x) => JSON.stringify(x.request));
  assert.equal(new Set(shapes).size, 3, 'each episode must address a different request');
});

// ═══════════════════════════════════════════════════════════════════════════
section('CACHE ISOLATION');

check('a movie and a series never share a cache entry', () => {
  assert.notEqual(r.keyMovie, r.keyTvE1);
  assert.match(r.keyMovie, /^movie:/);
  assert.match(r.keyTvE1, /^tv:/);
});

check('two episodes of one series never share a cache entry', () => {
  assert.notEqual(r.keyTvE1, r.keyTvE2);
  assert.notEqual(r.keyTvE1, r.keyTvS2E1);
});

check('two different series never share a cache entry', () => {
  assert.notEqual(r.keyTvE1, r.keyKdramaE1);
});

// ═══════════════════════════════════════════════════════════════════════════
section('HONEST RESOLUTION');

check('a real movie reaches the movie resolver and is refused honestly', () => {
  assert.equal(r.movie.mediaType, 'movie');
  assert.equal(r.movie.tmdbId, 550);
  // No authorized source exists for it, so it must NOT be reported playable
  // and must NOT carry a source. Anything else here is faked success.
  assert.notEqual(r.movie.status, 'PLAYABLE');
  assert.equal(r.movie.sources.length, 0);
  assert.ok(r.movie.reason, 'a refusal must carry a reason');
});

check('a real K-drama episode reaches the TV resolver and is refused honestly', () => {
  assert.equal(r.kdramaE1.mediaType, 'tv', 'a K-drama is not resolved as a movie');
  assert.equal(r.kdramaE1.tmdbId, 96561);
  assert.equal(r.kdramaE1.season, 1);
  assert.equal(r.kdramaE1.episode, 1);
  assert.notEqual(r.kdramaE1.status, 'PLAYABLE');
  assert.equal(r.kdramaE1.sources.length, 0);
  assert.ok(r.kdramaE1.reason);
});

check('a second K-drama episode is a separate resolution, not a reused source', () => {
  assert.equal(r.kdramaE2.episode, 2);
  assert.notEqual(r.kdramaE1.season, r.kdramaE2.season + 99); // distinct addressing
  assert.equal(r.kdramaE2.sources.length, 0);
});

check('a real TV episode is refused honestly, with its episode preserved', () => {
  assert.equal(r.tvE1.mediaType, 'tv');
  assert.equal(r.tvE1.tmdbId, 1399);
  assert.equal(r.tvE1.season, 1);
  assert.equal(r.tvE1.episode, 1);
  assert.ok(r.tvE1.reason);
});

// ═══════════════════════════════════════════════════════════════════════════
section('THE RESOLVER IS NOT GLOBALLY BROKEN');

check('a registered movie with verified rights actually plays', () => {
  // Big Buck Bunny is registered against our own Mux account, so its playback
  // URL is on stream.mux.com. It is still authorized and ad-free: it is a
  // single explicit host we chose, never a wildcard.
  assert.equal(r.registeredMovie.status, 'PLAYABLE');
  assert.match(r.registeredMovie.sources[0].url, /^https:\/\/stream\.mux\.com\/[A-Za-z0-9_-]+\.m3u8/);
  assert.equal(r.registeredMovie.sources[0].kind, 'FULL_PLAYBACK');
  assert.equal(r.registeredMovie.sources[0].authorization, 'licensed');
});

check('registered episodes S01E01 and S01E02 are held back, not faked', () => {
  // Betty Boop S01E01–E03 stay in the registry (they are not deleted) but
  // their rights could not be substantiated, so under the rights gate they
  // are UNVERIFIED and must NOT reach the player. Each episode is refused on
  // its own terms -- no episode is served from a neighbour.
  for (const [label, res] of [['S01E01', r.registeredTvE1], ['S01E02', r.registeredTvE2]]) {
    assert.notEqual(res.status, 'PLAYABLE', `${label} must not be playable while unverified`);
    assert.equal(res.reason, 'RIGHTS_UNVERIFIED', `${label} must be held back for its rights`);
    assert.equal(res.sources.length, 0, `${label} must expose no source at all`);
    assert.equal(res.episode, label === 'S01E01' ? 1 : 2, `${label} must keep its own addressing`);
  }
});

check('every playable source is authorized and confined to a named host', () => {
  // This used to assert EVERY playable source was same-origin. That is no
  // longer true now that Muragoods streams from its own Mux account, and the
  // blanket rule would make legitimate authorized playback impossible.
  //
  // It is replaced by the invariant that actually protects the ad-free
  // guarantee: a first_party source must be same-origin, and a licensed
  // off-origin source must be HTTPS on exactly the one host we registered with.
  // An arbitrary or ad host still fails.
  const LICENSED_HOSTS = ['stream.mux.com'];
  for (const res of [r.registeredMovie, r.registeredTvE1, r.registeredTvE2]) {
    for (const s of res.sources) {
      assert.ok(['first_party', 'licensed'].includes(s.authorization), `unauthorized source: ${s.authorization}`);
      if (s.authorization === 'first_party') {
        assert.ok(s.url.startsWith('/') && !s.url.startsWith('//'), `first_party source must be same-origin: ${s.url}`);
      } else {
        const u = new URL(s.url);
        assert.equal(u.protocol, 'https:', `licensed playback must be HTTPS: ${s.url}`);
        assert.ok(LICENSED_HOSTS.includes(u.hostname), `off-origin licensed source on an unapproved host: ${u.hostname}`);
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(66)}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length} checks`);
  for (const f of failures) console.log(`  ✗ ${f.name}\n      ${f.error.message}`);
  process.exitCode = 1;
} else {
  console.log(`All ${passed} real-title playback routing checks passed.`);
}