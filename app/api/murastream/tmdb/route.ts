// MuraStream — TMDB Proxy API Route
// Server-side proxy to keep the TMDB API key secure
import { NextRequest, NextResponse } from 'next/server';
import { SAMPLE_MEDIA } from '@/app/murastream/data/sample-media';
import { BAKED_CATALOG } from '@/app/murastream/data/baked-catalog';

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

  // Secondary TV source (TVmaze — free, no key): schedule/tv shows. Handled
  // before the TMDB credential check so it works even without a TMDB key.
  if (action === 'tvmaze') {
    const tz = searchParams.get('country') || 'US';
    const tmDate = searchParams.get('date');
    const tvmUrl = `https://api.tvmaze.com/schedule?country=${encodeURIComponent(tz)}${tmDate ? `&date=${encodeURIComponent(tmDate)}` : ''}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const tvmRes = await fetch(tvmUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!tvmRes.ok) throw new Error(`tvmaze ${tvmRes.status}`);
      const raw = (await tvmRes.json()) as Array<{
        id: number; name: string; show?: { id: number; name: string; poster?: string | null; image?: { medium?: string; original?: string } | null; genres?: string[]; premiered?: string };
        image?: { medium?: string; original?: string } | null;
      }>;
      const seen = new Set<number>();
      const results = (Array.isArray(raw) ? raw : [])
        .map((e) => e.show || { id: e.id, name: e.name, image: e.image, premiered: undefined })
        .filter((s): s is NonNullable<typeof s> => !!s && !!s.name)
        .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
        .slice(0, 40)
        .map((s) => ({
          id: s.id,
          title: s.name,
          mediaType: 'tv' as const,
          posterPath: s.poster || s.image?.original || s.image?.medium || '',
          year: (s.premiered || '').substring(0, 4),
          voteAverage: 0,
          genreIds: [] as number[],
        }));
      return NextResponse.json(
        { results },
        { headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=1800' } },
      );
    } catch {
      return NextResponse.json({ results: [] });
    }
  }

  const token = process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY;
  if (!token) {
    // No credentials (local dev — the Vercel CLI redacts secrets it pulls).
    // Serve a small sample catalog so the app is fully browsable instead of
    // erroring. Production always has real keys and never reaches this.
    return sampleResponse(searchParams);
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    let url = '';
    let format: 'list' | 'detail' | 'season' = 'list';

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
      case 'now_playing':
        url = `/movie/now_playing?page=${page}&language=${language}`;
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
        format = 'season';
        break;
      case 'discover': {
        // Generic TMDB discover — used for K-Dramas (with_genres=18 & with_origin_country=KR
        // & sort_by=popularity.desc) and any other curated verticals.
        const dsp = new URLSearchParams({
          sort_by: searchParams.get('sort_by') || 'popularity.desc',
          page,
          language,
          ...(searchParams.get('with_genres') ? { with_genres: searchParams.get('with_genres')! } : {}),
          ...(searchParams.get('with_origin_country') ? { with_origin_country: searchParams.get('with_origin_country')! } : {}),
          ...(searchParams.get('with_original_language') ? { with_original_language: searchParams.get('with_original_language')! } : {}),
          ...(searchParams.get('with_keywords') ? { with_keywords: searchParams.get('with_keywords')! } : {}),
          ...(searchParams.get('with_networks') ? { with_networks: searchParams.get('with_networks')! } : {}),
          ...(searchParams.get('primary_release_year') ? { primary_release_year: searchParams.get('primary_release_year')! } : {}),
          ...(searchParams.get('first_air_date_year') ? { first_air_date_year: searchParams.get('first_air_date_year')! } : {}),
          'vote_count.gte': searchParams.get('vote_count.gte') || searchParams.get('vote_count_gte') || '0',
        });
        url = `/discover/${searchParams.get('type') || 'tv'}?${dsp}`;
        // Asian-drama verticals (language-filtered TV discover): variety,
        // reality, kids, and talk shows dominate popularity in every language
        // and reappear under every genre chip — excluding them keeps filters
        // meaningfully different. (10764 reality, 10762 kids, 10763 news,
        // 10766 talk)
        if ((searchParams.get('type') || 'tv') === 'tv' && searchParams.get('with_original_language')) {
          url += '&without_genres=10764,10762,10763,10766';
        }
        break;
      }
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

    const res = await tmdbFetch(`${TMDB_BASE}${url}`, headers, action);
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

    if (format === 'season' && data.episodes) {
      // Normalize snake_case TMDB season payloads for the client
      data.episodes = (data.episodes as Array<Record<string, unknown>>).map((ep: Record<string, unknown>) => ({
        id: ep.id,
        episodeNumber: ep.episode_number,
        name: ep.name,
        overview: ep.overview,
        stillPath: getImgUrl(ep.still_path as string | null, 'w300'),
        airDate: ep.air_date,
        runtime: ep.runtime,
        voteAverage: ep.vote_average,
      }));
    }

    return NextResponse.json(data, { headers: { 'Cache-Control': cacheControlFor(action) } });
  } catch (error) {
    console.error('TMDB API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Caching + resilience ────────────────────────────────────────
// TMDB data is slow-moving; caching it in-process makes repeat visits
// near-instant and keeps us far under TMDB's rate limits. Stale entries
// are still served for up to 12h if TMDB is down or slow (SWR behavior).

type CacheEntry = { data: unknown; storedAt: number; freshMs: number };
const tmdbCache = new Map<string, CacheEntry>();
const CACHE_MAX = 300; // entries

function freshWindowFor(action: string | null): number {
  switch (action) {
    case 'trending': return 10 * 60 * 1000;      // 10 min
    case 'search': return 5 * 60 * 1000;         // 5 min
    case 'discover': return 30 * 60 * 1000;      // 30 min
    case 'genres': return 24 * 60 * 60 * 1000;   // 1 day
    case 'popular':
    case 'top_rated':
    case 'upcoming': return 60 * 60 * 1000;      // 1 hour
    case 'movie_details':
    case 'tv_details':
    case 'tv_season': return 6 * 60 * 60 * 1000; // 6 hours
    default: return 30 * 60 * 1000;
  }
}

function cacheControlFor(action: string | null): string {
  switch (action) {
    case 'trending':
    case 'search': return 'public, max-age=300, stale-while-revalidate=600';
    case 'genres': return 'public, max-age=86400, stale-while-revalidate=86400';
    case 'movie_details':
    case 'tv_details':
    case 'tv_season': return 'public, max-age=3600, stale-while-revalidate=21600';
    default: return 'public, max-age=600, stale-while-revalidate=3600';
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function tmdbFetch(url: string, headers: Record<string, string>, action: string | null): Promise<Response> {
  const now = Date.now();
  const freshMs = freshWindowFor(action);

  const hit = tmdbCache.get(url);
  if (hit) {
    if (now - hit.storedAt < freshMs) {
      // LRU touch: re-insert so hot keys sink to the eviction end
      tmdbCache.delete(url);
      tmdbCache.set(url, hit);
      return new Response(JSON.stringify(hit.data), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Stale entry: serve it immediately and refresh in the background
    // (stale-while-revalidate) so pages never wait on a cold TMDB round-trip.
    void (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const fresh = await fetch(url, { ...headers, signal: controller.signal });
        clearTimeout(timeout);
        if (fresh.ok) {
          tmdbCache.set(url, { data: await fresh.json(), storedAt: Date.now(), freshMs });
        }
      } catch { /* keep stale entry */ }
    })();
    return new Response(JSON.stringify(hit.data), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Cold fetch with retry (TMDB occasionally hiccups with 429/5xx)
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (tmdbCache.size >= CACHE_MAX) {
          const oldest = tmdbCache.keys().next().value;
          if (oldest) tmdbCache.delete(oldest);
        }
        tmdbCache.set(url, { data, storedAt: Date.now(), freshMs });
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`TMDB ${res.status}`);
        await sleep(500 * (attempt + 1));
        continue;
      }
      return res; // genuine client error (bad id etc.) — pass through
    } catch (err) {
      lastErr = err; // timeout/abort — retry once
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('TMDB request failed');
}

// ─── Sample fallback (no TMDB credentials configured) ────────────
// Serves the baked catalog (1200+ real titles: movies, TV, K/C/J-dramas,
// cartoons, famous shows) for list actions and synthesizes detail responses
// so /murastream pages work richly end-to-end in local dev.
function sampleResponse(searchParams: URLSearchParams): NextResponse {
  const action = searchParams.get('action');
  const type = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const page = Number(searchParams.get('page') || '1');

  const filterByType = (items: typeof SAMPLE_MEDIA) => items.filter(i => i.mediaType === type);

  // Curated sample + baked catalog, deduped by id. Gives offline/dev mode a
  // genuinely large library instead of a handful of titles.
  const OFFLINE_POOL: typeof SAMPLE_MEDIA = [
    ...SAMPLE_MEDIA,
    ...(BAKED_CATALOG.popMovies as unknown as typeof SAMPLE_MEDIA),
    ...(BAKED_CATALOG.topMovies as unknown as typeof SAMPLE_MEDIA),
    ...(BAKED_CATALOG.popTV as unknown as typeof SAMPLE_MEDIA),
    ...(BAKED_CATALOG.topTV as unknown as typeof SAMPLE_MEDIA),
    ...(BAKED_CATALOG.kdrama as unknown as typeof SAMPLE_MEDIA),
    ...(BAKED_CATALOG.cdrama as unknown as typeof SAMPLE_MEDIA),
    ...(BAKED_CATALOG.jdrama as unknown as typeof SAMPLE_MEDIA),
    ...(BAKED_CATALOG.cartoonMovies as unknown as typeof SAMPLE_MEDIA),
    ...(BAKED_CATALOG.cartoonTV as unknown as typeof SAMPLE_MEDIA),
    ...(BAKED_CATALOG.famousTV as unknown as typeof SAMPLE_MEDIA),
  ].filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);

  // Discover honors the client's filters (genre, year, language, sort) so
  // the drama browse page shows genuinely different rows per chip instead of
  // the same pool every time. The vote-count floor is skipped — a curated
  // catalog has no noise for it to filter.
  if (action === 'discover') {
    const genre = (searchParams.get('with_genres') || '').split(',').filter(Boolean);
    const lang = searchParams.get('with_original_language') || '';
    const year = searchParams.get('first_air_date_year') || '';
    const sortBy = searchParams.get('sort_by') || 'popularity.desc';
    let pool = filterByType(OFFLINE_POOL).filter(i => {
      if (lang && i.originalLanguage !== lang) return false;
      if (year && i.year !== year) return false;
      if (genre.length) {
        const ids = i.genreIds || [];
        if (!genre.every(g => ids.includes(Number(g)))) return false;
      }
      return true;
    });
    if (sortBy.startsWith('vote_average')) pool.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
    else if (sortBy === 'first_air_date.desc' || sortBy === 'primary_release_date.desc') {
      pool.sort((a, b) => (b.year || '').localeCompare(a.year || ''));
    } else {
      pool.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0)); // popularity proxy
    }
    return NextResponse.json({
      page,
      results: page <= 1 ? pool : [],
      total_pages: 1,
      total_results: pool.length,
    });
  }

  if (action === 'movie_details' || action === 'tv_details') {
    const id = Number(searchParams.get('id'));
    const item = OFFLINE_POOL.find(i => i.id === id) || OFFLINE_POOL[0];
    return NextResponse.json({
      ...item,
      credits: { cast: [], crew: [] },
      videos: [],
      similar: { results: OFFLINE_POOL.filter(i => i.id !== item.id).slice(0, 12) },
      recommendations: { results: OFFLINE_POOL.filter(i => i.id !== item.id).slice(0, 12) },
      seasons: [],
      runtime: 120,
    });
  }
  if (action === 'tv_season') {
    // Synthetic season: 8 episodes so the episode picker works in dev.
    const id = Number(searchParams.get('id'));
    const item = OFFLINE_POOL.find(i => i.id === id);
    const count = item?.mediaType === 'tv' ? 8 : 0;
    return NextResponse.json({ episodes: Array.from({ length: count }, (_, n) => ({
      id: (id || 0) * 100 + n + 1,
      episodeNumber: n + 1,
      name: `Episode ${n + 1}`,
      overview: '',
      stillPath: item?.backdropPath || null,
      airDate: null,
      runtime: 45,
      voteAverage: null,
    })) });
  }
  if (action === 'genres') {
    return NextResponse.json({ genres: [
      { id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }, { id: 16, name: 'Animation' },
      { id: 35, name: 'Comedy' }, { id: 80, name: 'Crime' }, { id: 18, name: 'Drama' },
      { id: 14, name: 'Fantasy' }, { id: 27, name: 'Horror' }, { id: 10749, name: 'Romance' },
      { id: 878, name: 'Science Fiction' }, { id: 53, name: 'Thriller' },
    ] });
  }
  if (action === 'search') {
    const q = (searchParams.get('q') || '').toLowerCase();
    return NextResponse.json({ results: OFFLINE_POOL.filter(i =>
      i.title.toLowerCase().includes(q) || (i.overview || '').toLowerCase().includes(q)
    ) });
  }

  // List actions (trending / popular / top_rated / upcoming): the offline
  // pool is curated (not live-ranked), so every list serves the same deep
  // pool regardless of page — the client dedupes by id when merging pages.
  const pool = filterByType(OFFLINE_POOL);
  return NextResponse.json({
    page,
    results: pool,
    total_pages: 2,
    total_results: pool.length,
  });
}
