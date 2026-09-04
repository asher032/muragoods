import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { MediaItem, HistoryItem } from '../types';

// ─── localStorage helpers ────────────────────────────────────────
function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

function removeKey(key: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}

export type MuraStreamSettings = {
  autoplay: boolean;
  autoplayNext: boolean;
  continueWatching: boolean;
  subtitleSize: number;
  subtitleLang: string;
  appearance: 'dark' | 'light' | 'system';
  compactCards: boolean;
  watchHistory: boolean;
  recommendations: boolean;
};

export const DEFAULT_SETTINGS: MuraStreamSettings = {
  autoplay: true,
  autoplayNext: true,
  continueWatching: true,
  subtitleSize: 100,
  subtitleLang: 'en',
  appearance: 'dark',
  compactCards: false,
  watchHistory: true,
  recommendations: true,
};

export type AnimeProgress = {
  id: number; // MAL or TMDB id
  title: string;
  posterPath?: string | null;
  totalEpisodes?: number | null;
  watchedEpisodes: number[]; // e.g. [1,2,3,5] means ep 4 skipped
  lastWatched: string; // ISO date
  genres?: string[];
};

const KEYS = {
  likes: 'ms-likes',
  myList: 'ms-mylist',
  history: 'ms-history',
  settings: 'ms-settings',
  animeProgress: 'ms-anime-progress',
} as const;

// ─── Hook ────────────────────────────────────────────────────────
export function useMuraStreamStore() {
  // Likes
  const [likes, setLikesState] = useState<MediaItem[]>(() => readJSON<MediaItem[]>(KEYS.likes, []));
  const toggleLike = useCallback((item: MediaItem) => {
    setLikesState(prev => {
      const exists = prev.some(l => l.id === item.id);
      const next = exists ? prev.filter(l => l.id !== item.id) : [...prev, item];
      writeJSON(KEYS.likes, next);
      return next;
    });
  }, []);
  const isLiked = useCallback((id: number) => likes.some(l => l.id === id), [likes]);

  // My List / Watchlist
  const [myList, setMyListState] = useState<MediaItem[]>(() => readJSON<MediaItem[]>(KEYS.myList, []));
  const toggleMyList = useCallback((item: MediaItem) => {
    setMyListState(prev => {
      const exists = prev.some(w => w.id === item.id);
      const next = exists ? prev.filter(w => w.id !== item.id) : [...prev, item];
      writeJSON(KEYS.myList, next);
      return next;
    });
  }, []);
  const isInMyList = useCallback((id: number) => myList.some(w => w.id === id), [myList]);

  // History
  const [history, setHistoryState] = useState<HistoryItem[]>(() => readJSON<HistoryItem[]>(KEYS.history, []));
  const addToHistory = useCallback((item: MediaItem & { season?: number; episode?: number; progress?: number }) => {
    setHistoryState(prev => {
      const entry: HistoryItem = {
        id: item.id,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        date: new Date().toISOString(),
        season: item.season,
        episode: item.episode,
        progress: item.progress,
      };
      // Deduplicate: remove existing entry for same id/season/episode, put new one first
      const filtered = prev.filter(h =>
        !(h.id === entry.id && h.season === entry.season && h.episode === entry.episode)
      );
      const next = [entry, ...filtered].slice(0, 100); // cap at 100
      writeJSON(KEYS.history, next);
      return next;
    });
  }, []);
  const clearHistory = useCallback(() => {
    setHistoryState([]);
    removeKey(KEYS.history);
  }, []);

  // ─── Anime Episode Progress ──────────────────────────────
  const [animeProgress, setAnimeProgressState] = useState<AnimeProgress[]>(() =>
    readJSON<AnimeProgress[]>(KEYS.animeProgress, [])
  );

  const markEpisodeWatched = useCallback((
    animeId: number,
    title: string,
    posterPath: string | null | undefined,
    episode: number,
    totalEpisodes?: number | null,
    genres?: string[]
  ) => {
    setAnimeProgressState(prev => {
      const existing = prev.find(a => a.id === animeId);
      const watched = existing ? [...new Set([...existing.watchedEpisodes, episode])].sort((a, b) => a - b) : [episode];
      const entry: AnimeProgress = {
        id: animeId,
        title,
        posterPath,
        totalEpisodes: totalEpisodes ?? existing?.totalEpisodes ?? null,
        watchedEpisodes: watched,
        lastWatched: new Date().toISOString(),
        genres: genres ?? existing?.genres,
      };
      const next = [entry, ...prev.filter(a => a.id !== animeId)].slice(0, 50);
      writeJSON(KEYS.animeProgress, next);
      return next;
    });
  }, []);

  const isEpisodeWatched = useCallback((
    animeId: number,
    episode: number
  ): boolean => {
    const prog = animeProgress.find(a => a.id === animeId);
    return prog ? prog.watchedEpisodes.includes(episode) : false;
  }, [animeProgress]);

  const getAnimeProgress = useCallback((animeId: number): AnimeProgress | undefined => {
    return animeProgress.find(a => a.id === animeId);
  }, [animeProgress]);

  const removeAnimeProgress = useCallback((animeId: number) => {
    setAnimeProgressState(prev => {
      const next = prev.filter(a => a.id !== animeId);
      writeJSON(KEYS.animeProgress, next);
      return next;
    });
  }, []);

  const animeContinueWatching = useMemo(() => {
    return animeProgress
      .filter(a => {
        const total = a.totalEpisodes || 0;
        return a.watchedEpisodes.length > 0 && (total === 0 || a.watchedEpisodes.length < total);
      })
      .sort((a, b) => new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime())
      .slice(0, 10);
  }, [animeProgress]);

  // Derived
  const continueWatching = useMemo(() => {
    return history
      .filter(h => h.mediaType === 'tv')
      .reduce<HistoryItem[]>((acc, h) => {
        if (!acc.some(a => a.id === h.id)) acc.push(h);
        return acc;
      }, [])
      .slice(0, 10);
  }, [history]);

  // ─── Settings ────────────────────────────────────────
  const [settings, setSettingsState] = useState<MuraStreamSettings>(() =>
    readJSON<MuraStreamSettings>(KEYS.settings, DEFAULT_SETTINGS)
  );
  const updateSettings = useCallback((partial: Partial<MuraStreamSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...partial };
      writeJSON(KEYS.settings, next);
      return next;
    });
  }, []);

  // ─── Clear all library data ────────────────────────
  const clearAllLibrary = useCallback(() => {
    setLikesState([]);
    setMyListState([]);
    setHistoryState([]);
    setAnimeProgressState([]);
    removeKey(KEYS.likes);
    removeKey(KEYS.myList);
    removeKey(KEYS.history);
    removeKey(KEYS.animeProgress);
  }, []);

  // Remove individual item from any list
  const removeFromLikes = useCallback((id: number) => {
    setLikesState(prev => {
      const next = prev.filter(l => l.id !== id);
      writeJSON(KEYS.likes, next);
      return next;
    });
  }, []);
  const removeFromMyList = useCallback((id: number) => {
    setMyListState(prev => {
      const next = prev.filter(w => w.id !== id);
      writeJSON(KEYS.myList, next);
      return next;
    });
  }, []);

  // ─── MongoDB Sync ────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailRef = useRef<string | null>(null);

  // Read user email from localStorage (set by AuthContext)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) { const u = JSON.parse(raw); emailRef.current = u?.email || null; }
    } catch { /* empty */ }
  }, []);

  // Load from MongoDB on mount (if authenticated)
  useEffect(() => {
    const email = emailRef.current;
    if (!email) return;
    (async () => {
      try {
        const res = await fetch(`/api/murastream/library?email=${encodeURIComponent(email)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.likes?.length) { setLikesState(data.likes); writeJSON(KEYS.likes, data.likes); }
        if (data.myList?.length) { setMyListState(data.myList); writeJSON(KEYS.myList, data.myList); }
        if (data.history?.length) { setHistoryState(data.history); writeJSON(KEYS.history, data.history); }
        if (data.animeProgress?.length) { setAnimeProgressState(data.animeProgress); writeJSON(KEYS.animeProgress, data.animeProgress); }
        if (data.settings && Object.keys(data.settings).length > 0) {
          setSettingsState(prev => { const merged = { ...prev, ...data.settings }; writeJSON(KEYS.settings, merged); return merged; });
        }
      } catch (err) { console.error('[Library sync load]', err); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save to MongoDB
  const saveToMongo = useCallback(() => {
    const email = emailRef.current;
    if (!email) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/murastream/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, likes, myList, history, animeProgress, settings }),
        });
      } catch (err) { console.error('[Library sync save]', err); }
    }, 2000);
  }, [likes, myList, history, animeProgress, settings]);

  useEffect(() => { saveToMongo(); }, [saveToMongo]);

  // Cleanup timer
  useEffect(() => { return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }; }, []);

  return {
    // Likes
    likes,
    toggleLike,
    isLiked,
    removeFromLikes,
    // My List
    myList,
    toggleMyList,
    isInMyList,
    removeFromMyList,
    // History
    history,
    addToHistory,
    clearHistory,
    // Anime Episode Progress
    animeProgress,
    markEpisodeWatched,
    isEpisodeWatched,
    getAnimeProgress,
    removeAnimeProgress,
    animeContinueWatching,
    // Settings
    settings,
    updateSettings,
    // Clear
    clearAllLibrary,
    // Derived
    continueWatching,
  } as const;
}

// ─── Static reads (for pages that only need initial data, not reactivity) ──
export function getMuraStreamStore() {
  return {
    likes: readJSON<MediaItem[]>(KEYS.likes, []),
    myList: readJSON<MediaItem[]>(KEYS.myList, []),
    history: readJSON<HistoryItem[]>(KEYS.history, []),
  };
}
