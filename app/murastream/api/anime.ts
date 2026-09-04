// Unified Anime API — AniList primary, Jikan fallback
// All anime search/details go through this module

import { searchAniList, getTopAnime, getSeasonalAnime, getAnimeByGenre, getAnimeById } from './anilist';
import { searchJikan, getTopAnimeJikan, getSeasonalJikan } from './jikan';

// Simple in-memory cache (resets on cold start)
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Search ───────────────────────────────────────────
export async function searchAnime(query: string, page = 1) {
  const cacheKey = `search:${query}:${page}`;
  const cached = getCached<{ results: unknown[]; pageInfo: unknown }>(cacheKey);
  if (cached) return cached;

  // Try AniList first
  try {
    const result = await searchAniList(query, page);
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[Anime API] AniList search failed, trying Jikan:', err);
  }

  // Fallback to Jikan
  try {
    const result = await searchJikan(query, page);
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[Anime API] Jikan search also failed:', err);
    throw new Error('Anime search is temporarily unavailable. Please try again.');
  }
}

// ─── Top Anime ────────────────────────────────────────
export async function getTopAnimeList(page = 1) {
  const cacheKey = `top:${page}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return cached;

  try {
    const result = await getTopAnime(page);
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[Anime API] AniList top failed, trying Jikan:', err);
    try {
      const result = await getTopAnimeJikan(page);
      setCache(cacheKey, result);
      return result;
    } catch {
      return [];
    }
  }
}

// ─── Seasonal ─────────────────────────────────────────
export async function getSeasonalAnimeList() {
  const cacheKey = 'seasonal';
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const season = ['WINTER', 'SPRING', 'SUMMER', 'FALL'][Math.floor(now.getMonth() / 3)];
  const year = now.getFullYear();

  try {
    const result = await getSeasonalAnime(season, year);
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[Anime API] AniList seasonal failed, trying Jikan:', err);
    try {
      const result = await getSeasonalJikan();
      setCache(cacheKey, result);
      return result;
    } catch {
      return [];
    }
  }
}

// ─── Genre ────────────────────────────────────────────
export async function getAnimeByGenreList(genre: string, page = 1) {
  const cacheKey = `genre:${genre}:${page}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return cached;

  try {
    const result = await getAnimeByGenre(genre, page);
    setCache(cacheKey, result);
    return result;
  } catch {
    return [];
  }
}

// ─── By ID ────────────────────────────────────────────
export async function getAnimeDetails(id: number) {
  const cacheKey = `details:${id}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) return cached;

  // Try AniList ID first
  try {
    const result = await getAnimeById(id);
    if (result) {
      setCache(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.error('[Anime API] AniList details failed for id', id, err);
  }

  // If AniList didn't find it, this might be a MAL ID — try Jikan
  try {
    const { getAnimeByIdJikan } = await import('./jikan');
    const result = await getAnimeByIdJikan(id);
    if (result) {
      setCache(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.error('[Anime API] Jikan details also failed for id', id, err);
  }

  return null;
}
