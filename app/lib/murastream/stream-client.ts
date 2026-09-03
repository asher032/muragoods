// MuraStream — Client-Side Stream Resolver
// Runs in the browser to bypass Cloudflare bot protection on streaming APIs
// Adapted from Flickv4's StreamflixService

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

const VIDROCK_MAIN = 'https://vidrock.net';
const VIDROCK_KEY = new Uint8Array([
  0x7f, 0x3e, 0x9c, 0x2a, 0x8b, 0x5d, 0x1f, 0x4e,
  0x6a, 0x9c, 0x3b, 0x7d, 0x2e, 0x5f, 0x8a, 0x1c,
  0x4b, 0x6d, 0x9e, 0x2f, 0x5a, 0x8c, 0x1b, 0x4d,
  0x7e, 0x9f, 0x2a, 0x5c, 0x8b, 0x1d, 0x4e, 0x7f,
]);

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

export interface StreamSource {
  id: string;
  name: string;
  language?: string;
  kind: 'hls' | 'file';
  uri: string;
  headers: Record<string, string>;
  subtitles: { label: string; file: string }[];
  extractor: string;
}

function slugId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isEnglish(lang?: string, flag?: string): boolean {
  const l = String(lang || '').toLowerCase();
  const f = String(flag || '').toLowerCase();
  return l === 'english' || f === 'us';
}

function base64ToBytes(payload: string, urlSafe = false): Uint8Array {
  const normalized = urlSafe ? payload.replace(/-/g, '+').replace(/_/g, '/') : payload;
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function decryptAesGcm(payload: string, key: Uint8Array): Promise<string | null> {
  try {
    const packed = base64ToBytes(payload, true);
    if (packed.length < 28) return null;
    const nonce = packed.slice(0, 12);
    const ciphertextAndTag = packed.slice(12);
    const cryptoKey = await crypto.subtle.importKey('raw', key.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, ciphertextAndTag.buffer as ArrayBuffer);
    const url = bytesToUtf8(new Uint8Array(plain)).trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch { return null; }
}

async function decryptAesCbc(encLink: string, masterKey: string): Promise<string | null> {
  try {
    const decoded = bytesToUtf8(base64ToBytes(encLink));
    const [ivB64, ctB64] = decoded.split(':');
    if (!ivB64 || !ctB64) return null;
    const iv = base64ToBytes(ivB64);
    const ciphertext = base64ToBytes(ctB64);
    const keyBytes = new TextEncoder().encode(masterKey);
    const paddedKey = new Uint8Array(32);
    paddedKey.set(keyBytes.slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', paddedKey.buffer as ArrayBuffer, { name: 'AES-CBC' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv as unknown as BufferSource }, cryptoKey, ciphertext.buffer as ArrayBuffer);
    const url = bytesToUtf8(new Uint8Array(plain)).trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch { return null; }
}

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers }, signal: controller.signal });
  } finally { clearTimeout(timer); }
}

// ─── VidRock ────────────────────────────────────────────────
async function listVidrock(tmdbId: number, mediaType: string, season?: number, episode?: number): Promise<StreamSource[]> {
  const isTv = mediaType === 'tv' && season != null && episode != null;
  const apiUrl = isTv ? `${VIDROCK_MAIN}/api/tv/${tmdbId}/${season}/${episode}` : `${VIDROCK_MAIN}/api/movie/${tmdbId}`;
  const res = await timedFetch(apiUrl, { headers: { Referer: `${VIDROCK_MAIN}/`, Origin: VIDROCK_MAIN } });
  if (!res.ok) return [];
  const body = await res.json() as Record<string, { url?: string; type?: string; language?: string; flag?: string }>;
  if (!body || typeof body !== 'object') return [];

  const entries = Object.entries(body).sort(([, a], [, b]) => (isEnglish(b.language, b.flag) ? 1 : 0) - (isEnglish(a.language, a.flag) ? 1 : 0));
  const sources: StreamSource[] = [];
  for (const [name, data] of entries) {
    const packed = data?.url?.trim() || '';
    if (!packed) continue;
    const url = await decryptAesGcm(packed, VIDROCK_KEY);
    if (!url) continue;
    sources.push({
      id: `vidrock-${slugId(name)}`,
      name: `${name} (VidRock)`,
      language: data.language || undefined,
      kind: url.includes('.m3u8') ? 'hls' : 'file',
      uri: url,
      headers: { Referer: `${VIDROCK_MAIN}/`, Origin: VIDROCK_MAIN },
      subtitles: [],
      extractor: 'vidrock',
    });
  }
  return sources;
}

// ─── Videasy ────────────────────────────────────────────────
async function extractVideasy(tmdbId: number, title: string, year: string, imdb: string, mediaType: string, season?: number, episode?: number, serverName?: string, serverEndpoint?: string): Promise<StreamSource | null> {
  const titleEnc = encodeURIComponent(title);
  const url = mediaType === 'tv' && season != null && episode != null
    ? `${VIDEASY_API}/${serverEndpoint}/sources-with-title?title=${titleEnc}&mediaType=tv&year=${year}&tmdbId=${tmdbId}&imdbId=${imdb}&episodeId=${episode}&seasonId=${season}`
    : `${VIDEASY_API}/${serverEndpoint}/sources-with-title?title=${titleEnc}&mediaType=movie&year=${year}&tmdbId=${tmdbId}&imdbId=${imdb}`;

  const encRes = await timedFetch(url);
  if (!encRes.ok) return null;
  const encData = await encRes.text();

  const decRes = await timedFetch(VIDEASY_DEC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: encData, id: String(tmdbId) }),
  });
  if (!decRes.ok) return null;

  const decJson = await decRes.json() as { result?: string | { sources?: { url?: string }[]; subtitles?: { lang?: string; url?: string }[] } };
  const result = typeof decJson.result === 'string'
    ? JSON.parse(decJson.result) as { sources?: { url?: string }[]; subtitles?: { lang?: string; url?: string }[] }
    : decJson.result;

  const streamUrl = result?.sources?.[0]?.url;
  if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) return null;
  const subtitles = (result.subtitles ?? []).filter(t => t.url).map(t => ({ label: t.lang || 'Unknown', file: t.url as string }));

  return {
    id: `videasy-${slugId(serverName || 'unknown')}`,
    name: `${serverName} (Videasy)`,
    language: 'English',
    kind: serverName === 'Cypher' ? 'file' : 'hls',
    uri: streamUrl,
    headers: { Referer: 'https://player.videasy.net/', Origin: 'https://player.videasy.net' },
    subtitles,
    extractor: 'videasy',
  };
}

// ─── Vidzee ─────────────────────────────────────────────────
let vidzeeMasterKey = '';
async function getVidzeeMasterKey(): Promise<string | null> {
  if (vidzeeMasterKey) return vidzeeMasterKey;
  try {
    const res = await timedFetch(`${VIDZEE_CORE}/api-key`, { headers: { Origin: VIDZEE_PLAYER, Referer: `${VIDZEE_PLAYER}/` } });
    if (!res.ok) return null;
    const b64 = (await res.text()).trim();
    const data = base64ToBytes(b64);
    if (data.length < 28) return null;
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const ciphertext = data.slice(28);
    const keyHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(VIDZEE_PASS)));
    const cryptoKey = await crypto.subtle.importKey('raw', keyHash.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext); combined.set(tag, ciphertext.length);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, combined.buffer as ArrayBuffer);
    vidzeeMasterKey = bytesToUtf8(new Uint8Array(plain));
    return vidzeeMasterKey;
  } catch { return null; }
}

async function extractVidzee(tmdbId: number, season?: number, episode?: number, serverName?: string, serverIndex?: number): Promise<StreamSource | null> {
  const masterKey = await getVidzeeMasterKey();
  if (!masterKey) return null;
  const base = season != null && episode != null
    ? `${VIDZEE_PLAYER}/api/server?id=${tmdbId}&ss=${season}&ep=${episode}`
    : `${VIDZEE_PLAYER}/api/server?id=${tmdbId}`;
  const res = await timedFetch(`${base}&sr=${serverIndex}`, { headers: { Origin: VIDZEE_PLAYER, Referer: `${VIDZEE_PLAYER}/` } });
  if (!res.ok) return null;
  const json = await res.json() as { url?: { link?: string }[]; tracks?: { url?: string; lang?: string }[] };
  const encrypted = json.url?.[0]?.link;
  if (!encrypted) return null;
  const url = await decryptAesCbc(encrypted, masterKey);
  if (!url) return null;
  const subtitles = (json.tracks ?? []).filter(t => t.url).map(t => ({ label: t.lang || 'Unknown', file: t.url as string }));
  return {
    id: `vidzee-${slugId(serverName || 'unknown')}`,
    name: `${serverName} (Vidzee)`,
    language: 'English',
    kind: serverName === 'Duke' ? 'file' : 'hls',
    uri: url,
    headers: { Referer: VIDZEE_PLAYER, Origin: VIDZEE_PLAYER },
    subtitles,
    extractor: 'vidzee',
  };
}

// ─── Public API ─────────────────────────────────────────────
export async function resolveAllStreams(
  tmdbId: number, mediaType: string, title: string, year: string,
  season?: number, episode?: number,
): Promise<StreamSource[]> {
  const sources: StreamSource[] = [];

  // 1. VidRock (direct decryption)
  try {
    const vidrock = await listVidrock(tmdbId, mediaType, season, episode);
    sources.push(...vidrock);
  } catch (e) { console.log('VidRock error:', e); }

  // 2. Videasy (encrypted API + decrypt service)
  for (const s of VIDEASY_SERVERS) {
    if ('movieOnly' in s && s.movieOnly && mediaType !== 'movie') continue;
    try {
      const resolved = await extractVideasy(tmdbId, title, year, '', mediaType, season, episode, s.name, s.endpoint);
      if (resolved?.uri) sources.push(resolved);
    } catch (e) { console.log('Videasy error:', s.name, e); }
  }

  // 3. Vidzee (encrypted links)
  for (const s of VIDZEE_SERVERS) {
    try {
      const resolved = await extractVidzee(tmdbId, season, episode, s.name, s.index);
      if (resolved?.uri) sources.push(resolved);
    } catch (e) { console.log('Vidzee error:', s.name, e); }
  }

  return sources;
}
