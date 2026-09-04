// AniList GraphQL API Client
// Primary anime catalog — no API key required

const ANILIST_URL = 'https://graphql.anilist.co';

export interface AniListAnime {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: { large: string; extraLarge: string } | null;
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  duration: number | null;
  season: string | null;
  seasonYear: number | null;
  genres: string[];
  status: string;
  averageScore: number | null;
  format: string | null;
  source: string | null;
  countryOfOrigin: string | null;
}

const SEARCH_QUERY = `
query ($search: String!, $page: Int!) {
  Page(page: $page, perPage: 20) {
    pageInfo { currentPage lastPage hasNextPage }
    media(search: $search, type: ANIME, isAdult: false) {
      id idMal
      title { romaji english native }
      coverImage { large extraLarge }
      bannerImage description episodes duration
      season seasonYear genres status averageScore format
      source countryOfOrigin
    }
  }
}`;

const TOP_QUERY = `
query ($page: Int!, $sort: [MediaSort]) {
  Page(page: $page, perPage: 25) {
    media(type: ANIME, sort: $sort, isAdult: false) {
      id idMal
      title { romaji english native }
      coverImage { large extraLarge }
      bannerImage description episodes duration
      season seasonYear genres status averageScore format
    }
  }
}`;

const SEASONAL_QUERY = `
query ($season: Season!, $seasonYear: Int!, $page: Int!) {
  Page(page: $page, perPage: 25) {
    media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC, isAdult: false) {
      id idMal
      title { romaji english native }
      coverImage { large extraLarge }
      bannerImage description episodes duration
      season seasonYear genres status averageScore format
    }
  }
}`;

const GENRE_QUERY = `
query ($genre: String!, $page: Int!) {
  Page(page: $page, perPage: 25) {
    media(type: ANIME, genre: $genre, sort: SCORE_DESC, isAdult: false) {
      id idMal
      title { romaji english native }
      coverImage { large extraLarge }
      bannerImage description episodes duration
      season seasonYear genres status averageScore format
    }
  }
}`;

async function anilistFetch(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 300 }, // Cache 5 minutes
  });

  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList API error');
  }
  return json.data;
}

export function normalizeAniListAnime(anime: AniListAnime) {
  const title = anime.title.english || anime.title.romaji || 'Untitled';
  return {
    id: anime.id,
    anilistId: anime.id,
    malId: anime.idMal,
    mediaType: 'tv' as const,
    title,
    originalTitle: anime.title.romaji,
    romajiTitle: anime.title.romaji,
    englishTitle: anime.title.english,
    nativeTitle: anime.title.native,
    posterPath: anime.coverImage?.large || null,
    backdropPath: anime.bannerImage || anime.coverImage?.extraLarge || null,
    voteAverage: anime.averageScore ? anime.averageScore / 10 : 0,
    score: anime.averageScore || 0,
    year: anime.seasonYear ? String(anime.seasonYear) : '',
    overview: anime.description?.replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim() || '',
    genres: anime.genres || [],
    episodes: anime.episodes,
    status: anime.status,
    releaseDate: anime.seasonYear ? `${anime.seasonYear}-01-01` : '',
    originalLanguage: anime.countryOfOrigin === 'JP' ? 'ja' : 'en',
  };
}

export async function searchAniList(query: string, page = 1) {
  const data = await anilistFetch(SEARCH_QUERY, { search: query, page }) as {
    Page: { media: AniListAnime[]; pageInfo: { hasNextPage: boolean; lastPage: number } };
  };
  return {
    results: data.Page.media.map(normalizeAniListAnime),
    pageInfo: data.Page.pageInfo,
  };
}

export async function getTopAnime(page = 1) {
  const data = await anilistFetch(TOP_QUERY, { page, sort: ['SCORE_DESC'] }) as {
    Page: { media: AniListAnime[] };
  };
  return data.Page.media.map(normalizeAniListAnime);
}

export async function getSeasonalAnime(season: string, year: number, page = 1) {
  const data = await anilistFetch(SEASONAL_QUERY, { season, seasonYear: year, page }) as {
    Page: { media: AniListAnime[] };
  };
  return data.Page.media.map(normalizeAniListAnime);
}

export async function getAnimeByGenre(genre: string, page = 1) {
  const data = await anilistFetch(GENRE_QUERY, { genre, page }) as {
    Page: { media: AniListAnime[] };
  };
  return data.Page.media.map(normalizeAniListAnime);
}

export async function getAnimeById(anilistId: number) {
  const query = `
  query ($id: Int!) {
    Media(id: $id, type: ANIME) {
      id idMal
      title { romaji english native }
      coverImage { large extraLarge }
      bannerImage description episodes duration
      season seasonYear genres status averageScore format
      source countryOfOrigin
    }
  }`;
  const data = await anilistFetch(query, { id: anilistId }) as { Media: AniListAnime };
  return data.Media ? normalizeAniListAnime(data.Media) : null;
}
