// MuraStream — Server-Side Stream Resolver
// Resolves TMDB IDs to actual m3u8/mp4 stream URLs via VidRock
// VidRock returns AES-GCM encrypted URLs that we decrypt server-side

const VIDROCK_MAIN = 'https://vidrock.net';
// AES-GCM key from Flickv4's StreamflixService
const STREAM_KEY = Buffer.from([
  0x7f, 0x3e, 0x9c, 0x2a, 0x8b, 0x5d, 0x1f, 0x4e,
  0x6a, 0x9c, 0x3b, 0x7d, 0x2e, 0x5f, 0x8a, 0x1c,
  0x4b, 0x6d, 0x9e, 0x2f, 0x5a, 0x8c, 0x1b, 0x4d,
  0x7e, 0x9f, 0x2a, 0x5c, 0x8b, 0x1d, 0x4e, 0x7f,
]);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// Use Node.js crypto for AES-GCM decryption
const nodeCrypto = require('crypto');

export interface StreamSource {
  id: string;
  name: string;
  language?: string;
  kind: 'hls' | 'file';
  uri: string;
  headers: Record<string, string>;
  subtitles: { label: string; file: string }[];
}

// ─── Crypto helpers (Node.js native) ──────────────────────────

function base64ToBytes(payload: string, urlSafe = false): Buffer {
  const normalized = urlSafe ? payload.replace(/-/g, '+').replace(/_/g, '/') : payload;
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function decryptAesGcm(payload: string): string | null {
  try {
    const packed = base64ToBytes(payload, true);
    if (packed.length < 28) return null;
    const nonce = packed.subarray(0, 12);
    const ciphertextAndTag = packed.subarray(12);
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', STREAM_KEY, nonce);
    decipher.setAuthTag(ciphertextAndTag.subarray(-16));
    const decrypted = Buffer.concat([
      decipher.update(ciphertextAndTag.subarray(0, -16)),
      decipher.final(),
    ]);
    const url = decrypted.toString('utf-8').trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

// ─── VidRock resolver ──────────────────────────────────────

interface VidRockEntry {
  url?: string | null;
  type?: string | null;
  language?: string | null;
  flag?: string | null;
}
type VidRockResponse = Record<string, VidRockEntry>;

function isEnglish(lang?: string | null, flag?: string | null): boolean {
  const l = String(lang || '').toLowerCase();
  const f = String(flag || '').toLowerCase();
  return l === 'english' || f === 'us';
}

function slugId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function resolveVidRock(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  season?: number,
  episode?: number,
): Promise<StreamSource[]> {
  const isTv = mediaType === 'tv' && season != null && episode != null;
  const apiUrl = isTv
    ? `${VIDROCK_MAIN}/api/tv/${tmdbId}/${season}/${episode}`
    : `${VIDROCK_MAIN}/api/movie/${tmdbId}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    console.log(`[VidRock] Fetching: ${apiUrl}`);
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': `${VIDROCK_MAIN}/`,
        'Origin': VIDROCK_MAIN,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.log(`[VidRock] HTTP ${res.status}`);
      return [];
    }

    const body: VidRockResponse = await res.json();
    if (!body || typeof body !== 'object') return [];

    // Sort: English sources first
    const entries = Object.entries(body).sort(([, a], [, b]) => {
      const aEn = isEnglish(a.language, a.flag) ? 1 : 0;
      const bEn = isEnglish(b.language, b.flag) ? 1 : 0;
      return bEn - aEn;
    });

    const sources: StreamSource[] = [];
    for (const [name, data] of entries) {
      const packed = (data?.url || '').trim();
      if (!packed) continue;

      const url = decryptAesGcm(packed);
      if (!url) {
        console.log(`[VidRock] Failed to decrypt: ${name}`);
        continue;
      }

      const kind = url.includes('.m3u8') ? 'hls' : 'file';
      sources.push({
        id: `vidrock-${slugId(name)}`,
        name: `${name} (VidRock)`,
        language: data.language || undefined,
        kind,
        uri: url,
        headers: {
          'Referer': `${VIDROCK_MAIN}/`,
          'Origin': VIDROCK_MAIN,
          'User-Agent': USER_AGENT,
        },
        subtitles: [],
      });
      console.log(`[VidRock] Resolved: ${name} -> ${url.substring(0, 80)}...`);
    }

    console.log(`[VidRock] Total sources: ${sources.length}`);
    return sources;
  } catch (error) {
    console.error('[VidRock] Error:', error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
