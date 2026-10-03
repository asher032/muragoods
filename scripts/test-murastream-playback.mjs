// Murastream playback contract tests.
//
//   node scripts/test-murastream-playback.mjs
//
// These pin the guarantees that are easy to regress and expensive to lose:
//
//   1. NO ADS — no ad-serving domain is reachable from playback code, and no
//      player markup embeds a third-party frame. The guarantee is structural:
//      only registered authorized sources can be returned, so there is no
//      filtering step that could be forgotten.
//   2. Authorization is enforced structurally, including at the last gate.
//   3. Catalog availability is never conflated with playback availability.
//   4. Episode addressing is exact — no nearest-episode fallback, and a movie
//      source can never satisfy a TV request.
//   5. Failures expose a reason code, never a secret or a stack trace.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, error: e });
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
function section(t) { console.log(`\n── ${t} ──`); }

/**
 * Source with comments and string literals removed.
 *
 * These tests assert that certain code is ABSENT. A comment explaining why
 * the ad-stripping proxy was deleted would otherwise read as the ad-stripping
 * proxy still being present — which is the same false positive as the test
 * passing forever after a real regression, in the other direction. Stripping
 * comments means only executable code is judged.
 */
function code(file) {
  const src = readFileSync(file, 'utf8');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}
// Root-level config is included deliberately. The scan used to cover only
// app/ and scripts/, which meant `next.config.ts` was never inspected — and
// `https://vidlink.pro` sat in script-src, connect-src and frame-src for
// months while every "no ad domain anywhere" check passed. The CSP is the
// browser-enforced half of the ad-free guarantee; a policy that quietly
// allowlists an ad host defeats the whole thing regardless of how correct the
// resolver is.
const ROOT_CONFIG = ['next.config.ts', 'middleware.ts', 'vercel.json']
  .filter((f) => existsSync(f));
const ALL_SOURCE = [...walk('app'), ...walk('scripts'), ...ROOT_CONFIG];

// ═══════════════════════════════════════════════════════════════════════════
section('No ads: no ad-serving domain is reachable from playback code');

// Every one of these is an unlicensed embed aggregator or ad network that
// previously appeared in the watch page and the ad-stripping proxy.
const FORBIDDEN = [
  'vidlink.pro', 'videasy.to', 'vidking.net', 'vidfast.pro',
  '111movies.com', '2embed.cc', 'multiembed.mov', 'vidsrc.to',
  'adsterra', 'llvpn', 'zvigrat', 'zvaufrpq', 'nviqolho', 't7cpbtd',
  'superextraextra', 'histats.com',
];

check('no ad network or aggregator domain remains anywhere in app/', () => {
  const hits = [];
  for (const file of ALL_SOURCE) {
    const src = readFileSync(file, 'utf8');
    for (const domain of FORBIDDEN) {
      if (src.includes(domain)) hits.push(`${file} → ${domain}`);
    }
  }
  assert.deepEqual(hits, [], `ad/aggregator references remain:\n      ${hits.join('\n      ')}`);
});

check('no ad host or embed aggregator is allowlisted in any security header', () => {
  const offenders = [];
  for (const file of ROOT_CONFIG) {
    const src = readFileSync(file, 'utf8');
    for (const domain of FORBIDDEN) {
      if (src.includes(domain)) offenders.push(`${file} → ${domain}`);
    }
  }
  assert.deepEqual(offenders, [],
    `an aggregator is allowlisted in a security header, which lets it run script/frame on our origin:\n      ${offenders.join('\n      ')}`);
});

check('the CSP allowlists no origin beyond our own and licensed trailers', () => {
  // The only external origins permitted anywhere in the policy, each with a
  // real reason:
  //   api.themoviedb.org     metadata (never a streaming provider)
  //   image.tmdb.org         catalog artwork
  //   api.tvmaze.com         episode metadata
  //   cdn.discordapp.com     Discord avatars
  //   i.ytimg.com            trailer thumbnails
  //   www.youtube-nocookie.com  licensed trailer embed only
  //   stream.mux.com            video host for assets in our authorized registry
  const allowed = [
    'api.themoviedb.org', 'image.tmdb.org', 'api.tvmaze.com',
    'cdn.discordapp.com', 'i.ytimg.com', 'www.youtube-nocookie.com',
    'stream.mux.com',
  ];
  const src = readFileSync('next.config.ts', 'utf8');
  const found = [...code('next.config.ts').matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  const unexpected = [...new Set(found)].filter((h) => !allowed.includes(h));
  assert.deepEqual(unexpected, [], `unexpected origin(s) in the CSP: ${unexpected.join(', ')}`);
});

check('media-src permits exactly one named external host, never a wildcard', () => {
  // The policy is assembled by array literal and join()'d at runtime, so the
  // directives must be parsed as individual quoted elements — a regex over the
  // source would find no ';' and swallow every following directive.
  //
  // This used to assert media-src allows NO external origin at all. That is no
  // longer true: Muragoods now streams authorized assets from its own Mux
  // account, and a CSP that blocked it would break real playback in the
  // browser. The replacement is STRICTER than "no third-party": it pins the
  // exact external set, so adding a second host — an ad host above all —
  // fails this check even though it is technically not "us" either.
  const src = readFileSync('next.config.ts', 'utf8');
  const directives = [...src.matchAll(/^\s*"([a-z-]+-src|default-src)\s([^"]*)"/gm)]
    .map((m) => ({ name: m[1], value: m[2].trim() }));
  assert.ok(directives.length >= 8, `expected a full CSP, found ${directives.length} directives`);

  const media = directives.find((d) => d.name === 'media-src');
  assert.ok(media, 'media-src must be declared');
  const external = media.value.split(/\s+/).filter((d) => d.startsWith('http'));
  assert.deepEqual(external, ['https://stream.mux.com'],
    `media-src external origins must be exactly the Mux video host, got: ${external.join(', ')}`);
  assert.ok(!media.value.includes('*'), 'media-src must never wildcard a scheme or host');
  assert.ok(media.value.includes("'self'"), "media-src must keep 'self' so our own files can play");
  assert.ok(media.value.includes('blob:'), 'media-src must keep blob: for MediaSource');

  // script-src is the one an ad host would abuse to run code on our origin.
  const script = directives.find((d) => d.name === 'script-src');
  assert.ok(script, 'script-src must be declared');
  const scriptExternal = script.value.split(/\s+/).filter((d) => d.startsWith('http'));
  assert.deepEqual(scriptExternal, [],
    `script-src must not allow any third-party origin: ${scriptExternal.join(', ')}`);
});

check('the ad-stripping proxy route is gone', () => {
  assert.equal(existsSync('app/api/murastream/proxy'), false,
    'the ad-stripping proxy must not exist — it existed only to defeat ads on unlicensed pages');
});

check('no ad-stripping or popup-blocking script is injected', () => {
  const offenders = ALL_SOURCE.filter((f) => {
    // This file names the banned patterns in order to assert their absence.
    if (f.includes('test-murastream-playback')) return false;
    return /ad[_-]?strip|popunder|window\.open\s*=\s*function|adblock-card|ad-shield/i.test(code(f));
  });
  assert.deepEqual(offenders, [], `ad-stripping code remains in: ${offenders.join(', ')}`);
});

check('the watch page embeds no third-party iframe for playback', () => {
  const src = readFileSync('app/murastream/watch/page.tsx', 'utf8');
  // A single youtube-nocookie trailer frame is allowed; anything whose src is
  // built from a provider list or a third-party host is not.
  const iframes = src.match(/<iframe[\s\S]{0,400}?src=\{([^}]*)\}/g) || [];
  for (const frame of iframes) {
    assert.ok(
      frame.includes('source.url'),
      `an iframe src must come from the resolver, not a literal: ${frame.slice(0, 120)}`,
    );
  }
});

check('the watch page contains no provider list', () => {
  const src = readFileSync('app/murastream/watch/page.tsx', 'utf8');
  assert.ok(!/const SOURCES|SOURCES\.filter|s\.getUrl/.test(src),
    'the watch page must not choose between providers — the resolver does');
});

// ═══════════════════════════════════════════════════════════════════════════
section('Authorization: only registered sources can be returned');

check('the resolver reads only from the authorized registry', () => {
  const src = readFileSync('app/lib/murastream/playback/resolver.ts', 'utf8');
  for (const fn of ['firstPartyMovie', 'firstPartyEpisode']) {
    assert.ok(src.includes(fn), `the resolver must resolve via ${fn}`);
  }
  assert.ok(!/https?:\/\/(?!localhost)/.test(src.replace(/TMDB_BASE.*/g, '')),
    'the resolver must not construct third-party playback URLs');
});

check('authorization is re-checked at the last gate before the player', () => {
  const src = readFileSync('app/lib/murastream/playback/validate.ts', 'utf8');
  assert.ok(src.includes('assertAuthorized'),
    'validateSource must re-verify authorization, not trust its caller');
});

check('a first-party source must be same-origin', () => {
  const src = readFileSync('app/lib/murastream/playback/authorized-sources.ts', 'utf8');
  assert.match(src, /startsWith\('\/'\)\s*&&\s*!source\.url\.startsWith\('\/\/'\)/,
    'first_party URLs must be same-origin, which is what removes third-party injection entirely');
});

check('licensed full playback is confined to HTTPS on an explicit host allowlist', () => {
  // This replaced 'a licensed source may never be FULL_PLAYBACK'. That rule was
  // correct while every licensed source was a third-party trailer, but it also
  // made it impossible to stream a film Muragoods genuinely holds rights to
  // from our own video host — the case this build exists to support.
  //
  // It is replaced by a NARROWER rule, not a blanket permission: full licensed
  // playback must be HTTPS, on a host named in a literal allowlist, with no
  // wildcard. Trailer/preview sources are unchanged.
  const src = readFileSync('app/lib/murastream/playback/authorized-sources.ts', 'utf8');
  assert.ok(src.includes("source.kind === 'TRAILER' || source.kind === 'PREVIEW'"),
    'trailers/previews must remain unconditionally permitted for licensed sources');
  assert.match(src, /LICENSED_FULL_PLAYBACK_HOSTS\s*=\s*\[[^\]]*stream\.mux\.com[^\]]*\]/,
    'the licensed full-playback host must be a literal allowlist containing the Mux host');
  assert.match(src, /url\.protocol === 'https:'/,
    'licensed full playback must require HTTPS');
  assert.ok(!/LICENSED_FULL_PLAYBACK_HOSTS\s*=\s*\[[^\]]*['"]\*['"]/.test(src),
    'the licensed host allowlist must never contain a wildcard');
});

check('only the two authorization classes exist', () => {
  const src = readFileSync('app/lib/murastream/playback/types.ts', 'utf8');
  assert.match(src, /type AuthorizationClass = 'first_party' \| 'licensed'/);
});

// ═══════════════════════════════════════════════════════════════════════════
section('Catalog availability is never playback availability');

check('all five states are defined', () => {
  const src = readFileSync('app/lib/murastream/playback/types.ts', 'utf8');
  for (const s of ['METADATA_AVAILABLE', 'SOURCE_AVAILABLE', 'PLAYABLE', 'TEMPORARILY_FAILED', 'UNAVAILABLE']) {
    assert.ok(src.includes(s), `missing state ${s}`);
  }
});

check('every non-PLAYABLE outcome carries a reason', () => {
  const src = readFileSync('app/lib/murastream/playback/types.ts', 'utf8');
  for (const r of ['SOURCE_NOT_FOUND', 'SOURCE_INVALID', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR',
    'EPISODE_NOT_FOUND', 'REGION_BLOCKED', 'SOURCE_NOT_AUTHORIZED', 'PLAYER_INCOMPATIBLE',
    'PLAYBACK_SERVICE_UNAVAILABLE', 'MEDIA_ID_INVALID', 'MEDIA_TYPE_MISMATCH']) {
    assert.ok(src.includes(r), `missing reason code ${r}`);
  }
});

check('every reason code has a safe user-facing message', () => {
  const src = readFileSync('app/lib/murastream/playback/types.ts', 'utf8');
  const block = src.slice(src.indexOf('REASON_MESSAGE'), src.indexOf('/**\n * Whether a Try Again'));
  for (const r of ['SOURCE_NOT_FOUND', 'PROVIDER_TIMEOUT', 'EPISODE_NOT_FOUND', 'REGION_BLOCKED',
    'SOURCE_NOT_AUTHORIZED', 'SOURCE_INVALID', 'PLAYBACK_SERVICE_UNAVAILABLE', 'INVALID_REQUEST']) {
    assert.ok(block.includes(`${r}:`), `no user-facing message for ${r}`);
  }
});

check('a title with metadata but no source reports METADATA_AVAILABLE', () => {
  const src = readFileSync('app/lib/murastream/playback/resolver.ts', 'utf8');
  assert.ok(src.includes("emptyResult('METADATA_AVAILABLE'"),
    'missing source must be an honest metadata state, not a fake availability');
});

check('the UI never claims Watch Now without a resolver answer', () => {
  const src = readFileSync('app/murastream/components/PlayButton.tsx', 'utf8');
  // "Watch Now" may only render on phase === 'ready' with a source.
  const ready = src.slice(src.indexOf("phase === 'ready'"));
  assert.ok(ready.includes('Watch Now'), 'Watch Now belongs on the ready branch');
  const loading = src.slice(src.indexOf("phase === 'loading'"), src.indexOf("phase === 'ready'"));
  assert.ok(!loading.includes('Watch Now'), 'must not show Watch Now while resolving');
  assert.ok(src.includes('View details'), 'titles without a source fall back to View details');
});

check('no raw "Watch Now" remains on a landing page', () => {
  // Comments describing the guarded behaviour are excluded; only rendered
  // text counts, so this fails if someone re-adds a literal button.
  const offenders = ['app/murastream/page.tsx', 'app/murastream/kdrama/page.tsx', 'app/murastream/genres/page.tsx']
    .filter((f) => /Watch Now/.test(code(f)));
  assert.deepEqual(offenders, [], `unguarded Watch Now in: ${offenders.join(', ')}`);
});

// ═══════════════════════════════════════════════════════════════════════════
section('TV resolution: real seasons and episodes');

check('no viewer-facing string leaks internal licensing wording', () => {
  // "No authorized source" is Muragoods' licensing posture, not something a
  // viewer can act on. It must not appear in any user-visible surface.
  const surfaces = [
    'app/lib/murastream/playback/types.ts',
    'app/lib/murastream/playback/client.ts',
    'app/murastream/components/PlaybackStatePanel.tsx',
    'app/murastream/watch/page.tsx',
  ];
  for (const f of surfaces) {
    const src = readFileSync(f, 'utf8');
    // A mention inside a comment explaining WHY the phrase is banned is fine;
    // a quoted string that would render is not.
    const rendered = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    assert.ok(!rendered.includes('No authorized source'),
      `${f} exposes "No authorized source" to a viewer`);
  }
});

check('the player offers Try Again only when a retry can change the answer', () => {
  const types = readFileSync('app/lib/murastream/playback/types.ts', 'utf8');
  assert.ok(types.includes('isRetryable'), 'retryability must be decided centrally');
  const fn = types.slice(types.indexOf('export function isRetryable'));
  // A permanently unplayable title must never be retryable.
  assert.ok(!fn.slice(0, fn.indexOf('}')).includes('SOURCE_NOT_FOUND'),
    'a title with no licensed source must not invite an endless retry');
  assert.ok(fn.includes('PROVIDER_TIMEOUT'), 'a timeout must be retryable');
});

check('every failure state offers a way forward', () => {
  const panel = readFileSync('app/murastream/components/PlaybackStatePanel.tsx', 'utf8');
  for (const state of ['failed', 'blocked', 'error']) {
    assert.ok(panel.includes(`${state}:`), `missing copy for the ${state} state`);
  }
  assert.ok(panel.includes('Try again'), 'a retry affordance must exist');
});

check('the movie path cannot receive season or episode', () => {
  // The API route now builds a strictly-validated request, and a movie that
  // arrives with season/episode is refused as MEDIA_TYPE_MISMATCH rather than
  // having the values quietly dropped.
  const route = readFileSync('app/api/murastream/playback/route.ts', 'utf8');
  assert.ok(route.includes('validateResolveParams'),
    'the route must validate before resolving');
  const req = readFileSync('app/lib/murastream/playback/request.ts', 'utf8');
  assert.ok(req.includes("mediaType: 'movie', tmdbId }"),
    'a movie request must be built without season or episode');
  assert.ok(req.includes('MEDIA_TYPE_MISMATCH'),
    'season/episode on a movie must be refused, not dropped');
  const clientSrc = readFileSync('app/lib/murastream/playback/client.ts', 'utf8');
  assert.ok(clientSrc.includes("if (mediaType === 'tv')"),
    'the client must not send season/episode for a movie');
});

check('episode resolution is an exact match, with no nearest-episode fallback', () => {
  const src = readFileSync('app/lib/murastream/playback/authorized-sources.ts', 'utf8');
  assert.ok(/\(e\.season \?\? 1\) === season/.test(src) && /\(e\.episode \?\? 1\) === episode/.test(src),
    'an episode source must match the requested season AND episode exactly');
});

check('the cache key includes season and episode', () => {
  const src = readFileSync('app/lib/murastream/playback/validate.ts', 'utf8');
  assert.match(src, /tv:\$\{tmdbId\}:S\$\{season \?\? 1\}E\$\{episode \?\? 1\}/,
    'caching S01E01 against S01E02 is the "wrong episode plays" bug');
});

check('episode switching drives the URL and forces a new resolution', () => {
  const src = readFileSync('app/murastream/watch/page.tsx', 'utf8');
  assert.ok(src.includes('season=${season}&episode=${nextEpisode}'),
    'selecting an episode must produce a new season/episode URL');
  const sw = readFileSync('app/murastream/components/EpisodeSwitcher.tsx', 'utf8');
  assert.ok(sw.includes('onSelect(ep.episodeNumber)'),
    'the switcher must pass the selected episode number');
});

check('a missing episode is distinguished from a missing series', () => {
  const src = readFileSync('app/lib/murastream/playback/resolver.ts', 'utf8');
  // The resolver must branch on whether the SERIES is known, not collapse
  // "unknown series" and "unknown episode" into one reason.
  assert.ok(src.includes("seriesKnown"), 'the resolver must distinguish a known series from an unknown one');
  assert.ok(src.includes("'EPISODE_NOT_FOUND'"),
    'a known series with a missing episode must name the episode as the failed step');
  assert.ok(src.includes("'SOURCE_NOT_REGISTERED'"),
    'an unknown series must say the source is not registered');
});

// ═══════════════════════════════════════════════════════════════════════════
section('Cache: temporary failures must heal');

check('the three cache states are defined with different lifetimes', () => {
  const src = readFileSync('app/lib/murastream/playback/validate.ts', 'utf8');
  for (const s of ['AVAILABLE', 'TEMPORARILY_FAILED', 'UNAVAILABLE']) {
    assert.ok(src.includes(s), `missing cache state ${s}`);
  }
});

check('a temporary failure is never served as a cached answer', () => {
  const src = readFileSync('app/lib/murastream/playback/validate.ts', 'utf8');
  assert.ok(src.includes("if (hit.state === 'TEMPORARILY_FAILED') return null"),
    'a blip must not be inherited as a permanent answer');
});

check('a temporary failure is cached as temporary', () => {
  const src = readFileSync('app/lib/murastream/playback/resolver.ts', 'utf8');
  assert.ok(src.includes("writeCache(key, 'TEMPORARILY_FAILED'"),
    'a temporary failure must be cached under the temporary state so it retries');
});

// ═══════════════════════════════════════════════════════════════════════════
section('Security: nothing internal reaches the user');

check('the API strips diagnostics from its response', () => {
  const src = readFileSync('app/api/murastream/playback/route.ts', 'utf8');
  const view = src.slice(src.indexOf('function publicView'), src.indexOf('export async function GET'));
  assert.ok(!view.includes('diagnostics'), 'diagnostics must not be serialized to the client');
});

check('no source is returned unless the status is PLAYABLE', () => {
  const src = readFileSync('app/api/murastream/playback/route.ts', 'utf8');
  assert.ok(src.includes("result.status === 'PLAYABLE' ? result.sources : []"),
    'sources must be gated on PLAYABLE');
});

check('the playback response is never cached by the browser or a CDN', () => {
  const src = readFileSync('app/api/murastream/playback/route.ts', 'utf8');
  assert.ok(src.includes("'Cache-Control': 'no-store'"),
    'an HTTP cache would resurrect a failure the resolver already recovered from');
});

check('playback logs redact secrets', () => {
  const src = readFileSync('app/lib/murastream/playback/log.ts', 'utf8');
  assert.ok(src.includes('[redacted]') && src.includes('[uri-redacted]'),
    'credential-shaped values must never reach a log line');
  assert.ok(/api[_-]?key|token|secret|password|authorization|bearer/i.test(src),
    'the redaction list must cover the common credential names');
});

check('the playback log has the diagnostic fields an operator needs', () => {
  const src = readFileSync('app/lib/murastream/playback/log.ts', 'utf8');
  for (const f of ['requestId', 'userId', 'mediaType', 'tmdbId', 'season', 'episode', 'reason', 'httpStatus', 'responseTime']) {
    assert.ok(src.includes(f), `missing log field ${f}`);
  }
});

check('the health endpoint is admin-only', () => {
  const src = readFileSync('app/api/murastream/playback/health/route.ts', 'utf8');
  assert.ok(src.includes('requireAdmin'), 'playback health must require an admin session');
});

check('health reports each component independently', () => {
  const src = readFileSync('app/api/murastream/playback/health/route.ts', 'utf8');
  for (const c of ['tmdb_metadata', 'movie_resolver', 'tv_resolver', 'episode_resolver',
    'source_validation', 'playback_api', 'player']) {
    assert.ok(src.includes(c), `health must report ${c} separately`);
  }
  assert.ok(src.includes("all.some((c) => c.status === 'OFFLINE')"),
    'overall status must be the worst component, not an average');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (failures.length) {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length} checks\n`);
  for (const f of failures) console.log(`  • ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log(`All ${passed} Murastream playback checks passed.`);