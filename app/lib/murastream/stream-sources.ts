// MuraStream — Streaming Source Resolver
// Adapted from Flickv4's StreamflixService
// Resolves TMDB IDs to actual m3u8/mp4 stream URLs from multiple providers

// ═══════════════════════════════════════════════════════════════
// VidRock — AES-GCM encrypted stream URLs
// ═══════════════════════════════════════════════════════════════

const VIDROCK_MAIN = 'https://vidrock.net';
const VIDROCK_KEY = new Uint8Array([
  0x7f, 0x3e, 0x9c, 0x2a, 0x8b, 0x5d, 0x1f, 0x4e,
  0x6a, 0x9c, 0x3b, 0x7d, 0x2e, 0x5f, 0x8a, 0x1c,
  0x4b, 0x6d, 0x9e, 0x2f, 0x5a, 0x8c, 0x1b, 0x4d,
  0x7e, 0x9f, 0x2a, 0x5c, 0x8b, 0x1d, 0x4e, 0x7f,
]);
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

// ═══════════════════════════════════════════════════════════════
// Videasy — Encrypted API endpoints
// ═══════════════════════════════════════════════════════════════

const VIDEASY_API = 'https://api.videasy.net';
const VIDEASY_DEC = 'https://enc-dec.app/api/dec-videasy';

const VIDEASY_SERVERS = [
  { name: 'Neon', endpoint: 'mb-flix' },
  { name: 'Yoru', endpoint: 'cdn', movieOnly: true },
  { name: 'Cypher', endpoint: 'downloader2' },
  { name: 'Sage', endpoint: '1movies' },
  { name: 'Breach', endpoint: 'm4uhd' },
  { name: 'Vyse', endpoint: 'hdmovie' },
] as const;

// ═══════════════════════════════════════════════════════════════
// Vidzee — AES-CBC encrypted URLs
// ═══════════════════════════════════════════════════════════════

const VIDZEE_PLAYER = 'https://player.vidzee.wtf';
const VIDZEE_CORE = 'https://core.vidzee.wtf';
const VIDZEE_PASS = '4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c';

const VIDZEE_SERVERS = [
  { name: 'Nflix', index: 0 },
  { name: 'Duke', index: 1 },
  { name: 'Glory', index: 2 },
  { name: 'Nazy', index: 3 },
  { name: 'Atlas', index: 4 },
  { name: 'Drag', index: 5 },
  { name: 'Achilles', index: 6 },
] as const;

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface StreamSource {
  id: string;
  name: string;
  language?: string;
  kind: 'hls' | 'file';
  uri: string;
  headers: Record<string, string>;
  subtitles: { label: string; file: string }[];
  extractor: 'vidrock' | 'videasy' | 'vidzee';
}

export interface StreamRequest {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title?: string;
  year?: string;
}

// ═══════════════════════════════════════════════════════════════
// Crypto helpers (Web Crypto API — works in Node.js)
// ═══════════════════════════════════════════════════════════════

function base64ToBytes(payload: string, urlSafe = false): Uint8Array {
  const normalized = urlSafe
    ? payload.replace(/-/g, '+').replace(/_/g, '/')
    : payload;
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = Buffer.from(padded, 'base64');
  return new Uint8Array(binary);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('utf-8');
}

async function decryptAesGcm(
  payload: string,
  key: Uint8Array,
): Promise<string | null> {
  try {
    const packed = base64ToBytes(payload, true);
    if (packed.length < 28) return null;
    const nonce = packed.slice(0, 12);
    const ciphertextAndTag = packed.slice(12);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', key.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      cryptoKey,
      ciphertextAndTag.buffer as ArrayBuffer,
    );
    const url = bytesToUtf8(new Uint8Array(plain)).trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

async function decryptAesCbc(
  encLink: string,
  masterKey: string,
): Promise<string | null> {
  try {
    const decoded = bytesToUtf8(base64ToBytes(encLink));
    const [ivB64, ctB64] = decoded.split(':');
    if (!ivB64 || !ctB64) return null;
    const iv = base64ToBytes(ivB64);
    const ciphertext = base64ToBytes(ctB64);
    const keyBytes = new TextEncoder().encode(masterKey);
    const paddedKey = new Uint8Array(32);
    paddedKey.set(keyBytes.slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey(
      'raw', paddedKey.buffer as ArrayBuffer, { name: 'AES-CBC' }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: iv as unknown as BufferSource },
      cryptoKey,
      ciphertext.buffer as ArrayBuffer,
    );
    const url = bytesToUtf8(new Uint8Array(plain)).trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Fetch helper
// ═══════════════════════════════════════════════════════════════

async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...init.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function slugId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isEnglish(lang?: string, flag?: string): boolean {
  const l = String(lang || '').toLowerCase();
  const f = String(flag || '').toLowerCase();
  return l === 'english' || f === 'us';
}

// ═══════════════════════════════════════════════════════════════
// VidRock resolver
// ═══════════════════════════════════════════════════════════════

async function listVidrock(req: StreamRequest): Promise<StreamSource[]> {
  const { tmdbId, mediaType, season, episode } = req;
  const isTv = mediaType === 'tv' && season != null && episode != null;
  const apiUrl = isTv
    ? `${VIDROCK_MAIN}/api/tv/${tmdbId}/${season}/${episode}`
    : `${VIDROCK_MAIN}/api/movie/${tmdbId}`;

  const res = await timedFetch(apiUrl, {
    headers: { Referer: `${VIDROCK_MAIN}/`, Origin: VIDROCK_MAIN },
  });
  if (!res.ok) return [];

  const body = await res.json() as Record<string, { url?: string; type?: string; language?: string; flag?: string }>;
  if (!body || typeof body !== 'object') return [];

  const entries = Object.entries(body).sort(([, a], [, b]) => {
    const aEn = isEnglish(a.language, a.flag) ? 1 : 0;
    const bEn = isEnglish(b.language, b.flag) ? 1 : 0;
    return bEn - aEn;
  });

  const sources: StreamSource[] = [];
  for (const [name, data] of entries) {
    const packed = data?.url?.trim() || '';
    if (!packed) continue;
    const url = await decryptAesGcm(packed, VIDROCK_KEY);
    if (!url) continue;
    const kind = url.includes('.m3u8') ? 'hls' : 'file';
    sources.push({
      id: `vidrock-${slugId(name)}`,
      name: `${name} (VidRock)`,
      language: data.language || undefined,
      kind,
      uri: url,
      headers: { Referer: `${VIDROCK_MAIN}/`, Origin: VIDROCK_MAIN, 'User-Agent': USER_AGENT },
      subtitles: [],
      extractor: 'vidrock',
    });
  }
  return sources;
}

// ═══════════════════════════════════════════════════════════════
// Videasy resolver
// ═══════════════════════════════════════════════════════════════

function listVideasy(req: StreamRequest): { source: StreamSource; extractUrl: string }[] {
  const { tmdbId, mediaType, season, episode, title, year } = req;
  const titleEnc = encodeURIComponent(title || '');
  const imdb = '';

  return VIDEASY_SERVERS
    .filter(s => !('movieOnly' in s && s.movieOnly && mediaType !== 'movie'))
    .map(s => {
      const url = mediaType === 'tv' && season != null && episode != null
        ? `${VIDEASY_API}/${s.endpoint}/sources-with-title?title=${titleEnc}&mediaType=tv&year=${year || ''}&tmdbId=${tmdbId}&imdbId=${imdb}&episodeId=${episode}&seasonId=${season}`
        : `${VIDEASY_API}/${s.endpoint}/sources-with-title?title=${titleEnc}&mediaType=movie&year=${year || ''}&tmdbId=${tmdbId}&imdbId=${imdb}`;
      return {
        source: {
          id: `videasy-${slugId(s.name)}`,
          name: `${s.name} (Videasy)`,
          language: 'English',
          kind: s.name === 'Cypher' ? 'file' as const : 'hls' as const,
          uri: '',
          headers: { Referer: 'https://player.videasy.net/', Origin: 'https://player.videasy.net' },
          subtitles: [],
          extractor: 'videasy' as const,
        },
        extractUrl: url,
      };
    });
}

async function extractVideasy(
  source: StreamSource,
  extractUrl: string,
): Promise<StreamSource | null> {
  const tmdbId = new URL(extractUrl).searchParams.get('tmdbId') || '';

  const encRes = await timedFetch(extractUrl);
  if (!encRes.ok) return null;
  const encData = await encRes.text();

  const decRes = await timedFetch(VIDEASY_DEC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: encData, id: tmdbId }),
  });
  if (!decRes.ok) return null;

  const decJson = await decRes.json() as { result?: string | { sources?: { url?: string }[]; subtitles?: { lang?: string; url?: string }[] } };
  const result = typeof decJson.result === 'string'
    ? JSON.parse(decJson.result) as { sources?: { url?: string }[]; subtitles?: { lang?: string; url?: string }[] }
    : decJson.result;

  const url = result?.sources?.[0]?.url;
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const subtitles = (result.subtitles ?? [])
    .filter(t => t.url)
    .map(t => ({ label: t.lang || 'Unknown', file: t.url as string }));

  return { ...source, uri: url, subtitles };
}

// ═══════════════════════════════════════════════════════════════
// Vidzee resolver
// ═══════════════════════════════════════════════════════════════

let vidzeeMasterKey = '';

async function getVidzeeMasterKey(): Promise<string | null> {
  if (vidzeeMasterKey) return vidzeeMasterKey;
  try {
    const res = await timedFetch(`${VIDZEE_CORE}/api-key`, {
      headers: { Origin: VIDZEE_PLAYER, Referer: `${VIDZEE_PLAYER}/` },
    });
    if (!res.ok) return null;
    const b64 = (await res.text()).trim();
    const data = base64ToBytes(b64);
    if (data.length < 28) return null;
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const ciphertext = data.slice(28);
    const keyHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(VIDZEE_PASS))
    );
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyHash.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt'],
    );
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      combined.buffer as ArrayBuffer,
    );
    vidzeeMasterKey = bytesToUtf8(new Uint8Array(plain));
    return vidzeeMasterKey;
  } catch {
    return null;
  }
}

function listVidzee(req: StreamRequest): { source: StreamSource; extractUrl: string }[] {
  const { tmdbId, mediaType, season, episode } = req;
  const base = mediaType === 'tv' && season != null && episode != null
    ? `${VIDZEE_PLAYER}/api/server?id=${tmdbId}&ss=${season}&ep=${episode}`
    : `${VIDZEE_PLAYER}/api/server?id=${tmdbId}`;

  return VIDZEE_SERVERS.map(s => ({
    source: {
      id: `vidzee-${slugId(s.name)}`,
      name: `${s.name} (Vidzee)`,
      language: 'English',
      kind: s.name === 'Duke' ? 'file' as const : 'hls' as const,
      uri: '',
      headers: { Referer: VIDZEE_PLAYER, Origin: VIDZEE_PLAYER, 'User-Agent': USER_AGENT },
      subtitles: [],
      extractor: 'vidzee' as const,
    },
    extractUrl: `${base}&sr=${s.index}`,
  }));
}

async function extractVidzee(
  source: StreamSource,
  extractUrl: string,
): Promise<StreamSource | null> {
  const masterKey = await getVidzeeMasterKey();
  if (!masterKey) return null;

  const res = await timedFetch(extractUrl, {
    headers: { Origin: VIDZEE_PLAYER, Referer: `${VIDZEE_PLAYER}/` },
  });
  if (!res.ok) return null;

  const json = await res.json() as { url?: { link?: string }[]; tracks?: { url?: string; lang?: string }[] };
  const encrypted = json.url?.[0]?.link;
  if (!encrypted) return null;

  const url = await decryptAesCbc(encrypted, masterKey);
  if (!url) return null;

  const subtitles = (json.tracks ?? [])
    .filter(t => t.url)
    .map(t => ({ label: t.lang || 'Unknown', file: t.url as string }));

  return { ...source, uri: url, subtitles };
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

export async function listAllSources(req: StreamRequest): Promise<StreamSource[]> {
  const sources: StreamSource[] = [];

  // VidRock (direct URLs)
  try {
    const vidrock = await listVidrock(req);
    sources.push(...vidrock);
  } catch { /* ignore */ }

  // Videasy (needs extraction)
  const videasyList = listVideasy(req);
  for (const v of videasyList) {
    try {
      const resolved = await extractVideasy(v.source, v.extractUrl);
      if (resolved?.uri) sources.push(resolved);
    } catch { /* ignore */ }
  }

  // Vidzee (needs extraction)
  const vidzeeList = listVidzee(req);
  for (const v of vidzeeList) {
    try {
      const resolved = await extractVidzee(v.source, v.extractUrl);
      if (resolved?.uri) sources.push(resolved);
    } catch { /* ignore */ }
  }

  return sources;
}

export async function resolveFirstSource(req: StreamRequest): Promise<StreamSource | null> {
  const sources = await listAllSources(req);
  return sources.find(s => !!s.uri) ?? null;
}
