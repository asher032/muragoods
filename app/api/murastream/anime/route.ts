// MuraStream v2 — Jikan (MyAnimeList) API Proxy
// Provides anime-specific data: top anime, seasonal, search, schedule
import { NextRequest, NextResponse } from 'next/server';

// Allow 30s for Jikan (it can be slow)
export const maxDuration = 30;

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

function getImgUrl(path: string | null, size = 'w500'): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

// Jikan fetch with User-Agent and shorter retries
async function jikanFetch(path: string, retries = 2): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout per attempt
      const res = await fetch(`${JIKAN_BASE}${path}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MuraStream/2.0 (muragoods.vercel.app)',
        },
        signal: controller.signal,
        next: { revalidate: 600 }, // Cache 10 minutes
      });
      clearTimeout(timeout);
      if (res.status === 429 || res.status === 504) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`Jikan ${res.status}`);
      return res.json();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw new Error('Jikan failed');
}

// TMDB fallback: get anime from TMDB (genre 16 = Animation, filter by Japanese)
async function tmdbAnimeFallback(limit: number): Promise<unknown[]> {
  const token = process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY;
  if (!token) return [];

  try {
    // Fetch trending + popular TV, filter for Japanese animation
    const [trendRes, popRes] = await Promise.allSettled([
      fetch(`${TMDB_BASE}/trending/tv/week?language=en-US`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 600 },
      }),
      fetch(`${TMDB_BASE}/tv/popular?page=1&language=en-US`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 600 },
      }),
    ]);

    const allItems: Record<string, unknown>[] = [];
    for (const r of [trendRes, popRes]) {
      if (r.status === 'fulfilled' && r.value.ok) {
        const data = await r.value.json();
        allItems.push(...(data.results || []));
      }
    }

    // Filter: genre 16 (Animation) + Japanese language
    const anime = allItems
      .filter(item => {
        const genres = (item.genre_ids as number[]) || [];
        return genres.includes(16) && item.original_language === 'ja';
      })
      .map(item => ({
        id: Number(item.id),
        mediaType: 'tv',
        title: item.name || item.title || 'Untitled',
        originalTitle: item.original_name || item.name || '',
        posterPath: getImgUrl(item.poster_path as string | null),
        backdropPath: getImgUrl(item.backdrop_path as string | null, 'w1280'),
        voteAverage: item.vote_average || 0,
        year: (item.first_air_date as string || '').substring(0, 4),
        overview: item.overview || '',
        genreIds: item.genre_ids || [],
        genres: [],
        releaseDate: item.first_air_date || '',
        originalLanguage: 'ja',
        episodes: null,
        status: '',
        score: item.vote_average || 0,
        studios: [],
        licensors: [],
      }));

    // Deduplicate by id
    const seen = new Set<number>();
    return anime.filter(a => {
      const aid = Number(a.id);
      if (seen.has(aid)) return false;
      seen.add(aid);
      return true;
    }).slice(0, limit);
  } catch {
    return [];
  }
}

// Convert Jikan anime to our MediaItem shape
function toMediaItem(anime: Record<string, unknown>) {
  const images = anime.images as Record<string, Record<string, string>>;
  const jpg = images?.jpg || {};
  const image = jpg.image_url || jpg.large_image_url || '';

  const titles = (anime.titles as Array<Record<string, string>>) || [];
  const englishTitle = titles.find(t => t.type === 'English')?.title;
  const title = (anime.title_english as string) || englishTitle || (anime.title as string) || 'Untitled';

  const genres = (anime.genres as Array<Record<string, string>>) || [];
  const themes = (anime.themes as Array<Record<string, string>>) || [];
  const demographics = (anime.demographics as Array<Record<string, string>>) || [];
  const allGenres = [...genres, ...themes, ...demographics];

  // Detect sub/dub from genres, themes, and title
  const titleStr = (anime.title as string || '') + (anime.title_english as string || '');
  const hasSub = true; // Jikan anime are primarily sub
  const hasDub = allGenres.some(g =>
    g.name === 'Dub' || titleStr.includes('Dub') || titleStr.includes('(Dub)')
  );

  return {
    id: anime.mal_id,
    mediaType: 'tv',
    title,
    originalTitle: anime.title as string,
    posterPath: image || null,
    backdropPath: image || null,
    voteAverage: anime.score as number || 0,
    year: anime.year as number || null,
    overview: anime.synopsis as string || '',
    genreIds: allGenres.map(g => g.mal_id),
    genres: allGenres.map(g => g.name),
    releaseDate: (anime.aired as Record<string, string>)?.from?.substring(0, 10) || '',
    originalLanguage: 'ja',
    episodes: anime.episodes as number || null,
    status: anime.status as string || '',
    duration: anime.duration as string || '',
    rating: anime.rating as string || '',
    score: anime.score as number || 0,
    scoredBy: anime.scored_by as number || 0,
    rank: anime.rank as number || 0,
    popularity: anime.popularity as number || 0,
    members: anime.members as number || 0,
    favorites: anime.favorites as number || 0,
    source: anime.source as string || '',
    studios: ((anime.studios as Array<Record<string, string>>) || []).map(s => s.name),
    licensors: ((anime.licensors as Array<Record<string, string>>) || []).map(l => l.name),
    trailerUrl: ((anime.trailer as Record<string, string>)?.embed_url) || null,
    season: anime.season as string || null,
    broadcast: (anime.broadcast as Record<string, string>)?.string || null,
    malUrl: anime.url as string || null,
    // Sub/Dub info
    hasSub,
    hasDub,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 25);
  const page = searchParams.get('page') || '1';

  try {
    let data: unknown;

    switch (action) {
      case 'top':
        try {
          data = await jikanFetch(`/top/anime?limit=${limit}&page=${page}`);
        } catch {
          // Fallback to TMDB
          const fallback = await tmdbAnimeFallback(limit);
          data = { data: fallback };
        }
        break;

      case 'seasonal':
        try {
          data = await jikanFetch(`/seasons/now?limit=${limit}&page=${page}`);
        } catch {
          const fallback = await tmdbAnimeFallback(limit);
          data = { data: fallback };
        }
        break;

      case 'upcoming':
        try {
          data = await jikanFetch(`/seasons/upcoming?limit=${limit}&page=${page}`);
        } catch {
          data = { data: [] };
        }
        break;

      case 'trending':
        try {
          data = await jikanFetch(`/top/anime?filter=airing&limit=${limit}&page=${page}`);
        } catch {
          const fallback = await tmdbAnimeFallback(limit);
          data = { data: fallback };
        }
        break;

      case 'search': {
        const query = searchParams.get('q');
        if (!query) {
          return NextResponse.json({ error: 'Missing query parameter q' }, { status: 400 });
        }
        try {
          data = await jikanFetch(`/anime?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}&sfw=true`);
        } catch {
          // TMDB search fallback
          const token = process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY;
          if (token) {
            const res = await fetch(
              `${TMDB_BASE}/search/tv?query=${encodeURIComponent(query)}&page=${page}&language=en-US&with_original_language=ja`,
              { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } }
            );
            if (res.ok) {
              const tmdbData = await res.json();
              const animeItems = (tmdbData.results || [])
                .filter((item: Record<string, unknown>) =>
                  ((item.genre_ids as number[]) || []).includes(16)
                )
                .map((item: Record<string, unknown>) => ({
                  id: item.id,
                  mediaType: 'tv',
                  title: item.name || item.title || 'Untitled',
                  posterPath: getImgUrl(item.poster_path as string | null),
                  backdropPath: getImgUrl(item.backdrop_path as string | null, 'w1280'),
                  voteAverage: item.vote_average || 0,
                  year: (item.first_air_date as string || '').substring(0, 4),
                  overview: item.overview || '',
                  genreIds: item.genre_ids || [],
                  genres: [],
                  releaseDate: item.first_air_date || '',
                  originalLanguage: 'ja',
                  episodes: null,
                  score: item.vote_average || 0,
                  hasSub: true,
                  hasDub: false,
                }));
              data = { data: animeItems };
            } else {
              data = { data: [] };
            }
          } else {
            data = { data: [] };
          }
        }
        break;
      }

      case 'genre': {
        const genreId = searchParams.get('genre_id') || '1';
        try {
          data = await jikanFetch(`/anime?genres=${genreId}&order_by=score&sort=desc&limit=${limit}&page=${page}&sfw=true`);
        } catch {
          const fallback = await tmdbAnimeFallback(limit);
          data = { data: fallback };
        }
        break;
      }

      case 'schedule': {
        const day = searchParams.get('day') || 'monday';
        try {
          data = await jikanFetch(`/schedules?filter=${day}&limit=${limit}`);
        } catch {
          data = { data: [] };
        }
        break;
      }

      case 'details': {
        const malId = searchParams.get('mal_id');
        if (!malId) {
          return NextResponse.json({ error: 'Missing mal_id parameter' }, { status: 400 });
        }
        data = await jikanFetch(`/anime/${malId}/full`);
        break;
      }

      case 'recommendations': {
        const recMalId = searchParams.get('mal_id');
        if (!recMalId) {
          return NextResponse.json({ error: 'Missing mal_id parameter' }, { status: 400 });
        }
        data = await jikanFetch(`/anime/${recMalId}/recommendations`);
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Transform results to our MediaItem format
    const response = data as Record<string, unknown>;
    if (response.data && Array.isArray(response.data)) {
      response.data = response.data.map((item: Record<string, unknown>) => {
        let transformed: Record<string, unknown>;
        if (item.mediaType && item.posterPath !== undefined) {
          transformed = { ...item };
        } else {
          transformed = toMediaItem(item);
        }
        // Always ensure sub/dub flags exist
        if (transformed.hasSub === undefined) transformed.hasSub = true;
        if (transformed.hasDub === undefined) transformed.hasDub = false;
        return transformed;
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Anime API error:', error);
    return NextResponse.json({ error: 'Anime API error', details: String(error) }, { status: 502 });
  }
}
