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
  releaseDate?: string;
  name?: string;
  originalLanguage?: string;
  // AniList / anime-specific fields
  anilistId?: number;
  malId?: number;
  genres?: string[];
  episodes?: number;
  status?: string;
  score?: number;
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

export const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};
