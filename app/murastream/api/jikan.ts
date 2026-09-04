// Jikan API Client — Secondary/fallback anime metadata
// Official MAL unofficial API: https://api.jikan.moe/v4

const JIKAN_BASE = 'https://api.jikan.moe/v4';

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  images: { jpg: { image_url: string; large_image_url: string } };
  synopsis: string | null;
  episodes: number | null;
  score: number | null;
  status: string;
  year: number | null;
  genres: Array<{ mal_id: number; name: string }>;
  themes: Array<{ mal_id: number; name: string }>;
  aired: { from: string | null };
}

async function jikanFetch(path: string, retries = 2): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${JIKAN_BASE}${path}`, {
        headers: { Accept: 'application/json' },
      });
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

function normalizeJikanAnime(anime: JikanAnime) {
  const title = anime.title_english || anime.title || 'Untitled';
  const genres = [...(anime.genres || []), ...(anime.themes || [])];
  return {
    id: anime.mal_id,
    anilistId: null,
    malId: anime.mal_id,
    mediaType: 'tv' as const,
    title,
    originalTitle: anime.title,
    romajiTitle: anime.title,
    englishTitle: anime.title_english,
    nativeTitle: null,
    posterPath: anime.images?.jpg?.image_url || null,
    backdropPath: anime.images?.jpg?.large_image_url || null,
    voteAverage: anime.score ? anime.score / 2 : 0,
    score: anime.score || 0,
    year: anime.year ? String(anime.year) : '',
    overview: anime.synopsis?.replace(/<[^>]*>/g, '').trim() || '',
    genres: genres.map(g => g.name),
    episodes: anime.episodes,
    status: anime.status,
    releaseDate: anime.aired?.from?.substring(0, 10) || '',
    originalLanguage: 'ja',
  };
}

export async function searchJikan(query: string, page = 1) {
  const data = await jikanFetch(`/anime?q=${encodeURIComponent(query)}&limit=20&page=${page}&sfw=true`) as {
    data: JikanAnime[];
    pagination: { last_visible_page: number; has_next_page: boolean };
  };
  return {
    results: (data.data || []).map(normalizeJikanAnime),
    pageInfo: { hasNextPage: data.pagination?.has_next_page || false, lastPage: data.pagination?.last_visible_page || 1 },
  };
}

export async function getTopAnimeJikan(page = 1) {
  const data = await jikanFetch(`/top/anime?limit=25&page=${page}`) as { data: JikanAnime[] };
  return (data.data || []).map(normalizeJikanAnime);
}

export async function getSeasonalJikan() {
  const data = await jikanFetch('/seasons/now?limit=25') as { data: JikanAnime[] };
  return (data.data || []).map(normalizeJikanAnime);
}

export async function getAnimeByIdJikan(malId: number) {
  const data = await jikanFetch(`/anime/${malId}/full`) as { data: JikanAnime };
  return data.data ? normalizeJikanAnime(data.data) : null;
}
