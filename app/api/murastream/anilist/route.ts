// Server-side anime API — AniList + TMDB cross-reference for correct IDs
// Ensures every anime result has a valid TMDB ID for video providers
import { NextRequest, NextResponse } from 'next/server';
import { searchAnime, getTopAnimeList, getSeasonalAnimeList, getAnimeByGenreList, getAnimeDetails } from '@/app/murastream/api/anime';

export const maxDuration = 30;

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

function getTmdbToken() {
  return process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY || '';
}

function getImgUrl(path: string | null, size = 'w500'): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

// Search TMDB for anime to get TMDB IDs
async function searchTmdbForAnime(query: string): Promise<Map<string, number>> {
  const token = getTmdbToken();
  if (!token) return new Map();

  try {
    const res = await fetch(
      `${TMDB_BASE}/search/tv?query=${encodeURIComponent(query)}&include_adult=false&language=en-US`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map<string, number>();
    for (const item of data.results || []) {
      const name = ((item.name || '') as string).toLowerCase().trim();
      if (name && item.id) map.set(name, item.id);
    }
    return map;
  } catch {
    return new Map();
  }
}

// Find best TMDB match for an anime title
function normalizeTitle(t: string): string {
  return t.toLowerCase().trim().replace(/[:\-\u2010-\u2015()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findTmdbId(title: string, romaji: string, english: string | null, tmdbMap: Map<string, number>): number | null {
  // Try English title first, then romaji
  const candidates = [english, title, romaji].filter((t): t is string => !!t).map(normalizeTitle);
  const tmdbEntries = Array.from(tmdbMap.entries()).map(([key, id]) => [normalizeTitle(key), id] as const);

  for (const candidate of candidates) {
    // Exact match
    for (const [normKey, id] of tmdbEntries) {
      if (normKey === candidate) return id;
    }
    // Partial match: candidate is prefix of TMDB title or vice versa
    for (const [normKey, id] of tmdbEntries) {
      if (normKey.startsWith(candidate) || candidate.startsWith(normKey)) return id;
      if (normKey.includes(candidate) || candidate.includes(normKey)) return id;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const q = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const genre = searchParams.get('genre') || '';
  const id = parseInt(searchParams.get('id') || '0', 10);

  try {
    switch (action) {
      case 'search': {
        if (!q.trim()) {
          return NextResponse.json({ results: [], pageInfo: { hasNextPage: false } });
        }

        // Get AniList results
        const result = await searchAnime(q.trim(), page);
        const anilistResults = result.results || [];

        // Cross-reference with TMDB to get correct IDs
        const tmdbMap = await searchTmdbForAnime(q.trim());

        const enriched = (anilistResults as Record<string, unknown>[]).map((item) => {
          const tmdbId = findTmdbId(
            item.title as string,
            item.romajiTitle as string || '',
            item.englishTitle as string | null,
            tmdbMap
          );

          return {
            ...item,
            // Use TMDB ID as primary ID so TV detail page and video providers work
            id: tmdbId || item.id,
            // Keep original IDs for reference
            anilistId: item.anilistId || item.id,
            malId: item.malId || null,
            tmdbId: tmdbId || null,
            // Mark source
            source: tmdbId ? 'tmdb+anilist' : 'anilist',
          };
        });

        return NextResponse.json({ results: enriched, pageInfo: result.pageInfo });
      }

      case 'top': {
        const results = await getTopAnimeList(page);
        return NextResponse.json({ results });
      }

      case 'seasonal': {
        const results = await getSeasonalAnimeList();
        return NextResponse.json({ results });
      }

      case 'genre': {
        if (!genre) {
          return NextResponse.json({ results: [] });
        }
        const results = await getAnimeByGenreList(genre, page);
        return NextResponse.json({ results });
      }

      case 'details': {
        if (!id) {
          return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }
        const result = await getAnimeDetails(id);
        if (!result) {
          return NextResponse.json({ error: 'Anime not found' }, { status: 404 });
        }
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[AniList API]', error);
    return NextResponse.json(
      { error: 'Anime service temporarily unavailable', details: String(error) },
      { status: 502 }
    );
  }
}
