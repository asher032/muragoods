// MuraStream — TMDB Proxy API Route
// Server-side proxy to keep the TMDB API key secure
import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

function getImgUrl(path: string | null, size = 'w500'): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

// Format TMDB results to a consistent shape
function formatResult(item: Record<string, unknown>) {
  const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
  const title = (item.title as string) || (item.name as string) || 'Untitled';
  const releaseDate = (item.release_date as string) || (item.first_air_date as string) || '';
  const year = releaseDate ? releaseDate.substring(0, 4) : '';

  return {
    id: item.id,
    mediaType,
    title,
    originalTitle: (item.original_title as string) || (item.original_name as string) || title,
    overview: item.overview,
    posterPath: getImgUrl(item.poster_path as string | null),
    backdropPath: getImgUrl(item.backdrop_path as string | null, 'w1280'),
    voteAverage: item.vote_average,
    voteCount: item.vote_count,
    releaseDate,
    year,
    genreIds: item.genre_ids,
    genres: item.genres,
    popularity: item.popularity,
    originalLanguage: item.original_language,
    originCountry: item.origin_country,
    // TV-specific
    name: item.name,
    firstAirDate: item.first_air_date,
    // Movie-specific
    runtime: item.runtime,
    status: item.status,
    tagline: item.tagline,
    budget: item.budget,
    revenue: item.revenue,
    productionCompanies: item.production_companies,
  };
}

// Format credits
function formatCredits(credits: Record<string, unknown>) {
  const cast = ((credits.cast as Array<Record<string, unknown>>) || []).slice(0, 15).map(c => ({
    id: c.id,
    name: c.name,
    character: c.character,
    profilePath: getImgUrl(c.profile_path as string | null, 'w185'),
    order: c.order,
  }));

  const crew = ((credits.crew as Array<Record<string, unknown>>) || []).filter(
    (c: Record<string, unknown>) => ['Director', 'Writer', 'Producer'].includes(c.job as string)
  ).slice(0, 5).map(c => ({
    id: c.id,
    name: c.name,
    job: c.job,
    profilePath: getImgUrl(c.profile_path as string | null, 'w185'),
  }));

  return { cast, crew };
}

// Format videos (trailers)
function formatVideos(videos: Record<string, unknown>) {
  const results = (videos.results as Array<Record<string, unknown>>) || [];
  return results
    .filter((v: Record<string, unknown>) => v.site === 'YouTube')
    .map((v: Record<string, unknown>) => ({
      key: v.key,
      name: v.name,
      type: v.type,
      site: v.site,
      url: `https://www.youtube.com/embed/${v.key}`,
    }))
    .slice(0, 5);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const language = searchParams.get('lang') || 'en-US';
  const page = searchParams.get('page') || '1';

  const token = process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY;
  if (!token) {
    return NextResponse.json({ error: 'TMDB API token not configured' }, { status: 500 });
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    let url = '';
    let format: 'list' | 'detail' = 'list';

    switch (action) {
      case 'trending':
        url = `/trending/${searchParams.get('type') || 'movie'}/${searchParams.get('window') || 'week'}?language=${language}`;
        break;
      case 'popular':
        url = `/${searchParams.get('type') || 'movie'}/popular?page=${page}&language=${language}`;
        break;
      case 'top_rated':
        url = `/${searchParams.get('type') || 'movie'}/top_rated?page=${page}&language=${language}`;
        break;
      case 'upcoming':
        url = `/movie/upcoming?page=${page}&language=${language}`;
        break;
      case 'movie_details':
        url = `/movie/${searchParams.get('id')}?append_to_response=credits,videos,similar,recommendations&language=${language}`;
        format = 'detail';
        break;
      case 'tv_details':
        url = `/tv/${searchParams.get('id')}?append_to_response=credits,videos,similar,recommendations&language=${language}`;
        format = 'detail';
        break;
      case 'tv_season':
        url = `/tv/${searchParams.get('id')}/season/${searchParams.get('season')}?language=${language}`;
        break;
      case 'genres':
        url = `/genre/${searchParams.get('type') || 'movie'}/list?language=${language}`;
        break;
      case 'search':
        const query = searchParams.get('q');
        if (!query) return NextResponse.json({ error: 'Missing query parameter q' }, { status: 400 });
        url = `/search/multi?query=${encodeURIComponent(query)}&page=${page}&include_adult=false&language=${language}`;
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const res = await fetch(`${TMDB_BASE}${url}`, { headers });
    if (!res.ok) {
      return NextResponse.json({ error: `TMDB error: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();

    if (format === 'list' && data.results) {
      data.results = data.results
        .filter((item: Record<string, unknown>) => item.media_type !== 'person')
        .map(formatResult);
    } else if (format === 'detail') {
      // Format detail response
      data.title = data.title || data.name;
      data.mediaType = data.first_air_date ? 'tv' : 'movie';
      data.year = (data.release_date || data.first_air_date || '').substring(0, 4);
      data.voteAverage = data.vote_average ?? 0;
      data.posterPath = getImgUrl(data.poster_path);
      data.backdropPath = getImgUrl(data.backdrop_path, 'w1280');

      if (data.credits) data.credits = formatCredits(data.credits);
      if (data.videos) data.videos = formatVideos(data.videos);
      if (data.similar?.results) {
        data.similar = { results: data.similar.results.map(formatResult).slice(0, 12) };
      }
      if (data.recommendations?.results) {
        data.recommendations = { results: data.recommendations.results.map(formatResult).slice(0, 12) };
      }
      // TV seasons
      if (data.seasons) {
        data.seasons = (data.seasons as Array<Record<string, unknown>>)
          .filter((s: Record<string, unknown>) => (s.season_number as number) > 0 || (s.season_number as number) === 0)
          .map((s: Record<string, unknown>) => ({
            id: s.id,
            seasonNumber: s.season_number,
            name: s.name,
            overview: s.overview,
            posterPath: getImgUrl(s.poster_path as string | null),
            episodeCount: s.episode_count,
            airDate: s.air_date,
          }));
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('TMDB API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
