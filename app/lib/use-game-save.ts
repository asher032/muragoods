'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Server-authoritative game save, with localStorage as a cache only.
//
// Three games kept their real state in the browser: trivia's high score, the
// mystery box's legend/streak/history/discount codes, spin's state. That meant
// a new device started at zero and clearing site data destroyed the record.
//
// This hook makes the server the owner. The shape of `state` stays
// client-owned (the game knows its own puzzle grid), but the save itself is
// fetched from and written to the server.
//
// Why localStorage is still here at all, as a CACHE and never the record:
//
//   1. Read the save synchronously on mount so a game does not flash an empty
//      board while the network round-trip is in flight.
//   2. Write through on every change so a player who closes the tab mid-game
//      does not lose the run.
//   3. NEVER use it to decide a reward. Awards go to /api/games/award, which
//      recomputes the prize server-side. A cached high score can inform the UI;
//      it cannot pay anything.
//
// The subtle failure this avoids: if localStorage were the record, then a
// player could edit a key and claim a high score. Here, editing the cache
// changes what the screen shows until the next server read, and pays nothing.
// ─────────────────────────────────────────────────────────────────────────

export interface GameSaveState {
  highScore?: number;
  plays?: number;
  streak?: number;
  level?: number;
  achievements?: string[];
  state?: Record<string, unknown>;
  /** Only sent when the caller explicitly resets. */
  resetScore?: boolean;
}

const CACHE_PREFIX = 'mg_save_';

function cacheKey(gameId: string): string {
  return `${CACHE_PREFIX}${gameId}`;
}

function readCache(gameId: string): GameSaveState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(gameId));
    return raw ? (JSON.parse(raw) as GameSaveState) : null;
  } catch {
    return null;
  }
}

function writeCache(gameId: string, save: GameSaveState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(cacheKey(gameId), JSON.stringify(save));
  } catch {
    // A full or blocked storage is not a reason to fail the save.
  }
}

/**
 * Load and persist one game's save.
 *
 * `save` is debounced so a game that writes on every frame does not produce a
 * request per frame. `status` is exposed so a UI can be honest about whether
 * the server has the latest state — a save that failed must not be shown as
 * saved.
 */
export function useGameSave(gameId: string) {
  const [save, setSave] = useState<GameSaveState | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'offline' | 'error'>('loading');
  const [serverExists, setServerExists] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<GameSaveState | null>(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setSave(readCache(gameId));

    (async () => {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/save`, { cache: 'no-store' });
        if (cancelled || !mounted.current) return;
        if (res.status === 401) {
          // Signed out: the cache may show something, but the server has no
          // record and must not pretend otherwise.
          setServerExists(false);
          setStatus('offline');
          return;
        }
        const body = await res.json().catch(() => null);
        if (cancelled || !mounted.current) return;
        if (!res.ok || !body?.success) {
          setStatus('error');
          return;
        }
        setServerExists(Boolean(body.exists));
        if (body.save) {
          setSave(body.save);
          writeCache(gameId, body.save);
        }
        setStatus('ready');
      } catch {
        if (!cancelled && mounted.current) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [gameId]);

  const flush = useCallback(async (payload: GameSaveState) => {
    setStatus('saving');
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/save`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!mounted.current) return;
      if (!res.ok) {
        // Reported honestly: the game state is cached locally but the server
        // does not have it yet, and the UI must say so rather than implying
        // a successful save.
        setStatus(res.status === 401 ? 'offline' : 'error');
        return;
      }
      const body = await res.json().catch(() => null);
      if (!mounted.current) return;
      setServerExists(true);
      if (body?.save) {
        writeCache(gameId, body.save);
        setSave(body.save);
      }
      setStatus('saved');
    } catch {
      if (mounted.current) setStatus('error');
    }
  }, [gameId]);

  const persist = useCallback((next: GameSaveState) => {
    setSave(next);
    writeCache(gameId, next);
    pending.current = next;
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const payload = pending.current;
      pending.current = null;
      if (payload) void flush(payload);
    }, 800);
  }, [gameId, flush]);

  // Merge a partial update into the current save.
  const update = useCallback((patch: Partial<GameSaveState>) => {
    setSave((current) => {
      const merged: GameSaveState = {
        ...(current || {}),
        ...patch,
        state: { ...(current?.state || {}), ...(patch.state || {}) },
      };
      writeCache(gameId, merged);
      pending.current = merged;
      setStatus('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const payload = pending.current;
        pending.current = null;
        if (payload) void flush(payload);
      }, 800);
      return merged;
    });
  }, [gameId, flush]);

  return { save, update, persist, status, serverExists, refresh: () => void flush(pending.current || save || {}) };
}