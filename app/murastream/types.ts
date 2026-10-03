// Shared types for the MuraStream module.
// Single source of truth — every page imports from here.

export type MediaItem = {
  id: number;
  mediaType: string;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  voteAverage?: number;
  year?: string;
  overview?: string;
  genreIds?: number[];
  voteCount?: number;
  releaseDate?: string;
  name?: string;
  originalLanguage?: string;
};

export type ContinueWatchingItem = {
  id: number;
  mediaType: string;
  title: string;
  posterPath?: string | null;
  season?: number;
  episode?: number;
  progress?: number;
};

export type HistoryItem = {
  id: number;
  mediaType: string;
  title: string;
  posterPath?: string | null;
  date: string;
  season?: number;
  episode?: number;
  progress?: number;
};

// ── TMDB detail payloads ────────────────────────────────────────────────

export type TmdbGenre = { id: number; name: string };

export type TmdbVideo = { type: string; url?: string; key?: string; site?: string };

/** `videos` arrives either as a bare array or wrapped in `{ results }`. */
export type TmdbVideoPayload = TmdbVideo[] | { results?: TmdbVideo[] } | null;

export type TmdbSeasonRef = {
  seasonNumber: number;
  name?: string;
  posterPath?: string | null;
  episodeCount?: number;
};

export type TmdbEpisode = {
  episodeNumber: number;
  seasonNumber?: number;
  name?: string;
  overview?: string;
  stillPath?: string | null;
  voteAverage?: number;
};

/** The normalized `tv_details` / `movie_details` payload the pages render. */
export type TmdbDetails = {
  id: number;
  name?: string;
  title?: string;
  overview?: string;
  year?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  voteAverage?: number;
  number_of_episodes?: number;
  genres?: TmdbGenre[];
  seasons?: TmdbSeasonRef[];
  videos?: TmdbVideoPayload;
  recommendations?: { results?: MediaItem[] } | null;
};

export const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};
