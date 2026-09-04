import { useState, useCallback, useMemo } from 'react';
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

const KEYS = {
  likes: 'ms-likes',
  myList: 'ms-mylist',
  history: 'ms-history',
  settings: 'ms-settings',
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
