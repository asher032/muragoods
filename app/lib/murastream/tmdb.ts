// MuraStream — TMDB API Service (server-side only)
// Adapted from Streambert's api.js for Next.js server routes

const TMDB_BASE = 'https://api.themoviedb.org/3';
export const IMG_BASE = 'https://image.tmdb.org/t/p';

export type TmdbImageSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';

export const imgUrl = (path: string | null, size: TmdbImageSize = 'w500'): string | null =>
  path ? `${IMG_BASE}/${size}${path}` : null;

// Server-side TMDB fetch with rate limiting
let inflight = 0;
const MAX_INFLIGHT = 4;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inflight < MAX_INFLIGHT) { inflight++; return Promise.resolve(); }
  return new Promise(resolve => waiters.push(resolve));
}

function releaseSlot() {
  inflight--;
  if (waiters.length > 0) { inflight++; waiters.shift()!(); }
}

// Simple in-memory cache (5 min TTL)
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function tmdbFetch(path: string, language = 'en-US'): Promise<Record<string, unknown>> {
  const sep = path.includes('?') ? '&' : '?';
  const localizedPath = `${path}${sep}language=${language}`;
  const cacheKey = localizedPath;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data as Record<string, unknown>;

  await acquireSlot();
  try {
    const token = process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY;
    if (!token) throw new Error('TMDB API token not configured');

    const res = await fetch(`${TMDB_BASE}${localizedPath}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 }, // cache for 5 min
    });

    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL });

    // Evict stale
    if (cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of cache) { if (now >= v.expiresAt) cache.delete(k); }
    }

    return data as Record<string, unknown>;
  } finally {
    releaseSlot();
  }
}

// ── Convenience methods ─────────────────────────────────────────────────────

export async function getTrending(mediaType: 'movie' | 'tv' = 'movie', timeWindow: 'day' | 'week' = 'week') {
  return tmdbFetch(`/trending/${mediaType}/${timeWindow}`);
}

export async function getPopular(mediaType: 'movie' | 'tv', page = 1) {
  return tmdbFetch(`/${mediaType}/popular?page=${page}`);
}

export async function getTopRated(mediaType: 'movie' | 'tv', page = 1) {
  return tmdbFetch(`/${mediaType}/top_rated?page=${page}`);
}

export async function getUpcoming(page = 1) {
  return tmdbFetch(`/movie/upcoming?page=${page}`);
}

export async function getMovieDetails(id: number) {
  return tmdbFetch(`/movie/${id}?append_to_response=credits,videos,similar,recommendations`);
}

export async function getTvDetails(id: number) {
  return tmdbFetch(`/tv/${id}?append_to_response=credits,videos,similar,recommendations`);
}

export async function searchMulti(query: string, page = 1) {
  return tmdbFetch(`/search/multi?query=${encodeURIComponent(query)}&page=${page}&include_adult=false`);
}

export async function searchByType(query: string, type: 'movie' | 'tv' | 'person', page = 1) {
  return tmdbFetch(`/search/${type}?query=${encodeURIComponent(query)}&page=${page}&include_adult=false`);
}

export async function getMovieCredits(id: number) {
  return tmdbFetch(`/movie/${id}/credits`);
}

export async function getTvSeasons(id: number, seasonNumber: number) {
  return tmdbFetch(`/tv/${id}/season/${seasonNumber}`);
}

export async function getGenreList(type: 'movie' | 'tv' = 'movie') {
  return tmdbFetch(`/genre/${type}/list`);
}

// ── AniList (anime metadata) ─────────────────────────────────────────────────

const ANILIST_API = 'https://graphql.anilist.co';

const ANILIST_QUERY = `
query ($search: String, $type: MediaType) {
  Media(search: $search, type: $type, sort: SEARCH_MATCH) {
    id
    title { romaji english native }
    description(asHtml: false)
    coverImage { extraLarge large }
    bannerImage
    genres
    averageScore
    episodes
    status
    season
    seasonYear
    studios(isMain: true) { nodes { name } }
    startDate { year month }
    relations {
      edges {
        relationType
        node {
          id
          type
          format
          title { romaji english }
          episodes
          startDate { year month }
          seasonYear
        }
      }
    }
  }
}`;

export async function searchAnilist(title: string) {
  try {
    const res = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: title, type: 'ANIME' } }),
    });
    const json = await res.json();
    return json?.data?.Media || null;
  } catch {
    return null;
  }
}

export function cleanAnilistDescription(desc: string | null): string | null {
  if (!desc) return desc;
  let clean = desc
    .split('<').map((chunk: string, i: number) => i === 0 ? chunk : chunk.slice(chunk.indexOf('>') + 1)).join('')
    .replace(/>/g, '')
    .replace(/\(Source:[^)]*\)/gi, '')
    .replace(/\bNote:[^\n]*/gi, '')
    .replace(/[\s\n]+$/, '').trim();
  return clean;
}

export function isAnimeContent(item: Record<string, unknown>, details?: Record<string, unknown>): boolean {
  const d = details || item;
  const lang = d.original_language as string;
  const countries = (d.origin_country as string[]) || [];
  const genreIds = (d.genre_ids as number[]) || ((d.genres as Array<{ id: number }>) || []).map(g => g.id);
  const hasAnimation = genreIds.includes(16);
  return hasAnimation && (lang === 'ja' || countries.includes('JP'));
}
