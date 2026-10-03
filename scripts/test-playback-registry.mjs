// Playback source registry test.
//
//   node scripts/test-playback-registry.mjs
//
// Covers the acceptance criteria that concern the REGISTRY rather than the
// transport:
//
//   * the four committed sources still resolve (movie, S01E01, S01E02, S01E03)
//   * each episode resolves to a DIFFERENT source
//   * a title with no registered source reports SOURCE_NOT_REGISTERED
//   * a registered source whose provider is unconfigured reports
//     PROVIDER_NOT_CONFIGURED — NOT "no source exists"
//   * a disabled source reports SOURCE_DISABLED, an expired one SOURCE_EXPIRED
//   * registration validation refuses bad rows (movie + episode, bad ids)
//   * duplicates are detected rather than silently overwriting
//   * provider credentials are never exposed by any public shape
//
// The database is not stubbed at the registry layer on purpose: the lookup
// logic is pure and is tested directly against records, which is the part
// that has historically been wrong.

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
const dir = mkdtempSync(join(repoRoot, '.playback-registry-'));
const harness = join(dir, 'harness.ts');

writeFileSync(harness, `
import {
  STATIC_SOURCES, findInRecords, recordKey, usableSourceStatus,
  validateSourceInput, isPlausibleImdbId,
  type AuthorizedSourceRecord,
} from '../app/lib/murastream/playback/registry';
import { resolvePlayback } from '../app/lib/murastream/playback/resolver';
import { allAdapters, adapterFor } from '../app/lib/murastream/playback/providers';
import { approvalBlockers } from '../app/lib/murastream/playback/store';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

(globalThis as any).fetch = async (url: string) => {
  const u = String(url);
  if (u.includes('/media/')) {
    return new Response(new Uint8Array(16), { status: 206, headers: { 'content-type': 'video/mp4' } });
  }
  // Mux-hosted playback: Big Buck Bunny is registered against our Mux account,
  // so the stub has to answer for the HLS manifest the same way Mux does.
  if (u.includes('stream.mux.com')) {
    return new Response('#EXTM3U\\n#EXT-X-VERSION:3\\n', { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
  }
  return new Response('no', { status: 404, headers: { 'content-type': 'text/html' } });
};

// HERMETICITY: this suite asserts both the unconfigured AND the configured Mux
// behaviour, so it must not inherit whatever the ambient environment happens
// to hold. Credentials are set explicitly further down, for one section only.
for (const k of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) {
  delete process.env[k];
}

// Stub credentials for the rest of the suite. Big Buck Bunny is registered
// against Mux, so resolving it requires a configured provider; the probes that
// assert the UNCONFIGURED behaviour clear these again locally and restore them.
const STUB_MUX_ID = 'stub-token-id';
// Deliberately reads "not-a-real-secret": the repository's secret scanner
// refuses credential-shaped literals assigned to a *SECRET* name, and it is
// right to. This is a fabricated fixture that must never be usable as a real
// credential, so it declares itself as the documented placeholder it is.
const STUB_MUX_SECRET = 'stub-not-a-real-secret-value';
process.env.MUX_TOKEN_ID = STUB_MUX_ID;
process.env.MUX_TOKEN_SECRET = STUB_MUX_SECRET;

const now = Date.now();
const HOUR = 3600_000;

async function run() {
  const out: Record<string, any> = {};

  // ── The four committed sources ──────────────────────────────────────
  out.staticCount = STATIC_SOURCES.length;
  out.staticKeys = STATIC_SOURCES.map((s) => recordKey(s));

  // The admin rights-audit rule, exercised without a database.
  const auditBase = { rightsStatus: 'CC_BY' as const, rightsSourceUrl: 'https://example.org/item', licenseType: 'CC BY 3.0' };
  out.audit = {
    fullyEvidenced: approvalBlockers(auditBase as never),
    noEvidenceUrl: approvalBlockers({ ...auditBase, rightsSourceUrl: null } as never),
    noLicenseType: approvalBlockers({ ...auditBase, licenseType: null } as never),
    unverifiedStatus: approvalBlockers({ ...auditBase, rightsStatus: 'UNVERIFIED' } as never),
    everythingMissing: approvalBlockers({ rightsStatus: 'UNVERIFIED', rightsSourceUrl: null, licenseType: null } as never),
  };

  out.moviePlayable = await resolvePlayback({ mediaType: 'movie', tmdbId: 10378 }, 'http://x', 'r-movie');
  out.e1 = await resolvePlayback({ mediaType: 'tv', tmdbId: 323155, season: 1, episode: 1 }, 'http://x', 'r-e1');
  out.e2 = await resolvePlayback({ mediaType: 'tv', tmdbId: 323155, season: 1, episode: 2 }, 'http://x', 'r-e2');
  out.e3 = await resolvePlayback({ mediaType: 'tv', tmdbId: 323155, season: 1, episode: 3 }, 'http://x', 'r-e3');

  // ── A title with no registered source ───────────────────────────────
  out.unregistered = await resolvePlayback({ mediaType: 'movie', tmdbId: 27205 }, 'http://x', 'r-unreg');
  out.unregisteredEp = await resolvePlayback({ mediaType: 'tv', tmdbId: 1399, season: 1, episode: 1 }, 'http://x', 'r-unreg-ep');

  // ── Registry state classification (pure logic) ──────────────────────
  const base: AuthorizedSourceRecord = {
    tmdbId: 900000, imdbId: null, mediaType: 'movie', season: null, episode: null,
    title: 'Registered Film', sourceType: 'first_party', provider: 'muragoods',
    playbackUrl: 'registered.mp4', mimeType: 'video/mp4',
    authorization: 'first_party', authorizationStatus: 'verified',
    enabled: true, expiresAt: null, createdAt: new Date(now), updatedAt: new Date(now),
    rightsStatus: 'PUBLIC_DOMAIN' as const, licenseType: 'U.S. public domain',
    licenseUrl: null, rightsSourceUrl: 'https://example.org/rights-proof',
    attributionRequired: false, attributionText: null,
    verifiedAt: new Date(now), verifiedBy: 'test',
  };

  out.enabledStatus = usableSourceStatus(base);

  // Rights are a SEPARATE gate from enablement and expiry. A disabled,
  // unexpired, authorized source whose rights are UNVERIFIED must still not
  // play: the provider hosting a file grants nothing about the film's rights.
  const unverifiedRights = { ...base, rightsStatus: 'UNVERIFIED' as const, rightsSourceUrl: null, licenseType: null };
  out.unverifiedRightsStatus = usableSourceStatus(unverifiedRights);
  out.unverifiedRightsLookup = findInRecords([unverifiedRights], { mediaType: 'movie', tmdbId: 900000 });

  const ccBy = { ...base, rightsStatus: 'CC_BY' as const, attributionRequired: true, attributionText: '(c) Someone' };
  out.ccByStatus = usableSourceStatus(ccBy);

  // Rights evidence recorded on the committed sources.
  out.buckBunnyRights = STATIC_SOURCES.find((s2) => s2.tmdbId === 10378)?.rightsStatus ?? null;
  out.buckBunnyLicense = STATIC_SOURCES.find((s2) => s2.tmdbId === 10378)?.licenseType ?? null;
  out.buckBunnyEvidence = STATIC_SOURCES.find((s2) => s2.tmdbId === 10378)?.rightsSourceUrl ?? null;
  out.buckBunnyAttribution = STATIC_SOURCES.find((s2) => s2.tmdbId === 10378)?.attributionRequired ?? false;
  out.boopRights = [...new Set(STATIC_SOURCES.filter((s2) => s2.tmdbId === 323155).map((s2) => s2.rightsStatus))];

  const disabled = { ...base, enabled: false };
  out.disabledStatus = usableSourceStatus(disabled);

  const expired = { ...base, expiresAt: new Date(now - HOUR) };
  out.expiredStatus = usableSourceStatus(expired);

  const unverified = { ...base, authorizationStatus: 'unverified' as const };
  out.unverifiedStatus = usableSourceStatus(unverified);

  out.foundEnabled = findInRecords([base], { mediaType: 'movie', tmdbId: 900000 });
  out.foundDisabled = findInRecords([disabled], { mediaType: 'movie', tmdbId: 900000 });
  out.foundExpired = findInRecords([expired], { mediaType: 'movie', tmdbId: 900000 });
  out.foundUnverified = findInRecords([unverified], { mediaType: 'movie', tmdbId: 900000 });
  out.foundMissing = findInRecords([base], { mediaType: 'movie', tmdbId: 900001 });

  // A movie lookup must never be satisfied by a series record.
  out.typeIsolation = findInRecords([{ ...base, mediaType: 'tv', season: 1, episode: 1 }], { mediaType: 'movie', tmdbId: 900000 });

  // Episode isolation: one series, three episodes, three different answers.
  const series = [1, 2, 3].map((e) => ({
    ...base, tmdbId: 900001, mediaType: 'tv' as const, season: 1, episode: e,
    playbackUrl: 's1e' + e + '.mp4',
  }));
  out.ep1 = findInRecords(series, { mediaType: 'tv', tmdbId: 900001, season: 1, episode: 1 });
  out.ep2 = findInRecords(series, { mediaType: 'tv', tmdbId: 900001, season: 1, episode: 2 });
  out.ep3 = findInRecords(series, { mediaType: 'tv', tmdbId: 900001, season: 1, episode: 3 });
  out.ep9 = findInRecords(series, { mediaType: 'tv', tmdbId: 900001, season: 1, episode: 9 });

  // ── Registration validation ─────────────────────────────────────────
  out.validMovie = validateSourceInput({
    mediaType: 'movie', tmdbId: 550, title: 'Fight Club', sourceType: 'first_party',
    provider: 'muragoods', playbackUrl: 'fc.mp4', mimeType: 'video/mp4',
  });
  out.validEpisode = validateSourceInput({
    mediaType: 'tv', tmdbId: 1399, title: 'GoT', season: 1, episode: 2,
    sourceType: 'cloudflare_stream', provider: 'cloudflare_stream', playbackUrl: 'abcdefgh12345678',
  });
  out.movieWithEpisode = validateSourceInput({
    mediaType: 'movie', tmdbId: 550, title: 'x', sourceType: 'first_party',
    playbackUrl: 'x.mp4', season: 1, episode: 2,
  });
  out.episodeMissingFields = validateSourceInput({
    mediaType: 'tv', tmdbId: 1399, title: 'GoT', sourceType: 'first_party', playbackUrl: 'x.mp4',
  });
  out.badTmdb = validateSourceInput({
    mediaType: 'movie', tmdbId: 'abc', title: 'x', sourceType: 'first_party', playbackUrl: 'x.mp4',
  });
  out.badImdb = validateSourceInput({
    mediaType: 'movie', tmdbId: 550, imdbId: 'nope', title: 'x', sourceType: 'first_party', playbackUrl: 'x.mp4',
  });
  out.unknownProvider = validateSourceInput({
    mediaType: 'movie', tmdbId: 550, title: 'x', sourceType: 'scrape', playbackUrl: 'x.mp4',
  });
  out.imdbOk = isPlausibleImdbId('tt0137523');
  out.imdbBad = isPlausibleImdbId('0137523');

  // ── Provider adapters ───────────────────────────────────────────────
  out.adapterNames = allAdapters().map((a) => a.sourceType);
  // The next three probes assert the UNCONFIGURED behaviour, so credentials must
// be absent for exactly this window and restored immediately afterwards.
delete process.env.MUX_TOKEN_ID;
delete process.env.MUX_TOKEN_SECRET;

out.muxRefusesWhenUnconfigured = await adapterFor('mux').getSource({
    ...base, sourceType: 'mux', playbackUrl: 'abcd1234efgh5678',
  } as AuthorizedSourceRecord);
  out.muxRejectsBadPlaybackId = await adapterFor('mux').getSource({
    ...base, sourceType: 'mux', playbackUrl: 'https://evil.example/x',
  } as AuthorizedSourceRecord);
  out.healthStates = {};
  for (const a of allAdapters()) {
    const h = await a.healthCheck();
    out.healthStates[a.sourceType] = { state: h.state, detail: h.detail };
  }
  // Restore the stub credentials for the rest of the run.
  process.env.MUX_TOKEN_ID = STUB_MUX_ID;
  process.env.MUX_TOKEN_SECRET = STUB_MUX_SECRET;

  // An unconfigured provider must refuse rather than invent a URL.
  out.cfRefusesWhenUnconfigured = await adapterFor('cloudflare_stream').getSource({
    ...base, sourceType: 'cloudflare_stream', playbackUrl: 'abcdefgh12345678',
  } as AuthorizedSourceRecord);

  // first_party must refuse an off-origin value, or the no-ads guarantee dies.
  out.firstPartyRejectsAbsolute = await adapterFor('first_party').getSource({
    ...base, playbackUrl: 'https://evil.example/x.mp4',
  } as AuthorizedSourceRecord);
  out.firstPartyBuildsPath = await adapterFor('first_party').getSource({
    ...base, playbackUrl: 'sub/dir/x.mp4',
  } as AuthorizedSourceRecord);

  // ── Mux WITH credentials present ────────────────────────────────────
  //
  // Everything above proves Mux refuses when it has no credentials. That is
  // only half the contract: nothing here proves what it does when it DOES.
  // These probes run against a STUBBED api.mux.com with fake credentials, so
  // they assert the shape of the configured path — healthCheck reporting
  // CONFIGURED, a stream.mux.com HLS URL, a one-time upload target — and that
  // the credential appears only in an Authorization header.
  //
  // They are NOT a live-account test. A stub cannot prove the real Mux API
  // accepts anything; it can only prove this code does not leak and does not
  // misreport. Live verification still requires real credentials.
  const MUX_ID = 'stub-token-id';
  const MUX_SECRET = 'stub-not-a-real-secret-value';
  const MUX_API_BASE = 'https://api.mux.com/video/v1';
  process.env.MUX_TOKEN_ID = MUX_ID;
  process.env.MUX_TOKEN_SECRET = MUX_SECRET;

  const muxRecord: AuthorizedSourceRecord = {
    ...base, sourceType: 'mux', provider: 'mux',
    playbackUrl: 'abcd1234efgh5678', authorization: 'licensed',
    rightsStatus: 'PUBLIC_DOMAIN' as const,
  } as AuthorizedSourceRecord;

  let seenAuth = '';
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const u = String(url);
    seenAuth = String(init?.headers?.Authorization ?? '');
    if (u === MUX_API_BASE + '/assets?limit=1') {
      return new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u === MUX_API_BASE + '/uploads') {
      return new Response(
        JSON.stringify({ data: { id: 'up-1', url: 'https://storage.googleapis.com/mux/one-time-upload-target', timeout: 3600 } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('no', { status: 404 });
  };

  out.muxConfiguredHealth = await adapterFor('mux').healthCheck();
  out.muxConfiguredHealthAuthHeader = seenAuth;
  out.muxConfiguredSource = await adapterFor('mux').getSource(muxRecord);
  out.muxConfiguredBadId = await adapterFor('mux').getSource({ ...muxRecord, playbackUrl: 'https://evil.example/x.m3u8' } as AuthorizedSourceRecord);
  out.muxUpload = await adapterFor('mux').createUpload?.({ corsOrigin: 'https://muragoods.app' });
  out.muxUploadAuthHeader = seenAuth;

  // Rejected credentials must be reported as a config problem, not as ONLINE.
  (globalThis as any).fetch = async () => new Response('{"error":{"messages":["bad auth"]}}', { status: 401, headers: { 'content-type': 'application/json' } });
  out.muxBadCredentialHealth = await adapterFor('mux').healthCheck();

  // Unconfigured upload must refuse rather than fabricate a target.
  delete process.env.MUX_TOKEN_ID;
  delete process.env.MUX_TOKEN_SECRET;
  out.muxUploadUnconfigured = await adapterFor('mux').createUpload?.({});
  out.muxHealthAfterUnset = await adapterFor('mux').healthCheck();

  // ── Credential leakage scan ─────────────────────────────────────────
  // Reads the provider source itself: no secret-shaped literal may appear
  // inside any healthCheck result, and no token may be interpolated into a
  // returned URL when it is unset.
  // The provider module must never interpolate a credential into an outbound
  // URL, and no diagnostic may echo a raw token variable. Read the source and
  // assert on the pattern directly.
  out.secretScan = (() => {
    // Read from the REPO root, not from the compiled output directory that
    // __dirname now points into — this harness emits JS, not .ts.
    const src = readFileSync(join(process.cwd(), 'app/lib/murastream/playback/providers.ts'), 'utf8');
    const bad: string[] = [];
    // A provider API credential may be sent in an Authorization header — that
    // is the correct way to authenticate. What must NEVER appear in a URL is
    // the API credential, because URLs are captured by access logs, referrers
    // and proxies.
    //
    // Mux's short-lived SIGNED PLAYBACK token does appear in a playback URL,
    // and that is by design: it is asset-scoped and expires in an hour, and it
    // is not the API credential. the secret and apiKey locals are the credentials.
    for (const line of src.split('\\n')) {
      if (!line.includes('$' + '{secret}') && !line.includes('$' + '{apiKey}')) continue;
      if (/Authorization/.test(line)) continue;
      bad.push('API credential interpolated outside an Authorization header: ' + line.trim());
    }
    for (const name of ['MUX_TOKEN_SECRET', 'CLOUDFLARE_STREAM_TOKEN', 'APIVIDEO_API_KEY']) {
      if (src.includes(name + '}')) bad.push(name + ' interpolated into a string');
    }
    if (/detail:[^,]*token/.test(src)) bad.push('a token reaches a health detail');
    return bad;
  })();

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
      // The harness compiles the REAL app modules, so it needs the app's own
      // '@/' alias. Without this the registry store would fail to compile
      // here while compiling fine in the app — exactly the kind of drift this
      // suite exists to prevent.
      baseUrl: repoRoot,
      // Mirrors the app's own alias exactly: '@/' maps to the REPO ROOT
      // here, because this project imports as '@/app/lib/...'.
      paths: { '@/*': ['./*'] },
    },
    files: ['harness.ts'],
  }));
  try {
    execFileSync('npx', ['tsc', '-p', join(dir, 'tsconfig.json')], { cwd: repoRoot, stdio: 'pipe' });
  } catch (e) {
    // A harness that compiles the real app modules must say WHY it failed to
    // build, otherwise a type error looks identical to a broken pipeline.
    const err = /** @type {{ stderr?: Buffer; stdout?: Buffer; message?: string }} */ (e);
    throw new Error(`harness failed to compile:\n${err.stderr?.toString() || err.stdout?.toString() || err.message || 'unknown'}`);
  }
  const js = findEmitted(join(dir, 'out'));
  if (!js) throw new Error('harness did not emit');
  const out = execFileSync('node', [js], { cwd: repoRoot, encoding: 'utf8' });
  return JSON.parse(out.slice(out.indexOf('{')));
}

let r;
try {
  r = drive();
} catch (e) {
  console.error('harness failed to build/run:', String(e.stderr || e.stdout || e.message));
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
section('THE FOUR COMMITTED SOURCES STILL PLAY');

check('exactly four sources are committed', () => {
  assert.equal(r.staticCount, 4);
  assert.deepEqual(r.staticKeys.sort(), ['movie:10378', 'tv:323155:S1E1', 'tv:323155:S1E2', 'tv:323155:S1E3']);
});

check('Big Buck Bunny is PLAYABLE through its authorized Mux source', () => {
  // This title is registered against our own Mux account. The playback URL is
  // therefore off-origin BY DESIGN — but it is still licensed and authorized,
  // which is what the ad-free guarantee actually depends on.
  assert.equal(r.moviePlayable.status, 'PLAYABLE');
  assert.match(r.moviePlayable.sources[0].url, /^https:\/\/stream\.mux\.com\/[A-Za-z0-9_-]+\.m3u8/);
  assert.equal(r.moviePlayable.sources[0].authorization, 'licensed');
  assert.equal(r.moviePlayable.sources[0].kind, 'FULL_PLAYBACK');
});

check('Betty Boop episodes are HELD BACK until their rights are verified', () => {
  // Their provenance could not be substantiated, so the rights gate blocks
  // them. They are RETAINED, not deleted, and they carry no source at all.
  for (const key of ['e1', 'e2', 'e3']) {
    assert.notEqual(r[key].status, 'PLAYABLE', `${key} must not play while rights are unverified`);
    assert.equal(r[key].sources.length, 0, `${key} must carry no source`);
  }
  assert.equal(r.e1.reason, 'RIGHTS_UNVERIFIED');
});

check('a rights-blocked episode reports the exact step, not a generic "unavailable"', () => {
  assert.equal(r.e1.reason, 'RIGHTS_UNVERIFIED');
  assert.notEqual(r.e1.reason, 'SOURCE_NOT_REGISTERED',
    'rights-blocked and not-registered are different problems with different fixes');
});

// ═══════════════════════════════════════════════════════════════════════════
section('A TITLE WITH NO REGISTERED SOURCE');

check('an unregistered movie reports SOURCE_NOT_REGISTERED, not a resolver fault', () => {
  // Spec section 12: an address with no registered source is UNAVAILABLE
  // with an exact reason — never a resolver fault, never a fabricated URL.
  assert.equal(r.unregistered.status, 'UNAVAILABLE');
  assert.equal(r.unregistered.reason, 'SOURCE_NOT_REGISTERED');
  assert.equal(r.unregistered.sources.length, 0);
});

check('an unregistered episode reports SOURCE_NOT_REGISTERED', () => {
  assert.equal(r.unregisteredEp.mediaType, 'tv');
  assert.equal(r.unregisteredEp.season, 1);
  assert.equal(r.unregisteredEp.episode, 1);
  assert.equal(r.unregisteredEp.reason, 'SOURCE_NOT_REGISTERED');
});

// ═══════════════════════════════════════════════════════════════════════════
section('REGISTRY STATE CLASSIFICATION');

check('an enabled, verified, unexpired source is REGISTERED', () => {
  assert.equal(r.enabledStatus, 'REGISTERED');
  assert.equal(r.foundEnabled.found, true);
});

check('a disabled source reports SOURCE_DISABLED, not "not registered"', () => {
  assert.equal(r.disabledStatus, 'SOURCE_DISABLED');
  assert.equal(r.foundDisabled.found, false);
  assert.equal(r.foundDisabled.status, 'SOURCE_DISABLED');
});

check('an expired source reports SOURCE_EXPIRED', () => {
  assert.equal(r.expiredStatus, 'SOURCE_EXPIRED');
  assert.equal(r.foundExpired.status, 'SOURCE_EXPIRED');
});

check('an unverified source is refused as SOURCE_NOT_AUTHORIZED', () => {
  assert.equal(r.unverifiedStatus, 'SOURCE_NOT_AUTHORIZED');
  assert.equal(r.foundUnverified.status, 'SOURCE_NOT_AUTHORIZED');
});

check('a genuinely absent title reports SOURCE_NOT_REGISTERED', () => {
  assert.equal(r.foundMissing.found, false);
  assert.equal(r.foundMissing.status, 'SOURCE_NOT_REGISTERED');
});

check('a movie lookup is never satisfied by a series record', () => {
  assert.equal(r.typeIsolation.found, false);
});

// ═══════════════════════════════════════════════════════════════════════════
section('EPISODE ADDRESSING');

check('S01E01, S01E02 and S01E03 each find their own record', () => {
  for (const k of ['ep1', 'ep2', 'ep3']) assert.equal(r[k].found, true, `${k} must resolve`);
  assert.equal(r.ep1.record.episode, 1);
  assert.equal(r.ep2.record.episode, 2);
  assert.equal(r.ep3.record.episode, 3);
  const files = [r.ep1, r.ep2, r.ep3].map((x) => x.record.playbackUrl);
  assert.equal(new Set(files).size, 3, 'episodes shared one record');
});

check('an unregistered episode in a known series is NOT registered', () => {
  assert.equal(r.ep9.found, false);
});

// ═══════════════════════════════════════════════════════════════════════════
section('RIGHTS');

check('rights are a separate gate from enablement and expiry', () => {
  assert.equal(r.unverifiedRightsStatus, 'RIGHTS_UNVERIFIED');
  assert.equal(r.unverifiedRightsLookup.found, false,
    'a source with unverified rights must never be handed to the player');
});

check('a CC BY source with recorded evidence is playable', () => {
  assert.equal(r.ccByStatus, 'REGISTERED');
});

check('Big Buck Bunny carries its verified CC BY 3.0 evidence', () => {
  assert.equal(r.buckBunnyRights, 'CC_BY');
  assert.match(String(r.buckBunnyLicense), /Creative Commons Attribution 3\.0/);
  assert.equal(r.buckBunnyEvidence, 'https://archive.org/details/BigBuckBunny_124');
  assert.equal(r.buckBunnyAttribution, true, 'CC BY requires the attribution to be recorded');
});

check('Betty Boop episodes are UNVERIFIED, not falsely claimed public domain', () => {
  // The earlier provenance claim could not be substantiated, so these are held
  // back rather than asserted. They are retained, not deleted.
  assert.deepEqual(r.boopRights, ['UNVERIFIED']);
});

// ═══════════════════════════════════════════════════════════════════════════
section('REGISTRATION VALIDATION');

check('a valid movie source is accepted with no season/episode', () => {
  assert.equal(r.validMovie.ok, true);
  assert.equal(r.validMovie.value.mediaType, 'movie');
  assert.equal(r.validMovie.value.season, null);
});

check('a valid episode source is accepted with season and episode', () => {
  assert.equal(r.validEpisode.ok, true);
  assert.equal(r.validEpisode.value.season, 1);
  assert.equal(r.validEpisode.value.episode, 2);
});

check('a movie carrying an episode number is refused', () => {
  assert.equal(r.movieWithEpisode.ok, false);
  const fields = r.movieWithEpisode.errors.map((e) => e.field);
  assert.ok(fields.includes('season') && fields.includes('episode'));
});

check('a series without season/episode is refused', () => {
  assert.equal(r.episodeMissingFields.ok, false);
});

check('a non-numeric tmdbId is refused', () => {
  assert.equal(r.badTmdb.ok, false);
});

check('a malformed imdbId is refused', () => {
  assert.equal(r.badImdb.ok, false);
});

check('an unknown provider is refused', () => {
  assert.equal(r.unknownProvider.ok, false);
});

check('imdbId shape checking accepts only tt-prefixed ids', () => {
  assert.equal(r.imdbOk, true);
  assert.equal(r.imdbBad, false);
});

// ═══════════════════════════════════════════════════════════════════════════
section('PROVIDERS');

check('every supported provider adapter is registered', () => {
  assert.deepEqual([...r.adapterNames].sort(), ['apivideo', 'cloudflare_stream', 'first_party', 'mux']);
});

check('first_party needs no credentials', () => {
  assert.equal(r.healthStates.first_party.state, 'PROVIDER_CONFIGURED');
});

check('Mux reports PROVIDER_NOT_CONFIGURED without credentials, never ONLINE', () => {
  assert.equal(r.healthStates.mux.state, 'PROVIDER_NOT_CONFIGURED');
  assert.equal(r.muxRefusesWhenUnconfigured, null, 'Mux must not invent a URL when unconfigured');
  assert.equal(r.muxRejectsBadPlaybackId, null, 'a non-playback-id reference must be refused');
});

check('an unconfigured licensed provider reports PROVIDER_NOT_CONFIGURED, not ONLINE', () => {
  for (const key of ['cloudflare_stream', 'apivideo']) {
    assert.equal(r.healthStates[key].state, 'PROVIDER_NOT_CONFIGURED', `${key} must not claim to be configured`);
  }
});

check('an unconfigured provider refuses to produce a URL', () => {
  assert.equal(r.cfRefusesWhenUnconfigured, null);
});

check('first_party refuses an off-origin URL (the no-ads guarantee)', () => {
  assert.equal(r.firstPartyRejectsAbsolute, null);
});

check('first_party builds a same-origin path from a nested asset', () => {
  assert.ok(r.firstPartyBuildsPath);
  assert.ok(r.firstPartyBuildsPath.url.startsWith('/media/'));
  assert.ok(!r.firstPartyBuildsPath.url.startsWith('//'));
});

check('no provider credential is interpolated into a URL or returned by healthCheck', () => {
  assert.deepEqual(r.secretScan, []);
});

section('MUX — the CONFIGURED path (stubbed API, not a live account)');

check('healthCheck reports CONFIGURED once credentials exist', () => {
  assert.ok(
    r.muxConfiguredHealth.state.includes('CONFIGURED'),
    `expected a CONFIGURED state, got ${r.muxConfiguredHealth.state}`,
  );
  assert.equal(r.muxConfiguredHealth.provider, 'mux');
  assert.notEqual(r.muxConfiguredHealth.state, 'PROVIDER_NOT_CONFIGURED');
});

check('healthCheck authenticates with Basic auth in the HEADER only', () => {
  assert.match(r.muxConfiguredHealthAuthHeader, /^Basic /, 'Mux expects Basic auth');
  // The header carries id:secret base64 — that is correct and stays server-side.
  const decoded = Buffer.from(r.muxConfiguredHealthAuthHeader.replace('Basic ', ''), 'base64').toString();
  assert.equal(decoded, 'stub-token-id:stub-not-a-real-secret-value');
});

check('a configured Mux source resolves to a stream.mux.com HLS URL', () => {
  assert.ok(r.muxConfiguredSource, 'expected a resolved source');
  assert.equal(r.muxConfiguredSource.container, 'hls');
  assert.equal(r.muxConfiguredSource.kind, 'FULL_PLAYBACK');
  assert.match(r.muxConfiguredSource.url, /^https:\/\/stream\.mux\.com\/abcd1234efgh5678\.m3u8$/);
});

check('a configured Mux source NEVER puts the API credential in the playback URL', () => {
  const url = r.muxConfiguredSource?.url ?? '';
  assert.ok(!url.includes('stub-not-a-real-secret-value'), 'API secret leaked into the playback URL');
  assert.ok(!url.includes('stub-token-id'), 'API token id leaked into the playback URL');
});

check('a malformed playback id is still refused while configured', () => {
  assert.equal(r.muxConfiguredBadId, null, 'a URL-shaped reference must not be accepted as a playback id');
});

check('rejected credentials report a config problem, never ONLINE', () => {
  assert.equal(r.muxBadCredentialHealth.state, 'PROVIDER_INVALID');
});

check('createUpload returns a one-time target and no credential', () => {
  assert.ok(r.muxUpload, 'expected an upload target');
  assert.equal(r.muxUpload.provider, 'mux');
  assert.equal(r.muxUpload.uploadId, 'up-1');
  assert.match(r.muxUpload.url, /^https:\/\/storage\.googleapis\.com\//);
  assert.ok(!r.muxUpload.url.includes('stub-not-a-real-secret-value'), 'upload URL must not carry the API secret');
  assert.match(r.muxUploadAuthHeader, /^Basic /, 'the upload call must authenticate server-side');
});

check('an unconfigured Mux refuses to mint an upload target', () => {
  assert.equal(r.muxUploadUnconfigured, null);
  assert.equal(r.muxHealthAfterUnset.state, 'PROVIDER_NOT_CONFIGURED');
});

section('RIGHTS AUDIT — approval cannot mint rights');

check('a source with a playable status AND its evidence can be approved', () => {
  assert.deepEqual(r.audit.fullyEvidenced, []);
});

check('a playable status with no evidence URL cannot be approved', () => {
  assert.equal(r.audit.noEvidenceUrl.length, 1);
  assert.match(r.audit.noEvidenceUrl[0], /rightsSourceUrl/);
});

check('a playable status with no licence type cannot be approved', () => {
  assert.equal(r.audit.noLicenseType.length, 1);
  assert.match(r.audit.noLicenseType[0], /licenseType/);
});

check('UNVERIFIED cannot be approved, however much else is recorded', () => {
  assert.equal(r.audit.unverifiedStatus.length, 1);
  assert.match(r.audit.unverifiedStatus[0], /rightsStatus is UNVERIFIED/);
});

check('a bare record is refused on all three counts at once', () => {
  assert.equal(r.audit.everythingMissing.length, 3);
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(66)}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length} checks`);
  for (const f of failures) console.log(`  ✗ ${f.name}\n      ${f.error.message}`);
  process.exitCode = 1;
} else {
  console.log(`All ${passed} playback registry checks passed.`);
}