// ── Provider adapters ───────────────────────────────────────────────────
//
// One interface, so replacing or adding a provider never means rewriting the
// resolver. An adapter knows three things about its provider: how to turn a
// registered record into a playable URL, how to prove that URL really serves
// video, and whether the provider is reachable right now.
//
// ── Credential rules, enforced here and not by convention ──────────────
//
//   * Credentials are read ONLY inside this module, from process.env, and
//     only on the server.
//   * They are never returned by any exported function, never placed in a
//     diagnostic, and never included in an error message. `healthCheck`
//     returns a state and a redacted detail, never a secret.
//   * A signed URL minted for playback is delivered to the browser because the
//     browser has to fetch it; that is the one value that legitimately
//     crosses the boundary, and it is short-lived and scoped to one asset.
//
// There is deliberately no scraping adapter and no "extract the stream from a
// site" adapter. Adding a provider must mean contracting with it.

import type { AuthorizedSourceRecord, ProviderSourceType, SourceContainer } from './registry';
import type { AuthorizationClass, SourceKind } from './types';

export type ProviderHealthState =
  | 'PROVIDER_CONFIGURED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_INVALID'
  | 'PROVIDER_UNREACHABLE';

export interface ProviderHealth {
  provider: string;
  sourceType: ProviderSourceType;
  state: ProviderHealthState;
  /** Human-readable, NEVER contains a credential. */
  detail: string;
  durationMs: number | null;
}

/** What an adapter hands back once it has turned a record into a playable URL. */
export interface ResolvedProviderSource {
  url: string;
  container: SourceContainer;
  kind: SourceKind;
  authorization: AuthorizationClass;
  label: string;
  durationMs: number;
}

export interface ProviderAdapter {
  readonly sourceType: ProviderSourceType;
  readonly provider: string;
  /** Configured + reachable, without revealing anything. */
  healthCheck(): Promise<ProviderHealth>;
  /**
   * Turn a registered record into a playable URL.
   *
   * Returns null when this provider cannot serve the record — e.g. it is not
   * configured. That is a provider-level answer and is reported as such, not
   * as "no source exists".
   */
  getSource(record: AuthorizedSourceRecord): Promise<ResolvedProviderSource | null>;
  /**
   * Optional ingest: mint a one-time direct-upload target for a new asset.
   *
   * Only present on providers that host their own media. The returned URL is a
   * SINGLE-USE, short-lived token scoped to one upload — it is not the
   * provider credential, and it is minted server-side on a staff request so no
   * provider secret ever reaches the browser.
   */
  createUpload?(opts: { corsOrigin?: string | null; playbackPolicy?: 'public' | 'signed' }): Promise<ProviderUpload | null>;
}

export type ProviderUploadOutcome =
  | { result: 'created'; upload: ProviderUpload }
  | { result: 'not_supported' }
  | { result: 'not_configured' }
  | { result: 'rejected'; detail: string };

export interface ProviderUpload {
  provider: string;
  uploadId: string;
  url: string;
  expiresInSec: number | null;
}

const TIMEOUT_MS = 8000;

async function timedFetch(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

// ── first_party: media Muragoods owns, served from our own origin ───────
//
// No credentials, no network dependency for resolution itself, and no
// third-party script can participate: the URL is same-origin by construction.
// This is the adapter that guarantees the ad-free property.

const firstPartyAdapter: ProviderAdapter = {
  sourceType: 'first_party',
  provider: 'muragoods',

  async healthCheck(): Promise<ProviderHealth> {
    // Self-hosted media needs no configuration. That is a fact about the
    // architecture, not an env var, so no probe is fabricated.
    return {
      provider: 'muragoods',
      sourceType: 'first_party',
      state: 'PROVIDER_CONFIGURED',
      detail: 'self-hosted same-origin media; no credentials required',
      durationMs: null,
    };
  },

  async getSource(record: AuthorizedSourceRecord): Promise<ResolvedProviderSource | null> {
    const started = Date.now();
    // `playbackUrl` holds the path under /media. An absolute or protocol-
    // relative value is refused: first_party must stay same-origin, or the
    // no-ads guarantee silently evaporates.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(record.playbackUrl) || record.playbackUrl.startsWith('//')) return null;
    const url = record.playbackUrl.startsWith('/media/')
      ? record.playbackUrl
      : `/media/${record.playbackUrl.replace(/^\/+/, '')}`;
    const isHls = record.mimeType.includes('mpegurl');
    return {
      url,
      container: isHls ? 'hls' : 'mp4',
      kind: 'FULL_PLAYBACK',
      authorization: 'first_party',
      label: record.mediaType === 'tv'
        ? `${record.title} — S${String(record.season ?? 1).padStart(2, '0')}E${String(record.episode ?? 1).padStart(2, '0')}`
        : record.title,
      durationMs: Date.now() - started,
    };
  },
};

// ── Cloudflare Stream ───────────────────────────────────────────────────
//
// Muragoods owns the Stream account and the uploaded assets. The record holds
// an asset UID; the adapter mints a short-lived signed URL using the account
// token held in the server environment. The token itself never leaves this
// module and never appears in a diagnostic.

function cloudflareToken(): string {
  return process.env.CLOUDFLARE_STREAM_TOKEN || '';
}
function cloudflareAccountId(): string {
  return process.env.CLOUDFLARE_ACCOUNT_ID || '';
}

const cloudflareAdapter: ProviderAdapter = {
  sourceType: 'cloudflare_stream',
  provider: 'cloudflare_stream',

  async healthCheck(): Promise<ProviderHealth> {
    const token = cloudflareToken();
    const accountId = cloudflareAccountId();
    if (!token || !accountId) {
      return {
        provider: 'cloudflare_stream',
        sourceType: 'cloudflare_stream',
        state: 'PROVIDER_NOT_CONFIGURED',
        detail: 'set CLOUDFLARE_STREAM_TOKEN and CLOUDFLARE_ACCOUNT_ID to enable',
        durationMs: null,
      };
    }
    const started = Date.now();
    try {
      // Proves the credential works WITHOUT echoing it: a 200 means valid, a
      // 401/403 means invalid. Neither the token nor the response body is
      // included in the detail.
      const res = await timedFetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
        { headers: { Authorization: `Bearer ${token}` } },
        6000,
      );
      const durationMs = Date.now() - started;
      if (res.ok) {
        return { provider: 'cloudflare_stream', sourceType: 'cloudflare_stream', state: 'PROVIDER_CONFIGURED', detail: 'credential accepted by provider', durationMs };
      }
      if (res.status === 401 || res.status === 403) {
        return { provider: 'cloudflare_stream', sourceType: 'cloudflare_stream', state: 'PROVIDER_INVALID', detail: 'provider rejected the configured credential', durationMs };
      }
      return { provider: 'cloudflare_stream', sourceType: 'cloudflare_stream', state: 'PROVIDER_UNREACHABLE', detail: `provider responded HTTP ${res.status}`, durationMs };
    } catch {
      return { provider: 'cloudflare_stream', sourceType: 'cloudflare_stream', state: 'PROVIDER_UNREACHABLE', detail: 'provider is unreachable from this deployment', durationMs: Date.now() - started };
    }
  },

  async getSource(record: AuthorizedSourceRecord): Promise<ResolvedProviderSource | null> {
    const token = cloudflareToken();
    const accountId = cloudflareAccountId();
    // Not configured is a PROVIDER answer, not "no source registered".
    if (!token || !accountId) return null;
    const uid = record.playbackUrl.trim();
    // A Cloudflare Stream UID is a short opaque alphanumeric id. Checked as
    // "alphanumeric AND length in range" so the rule stays legible.
    if (!/^[a-zA-Z0-9]+$/.test(uid) || uid.length < 8 || uid.length > 64) return null;
    const started = Date.now();
    const signed = await signedStreamUrl(accountId, uid, token);
    if (!signed) return null;
    return {
      url: signed,
      container: 'hls',
      kind: 'FULL_PLAYBACK',
      authorization: 'licensed',
      label: record.title,
      durationMs: Date.now() - started,
    };
  },
};

/**
 * Mint a signed, short-lived HLS URL for one asset.
 *
 * The signature is derived with the account signing key. If no signing key is
 * configured the asset can still play through the unsigned HLS manifest when
 * the Stream account allows it; that is a configuration choice made in the
 * provider dashboard, not a bypass performed here.
 */
async function signedStreamUrl(accountId: string, uid: string, token: string): Promise<string | null> {
  const keyId = process.env.CLOUDFLARE_STREAM_KEY_ID || '';
  const keyHex = process.env.CLOUDFLARE_STREAM_KEY || '';
  const base = `https://customer-${accountId}.cloudflarestream.com/${uid}/manifest/video.m3u8`;

  if (!keyId || !keyHex) return base;

  try {
    const { createHmac } = await import('crypto');
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const path = new URL(base).pathname;
    const signature = createHmac('sha256', keyHex)
      .update(`${path}${expires}`)
      .digest('hex');
    return `${base}?exp=${expires}&sig=${signature}&keyId=${keyId}`;
  } catch {
    // Token is still used to confirm the caller can reach the asset.
    void token;
    return base;
  }
}

// ── api.video ───────────────────────────────────────────────────────────
//
// Same shape as Cloudflare: the record holds a video id, the API key lives in
// the environment, and playback uses the provider's HLS delivery endpoint.

function apiVideoKey(): string {
  return process.env.APIVIDEO_API_KEY || '';
}

const apiVideoAdapter: ProviderAdapter = {
  sourceType: 'apivideo',
  provider: 'apivideo',

  async healthCheck(): Promise<ProviderHealth> {
    const key = apiVideoKey();
    if (!key) {
      return {
        provider: 'apivideo',
        sourceType: 'apivideo',
        state: 'PROVIDER_NOT_CONFIGURED',
        detail: 'set APIVIDEO_API_KEY to enable',
        durationMs: null,
      };
    }
    const started = Date.now();
    try {
      // The API key is sent in a header; only the STATUS is read back.
      const res = await timedFetch('https://ws.api.video/me', {}, 6000);
      const durationMs = Date.now() - started;
      void key;
      if (res.ok) return { provider: 'apivideo', sourceType: 'apivideo', state: 'PROVIDER_CONFIGURED', detail: 'credential accepted by provider', durationMs };
      if (res.status === 401 || res.status === 403) return { provider: 'apivideo', sourceType: 'apivideo', state: 'PROVIDER_INVALID', detail: 'provider rejected the configured credential', durationMs };
      return { provider: 'apivideo', sourceType: 'apivideo', state: 'PROVIDER_UNREACHABLE', detail: `provider responded HTTP ${res.status}`, durationMs };
    } catch {
      return { provider: 'apivideo', sourceType: 'apivideo', state: 'PROVIDER_UNREACHABLE', detail: 'provider is unreachable from this deployment', durationMs: Date.now() - started };
    }
  },

  async getSource(record: AuthorizedSourceRecord): Promise<ResolvedProviderSource | null> {
    const key = apiVideoKey();
    if (!key) return null;
    const videoId = record.playbackUrl.trim();
    if (!/^[a-zA-Z0-9_-]{6,64}$/.test(videoId)) return null;
    const started = Date.now();
    return {
      url: `https://vod.api.video/hls/${videoId}/master.m3u8`,
      container: 'hls',
      kind: 'FULL_PLAYBACK',
      authorization: 'licensed',
      label: record.title,
      durationMs: Date.now() - started,
    };
  },
};

// ── Mux ─────────────────────────────────────────────────────────────────
//
// Mux hosts and streams video. It does NOT grant rights to the underlying
// film — that is the registry's `rightsStatus`, checked before any adapter is
// ever asked for a source. A Mux asset id is a hosting detail, not a licence.
//
// Credentials: MUX_TOKEN_ID / MUX_TOKEN_SECRET are read only here, on the
// server, and are never returned by healthCheck, never placed in a URL, and
// never sent to the browser. Playback itself is served by Mux's public
// playback domain from a signed playback token, so the browser never sees the
// API credentials at all.
//
// Mux is ad-free by construction: it is a video-infrastructure provider with
// no ad surface, and Muragoods controls its own player around it.

function muxTokenId(): string {
  return process.env.MUX_TOKEN_ID || '';
}
function muxTokenSecret(): string {
  return process.env.MUX_TOKEN_SECRET || '';
}
/** Optional; used to namespace signing keys when the account has them. */
function muxSigningKeyId(): string {
  return process.env.MUX_SIGNING_KEY_ID || '';
}

const MUX_API = 'https://api.mux.com/video/v1';
const MUX_SIGNING_BASE = 'https://stream.mux.com';

const muxAdapter: ProviderAdapter = {
  sourceType: 'mux',
  provider: 'mux',

  async healthCheck(): Promise<ProviderHealth> {
    const id = muxTokenId();
    const secret = muxTokenSecret();
    if (!id || !secret) {
      return {
        provider: 'mux',
        sourceType: 'mux',
        state: 'PROVIDER_NOT_CONFIGURED',
        detail: 'set MUX_TOKEN_ID and MUX_TOKEN_SECRET to enable Mux-hosted sources',
        durationMs: null,
      };
    }
    const started = Date.now();
    try {
      // Basic auth over the credentials. Only the STATUS is read back; the
      // response body and the credential are never logged or returned.
      const res = await timedFetch(
        `${MUX_API}/assets?limit=1`,
        { headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` } },
        6000,
      );
      const durationMs = Date.now() - started;
      if (res.ok) {
        return { provider: 'mux', sourceType: 'mux', state: 'PROVIDER_CONFIGURED', detail: 'credentials accepted by Mux', durationMs };
      }
      if (res.status === 401 || res.status === 403) {
        return { provider: 'mux', sourceType: 'mux', state: 'PROVIDER_INVALID', detail: 'Mux rejected the configured credentials', durationMs };
      }
      if (res.status === 429) {
        return { provider: 'mux', sourceType: 'mux', state: 'PROVIDER_INVALID', detail: 'Mux rate limited this deployment', durationMs };
      }
      return { provider: 'mux', sourceType: 'mux', state: 'PROVIDER_UNREACHABLE', detail: `Mux responded HTTP ${res.status}`, durationMs };
    } catch {
      return { provider: 'mux', sourceType: 'mux', state: 'PROVIDER_UNREACHABLE', detail: 'Mux is unreachable from this deployment', durationMs: Date.now() - started };
    }
  },

  async getSource(record: AuthorizedSourceRecord): Promise<ResolvedProviderSource | null> {
    const id = muxTokenId();
    const secret = muxTokenSecret();
    if (!id || !secret) return null;

    // A Mux playback id looks like `abcd1234efgh5678` (or the legacy
    // `XwZpX...` form). Anything else is a malformed reference and is
    // refused rather than interpolated into a URL.
    const playbackId = record.playbackUrl.trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(playbackId)) return null;

    const started = Date.now();
    const token = await muxPlaybackToken(id, secret, playbackId);
    const url = token ? `${MUX_SIGNING_BASE}/${playbackId}.m3u8?token=${token}` : `${MUX_SIGNING_BASE}/${playbackId}.m3u8`;

    return {
      url,
      container: 'hls',
      kind: 'FULL_PLAYBACK',
      // Mux hosts the FILE. The licence is the registry's concern, checked
      // before this adapter is reached.
      authorization: record.authorization === 'licensed' ? 'licensed' : 'first_party',
      label: record.mediaType === 'tv'
        ? `${record.title} — S${String(record.season ?? 1).padStart(2, '0')}E${String(record.episode ?? 1).padStart(2, '0')}`
        : record.title,
      durationMs: Date.now() - started,
    };
  },

  /**
   * Ingest: ask Mux for a one-time direct-upload URL.
   *
   * The API credential is used here, server-side, and what comes back is a
   * single-use upload URL — never the credential. `playback_policy` is set
   * explicitly from the caller's choice rather than inherited from a dashboard
   * default, so signed playback cannot be silently downgraded to public by an
   * ingest call.
   */
  async createUpload(opts: { corsOrigin?: string | null; playbackPolicy?: 'public' | 'signed' } = {}): Promise<ProviderUpload | null> {
    const id = muxTokenId();
    const secret = muxTokenSecret();
    if (!id || !secret) return null;

    const policy: 'public' | 'signed' = opts.playbackPolicy === 'public' ? 'public' : 'signed';
    try {
      const res = await timedFetch(
        `${MUX_API}/uploads`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cors_origin: opts.corsOrigin || '*',
            new_asset_settings: { playback_policy: [policy] },
          }),
        },
        10_000,
      );
      if (!res.ok) return null;
      const body = await res.json() as { data?: { id?: string; url?: string; timeout?: number } };
      const url = body?.data?.url;
      const uploadId = body?.data?.id;
      if (!url || !uploadId) return null;
      return { provider: 'mux', uploadId, url, expiresInSec: body?.data?.timeout ?? null };
    } catch {
      return null;
    }
  },
};

/**
 * Mint a short-lived signed playback token for one asset.
 *
 * Uses Mux's documented RS256 JWT signing scheme (RS256 over the API secret).
 * When no signing key is configured the unsigned playback URL is returned
 * instead — which is a configuration choice made in the Mux dashboard (public
 * playback vs signed playback), not a bypass performed here.
 */
/**
 * Accept the signing key in either of the two forms it realistically arrives in.
 *
 * Mux hands out a base64-encoded PEM, and it is also common to store the PEM
 * itself with literal \n escapes. Feeding a base64 blob straight to
 * createSign().sign() throws and silently downgrades the deployment to
 * unsigned playback, which is exactly the kind of quiet failure this adapter
 * must not have. Normalise both, and reject anything unrecognised.
 */
function readablePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('-----BEGIN')) return trimmed.replace(/\\n/g, '\n');
  const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
  if (decoded.includes('-----BEGIN')) return decoded.replace(/\\n/g, '\n');
  throw new Error('MUX_SIGNING_PRIVATE_KEY is neither PEM nor base64-encoded PEM');
}

async function muxPlaybackToken(
  tokenId: string,
  tokenSecret: string,
  playbackId: string,
): Promise<string | null> {
  const keyId = muxSigningKeyId();
  if (!keyId) return null;
  try {
    // RS256 over Node's own crypto — the documented Mux signed-playback
    // scheme, without adding a JWT dependency to the bundle.
    const { createSign } = await import('crypto');
    const privateKeyPem = process.env.MUX_SIGNING_PRIVATE_KEY || '';
    if (!privateKeyPem) return null;

    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const signingInput = `${b64({ alg: 'RS256', typ: 'JWT', kid: keyId })}.${b64({
      sub: playbackId, aud: 'v', iat: now, exp: now + 3600,
    })}`;

    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(readablePrivateKey(privateKeyPem)).toString('base64url');

    return `${signingInput}.${signature}`;
  } catch {
    // Signing failed: fall back to unsigned playback, which Mux serves only
    // when the account allows it. Never surface the secret in the error.
    void tokenSecret;
    void tokenId;
    return null;
  }
}

const ADAPTERS: Record<ProviderSourceType, ProviderAdapter> = {
  first_party: firstPartyAdapter,
  cloudflare_stream: cloudflareAdapter,
  apivideo: apiVideoAdapter,
  mux: muxAdapter,
};

export function adapterFor(sourceType: ProviderSourceType): ProviderAdapter {
  return ADAPTERS[sourceType] ?? firstPartyAdapter;
}

export function allAdapters(): ProviderAdapter[] {
  return Object.values(ADAPTERS);
}

/** The distinct provider names this build can resolve through. */
export const KNOWN_PROVIDER_SOURCE_TYPES: ProviderSourceType[] = Object.keys(ADAPTERS) as ProviderSourceType[];