// MuraStream — Jikan (MyAnimeList) API Proxy
// Provides anime-specific data: top anime, seasonal, search, schedule
import { NextRequest, NextResponse } from 'next/server';

const JIKAN_BASE = 'https://api.jikan.moe/v4';

// Rate-limit: Jikan allows 3 req/sec. We add a small delay between calls.
async function jikanFetch(path: string): Promise<unknown> {
  const res = await fetch(`${JIKAN_BASE}${path}`, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 300 }, // Cache for 5 minutes
  });
  if (!res.ok) throw new Error(`Jikan ${res.status}: ${path}`);
  return res.json();
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

  return {
    id: anime.mal_id,
    mediaType: 'tv', // anime is always TV
    title,
    originalTitle: anime.title as string,
    posterPath: image || null,
    backdropPath: image || null, // Jikan doesn't have separate backdrops
    voteAverage: anime.score as number || 0,
    year: anime.year as number || null,
    overview: anime.synopsis as string || '',
    genreIds: allGenres.map(g => g.mal_id),
    genres: allGenres.map(g => g.name),
    releaseDate: (anime.aired as Record<string, string>)?.from?.substring(0, 10) || '',
    originalLanguage: 'ja',
    // Extra anime-specific fields
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
        // Top anime sorted by score
        data = await jikanFetch(`/top/anime?filter=bypopularity&limit=${limit}&page=${page}`);
        break;

      case 'seasonal':
        // Currently airing anime
        data = await jikanFetch(`/seasons/now?limit=${limit}&page=${page}`);
        break;

      case 'upcoming':
        // Upcoming anime
        data = await jikanFetch(`/seasons/upcoming?limit=${limit}&page=${page}`);
        break;

      case 'trending':
        // Most popular currently airing
        data = await jikanFetch(`/top/anime?filter=airing&limit=${limit}&page=${page}`);
        break;

      case 'search': {
        const query = searchParams.get('q');
        if (!query) {
          return NextResponse.json({ error: 'Missing query parameter q' }, { status: 400 });
        }
        data = await jikanFetch(`/anime?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}&sfw=true`);
        break;
      }

      case 'genre': {
        const genreId = searchParams.get('genre_id') || '1'; // Default: Action
        data = await jikanFetch(`/anime?genres=${genreId}&order_by=score&sort=desc&limit=${limit}&page=${page}&sfw=true`);
        break;
      }

      case 'schedule': {
        const day = searchParams.get('day') || 'monday';
        data = await jikanFetch(`/schedules?filter=${day}&limit=${limit}`);
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
        return NextResponse.json({ error: 'Invalid action. Use: top, seasonal, upcoming, trending, search, genre, schedule, details, recommendations' }, { status: 400 });
    }

    // Transform results to our MediaItem format
    const response = data as Record<string, unknown>;
    if (response.data && Array.isArray(response.data)) {
      response.data = response.data.map((item: Record<string, unknown>) => toMediaItem(item));
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Jikan API error:', error);
    return NextResponse.json({ error: 'Anime API error', details: String(error) }, { status: 502 });
  }
}
