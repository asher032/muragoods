import type { NextConfig } from "next";

// ── Content Security Policy ─────────────────────────────────────────────
//
// This policy is the browser-side half of Muragoods' ad-free guarantee.
//
// The guarantee has two halves, and both must hold:
//
//   1. STRUCTURAL — the resolver only ever returns same-origin first-party
//      media (see app/lib/murastream/playback/authorized-sources.ts). Nothing
//      outside the registered manifest can be resolved, so no third-party
//      player page is ever loaded.
//   2. ENFORCED — the browser refuses to execute script from, connect to, or
//      frame ANY host we have not explicitly allowlisted here.
//
// Half 1 alone is not enough. This policy previously allowlisted an unused
// third-party video aggregator in script-src, connect-src and frame-src.
// Nothing in the codebase used it — but the browser was still explicitly
// PERMITTED to run that host's JavaScript on our origin, beacon to it, and
// frame it. That is precisely the ad/popunder injection surface this policy
// exists to close: a third-party host that can run script on
// muragoods.vercel.app can serve ads, and no amount of resolver correctness
// prevents that. It was a leftover allowlist entry from an earlier
// architecture that used unlicensed embed aggregators.
//
// RULE: no ad network, embed aggregator or video host may ever be added to
// this policy. Every playable source is same-origin by design, so an
// aggregator has no legitimate reason to appear here. `scripts/
// test-murastream-playback.mjs` fails the build if one does.
//
// TMDB is allowlisted for metadata and artwork only. It is not a streaming
// provider and is never used as one.
//
// ── Still report-only ──────────────────────────────────────────────────
// The policy above is correct but currently delivered as
// `Content-Security-Policy-Report-Only`, so it reports violations without
// blocking them. That is deliberate and unchanged by this commit: it was a
// staged rollout, and flipping it needs a real browser pass. Two concrete
// blockers found while hardening it:
//
//   1. Narrowing img-src from `https:` to explicit hosts surfaced that Discord
//      avatars (cdn.discordapp.com) and trailer thumbnails (i.ytimg.com) are
//      genuinely used. Both are now listed, but an unverified flip risks a
//      blank page rather than a missing avatar.
//   2. A response of 200 from curl proves nothing about whether the BROWSER
//      can execute the bundle under this policy — only a browser can show that.
//
// Until someone loads the site in a real browser with the enforcing header and
// the console is clean, this stays report-only. The aggregator hole that
// motivated the change is already closed structurally and by CI, so the
// report-only window no longer contains the one entry that mattered.
const csp = [
  "default-src 'self'",
  // No third-party origins. 'unsafe-inline'/'unsafe-eval' remain because the
  // app's own inline bootstrap depends on them; they do not widen the origin
  // set, which is what an ad host would need.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // Artwork only, and only from hosts we actually use. This replaces
  // `https:`, which permitted an image from ANY host — an ad-pixel and
  // tracking surface as much as anything.
  //   image.tmdb.org   catalog artwork + trailers thumbnails
  //   cdn.discordapp.com  Discord avatars
  //   i.ytimg.com         trailer thumbnails
  "img-src 'self' data: blob: https://image.tmdb.org https://cdn.discordapp.com https://i.ytimg.com",
  // Same-origin media plus blob: for MediaSource. Our own /media files are
  // 'self'. stream.mux.com is the ONE external host permitted to supply a
  // playable stream: it is the video host for assets in our own authorized
  // registry, named explicitly rather than wildcarded, so no other host — and
  // in particular no ad host — can ever be a media source.
  "media-src 'self' blob: https://stream.mux.com",
  // Narrower than before: artwork only. Previously `https:` allowed ANY
  // host's image, which is a tracking and ad-pixel surface.
  // stream.mux.com is added for HLS: the manifest and its segments are fetched
  // over XHR/fetch, so connect-src governs them just as media-src does.
  "connect-src 'self' https://api.themoviedb.org https://api.tvmaze.com https://stream.mux.com",
  // 'self' is required or our own iframes break. youtube-nocookie is the ONLY
  // external frame, used exclusively for licensed TMDB trailers, which are
  // clearly labelled and never presented as an episode.
  "frame-src 'self' https://www.youtube-nocookie.com",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: csp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;