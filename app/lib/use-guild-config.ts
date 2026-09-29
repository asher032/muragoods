'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';

interface GuildConfig {
  modules?: Record<string, boolean>;
  music?: Record<string, unknown>;
  moderation?: Record<string, unknown>;
  welcome?: Record<string, unknown>;
  tickets?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  securitySettings?: Record<string, unknown>;
  community?: Record<string, unknown>;
  prefix?: string;
  [key: string]: unknown;
}

// ── Centralized guild-config loading ─────────────────────────────────────
// ONE cache + ONE in-flight request per guild, shared by every hook
// instance on the page (each dashboard page mounts 2+: the page itself and
// ModuleSettings). Before this, N mounted instances fired N simultaneous
// GETs, and every guild-switch/selection-identity change refetched — the
// burst is what Discord answered with 429s.
//
// Rules:
//   - fresh cache (60s TTL) → served silently, zero HTTP requests
//   - simultaneous loads → all await the SAME promise (single flight)
//   - 429/failure with ANY cached data (even stale) → keep showing it,
//     report the failure once, never auto-retry in a loop
//   - cache writes only on: successful load, successful save
//   - hook effects key on the guild ID STRING, never the selection object,
//     so live-detection object churn cannot retrigger loads
interface CacheEntry {
  data: GuildConfig;
  at: number;
}
const CONFIG_TTL_MS = 60_000;
const configCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<LoadResult>>();

interface LoadResult {
  ok: boolean;
  data?: GuildConfig;
  error?: string;
  code?: string;
  retryAfterSec?: number;
}

function readRetryAfter(resp: Response): number | undefined {
  const raw = resp.headers.get('retry-after');
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(120, Math.ceil(secs));
  return undefined;
}

async function fetchConfig(guildId: string): Promise<LoadResult> {
  const endpoint = `/api/dashboard/config?guildId=${guildId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
    const data = (await resp.json().catch(() => null)) as {
      success?: boolean; config?: GuildConfig; error?: string; code?: string; retryAfterMs?: number;
    } | null;
    if (resp.ok && data && data.success) {
      return { ok: true, data: data.config || {} };
    }
    const code = typeof data?.code === 'string' ? data.code : '';
    const retryAfterSec = readRetryAfter(resp)
      ?? (typeof data?.retryAfterMs === 'number' ? Math.min(120, Math.ceil(data.retryAfterMs / 1000)) : undefined);
    const serverMessage = typeof data?.error === 'string' && data.error ? ` — ${data.error}` : '';
    if (resp.status === 429 || code === 'RATE_LIMITED') {
      const wait = retryAfterSec !== undefined ? ` Retry in ${retryAfterSec}s.` : ' Retry in a moment.';
      return { ok: false, code: 'RATE_LIMITED', retryAfterSec, error: `Discord rate-limited configuration loading.${wait}` };
    }
    return { ok: false, code, error: `Failed to load ${endpoint}: HTTP ${resp.status}${serverMessage}` };
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      code: timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      error: timedOut
        ? 'Failed to load /api/dashboard/config: request timed out after 15s — retry.'
        : `Failed to load /api/dashboard/config: network error — ${String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function loadShared(guildId: string, force: boolean): Promise<LoadResult> {
  if (!force) {
    const hit = configCache.get(guildId);
    if (hit && Date.now() - hit.at < CONFIG_TTL_MS) {
      return Promise.resolve({ ok: true, data: hit.data });
    }
  }
  const running = inflight.get(guildId);
  if (running) return running;
  const p = fetchConfig(guildId).then((result) => {
    if (result.ok && result.data) {
      configCache.set(guildId, { data: result.data, at: Date.now() });
    }
    return result;
  }).finally(() => {
    if (inflight.get(guildId) === p) inflight.delete(guildId);
  });
  inflight.set(guildId, p);
  return p;
}

export function useGuildConfig() {
  const { token, selected } = useGuild();
  // Key on the STABLE id string: guild-context replaces the selection object
  // on live-detection refreshes, and depending on the object would refetch
  // on every refresh for every mounted instance.
  const guildId = selected?.id ?? null;
  const authed = token !== null;
  const [config, setConfig] = useState<GuildConfig>({});
  // Always-current draft mirror: save() must send the LATEST edits, but a
  // setState updater is not guaranteed to run synchronously — reading state
  // through `setConfig(c => { draft = c; ... })` could serialize {} instead.
  const configRef = useRef<GuildConfig>({});
  useEffect(() => { configRef.current = config; }, [config]);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const currentGuild = useRef<string | null>(null);

  const applyResult = useCallback((gid: string, result: LoadResult) => {
    if (currentGuild.current !== gid) return; // superseded by guild switch
    if (result.ok && result.data) {
      setConfig(result.data);
      setError('');
    } else {
      // Failure with cached data (even stale): keep showing it silently.
      // Only an empty-handed failure surfaces an error, once.
      const cached = configCache.get(gid);
      if (!(cached && Object.keys(cached.data).length > 0)) {
        setError(result.error || 'Could not load configuration.');
      }
    }
    setLoading(false);
  }, []);

  const load = useCallback(async (force = false) => {
    if (!authed || !guildId) {
      currentGuild.current = null;
      setLoading(false);
      return;
    }
    // Fast path: fresh cache serves with no HTTP request at all.
    if (!force) {
      const hit = configCache.get(guildId);
      if (hit && Date.now() - hit.at < CONFIG_TTL_MS) {
        currentGuild.current = guildId;
        setConfig(hit.data);
        setError('');
        setLoading(false);
        return;
      }
    }
    currentGuild.current = guildId;
    setLoading(true);
    // Clear a previous error only when actually (re)fetching; a cached
    // failure notice must not flicker on every render.
    if (force) setError('');
    try {
      const result = await loadShared(guildId, force);
      applyResult(guildId, result);
    } catch {
      if (currentGuild.current === guildId) {
        const cached = configCache.get(guildId);
        if (!(cached && Object.keys(cached.data).length > 0)) {
          setError('Could not load configuration.');
        }
        setLoading(false);
      }
    }
  }, [authed, guildId, applyResult]);

  const save = useCallback(async () => {
    if (!authed || !guildId) return false;
    setSaveState('saving');
    setError('');
    const endpoint = '/api/dashboard/config';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      // Snapshot the draft at click time from the ref (kept in lockstep
      // with state above) — never a stale closure.
      const draft: GuildConfig = configRef.current;
      const resp = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ guildId, config: draft }),
        signal: controller.signal,
      });
      const data = (await resp.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (resp.ok && data && data.success) {
        // The save is confirmed: this draft IS the server truth now.
        configCache.set(guildId, { data: draft, at: Date.now() });
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2500);
        return true;
      }
      const serverMessage = typeof data?.error === 'string' && data.error ? ` — ${data.error}` : '';
      setSaveState('error');
      setError(`Failed to save ${endpoint}: HTTP ${resp.status}${serverMessage}`);
      setTimeout(() => setSaveState('idle'), 3000);
      return false;
    } catch (err) {
      setSaveState('error');
      const timedOut = err instanceof DOMException && err.name === 'AbortError';
      setError(timedOut
        ? `Failed to save ${endpoint}: request timed out after 20s.`
        : `Failed to save ${endpoint}: network error — ${String(err)}`);
      setTimeout(() => setSaveState('idle'), 3000);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }, [authed, guildId]);

  useEffect(() => {
    currentGuild.current = guildId;
    configRef.current = {}; // no cross-guild draft bleed on switch
    if (!authed || !guildId) {
      setConfig({});
      setError('');
      setLoading(false);
      return;
    }
    void load(false);
  }, [authed, guildId, load]);

  const update = useCallback((section: string, key: string, value: unknown) => {
    setConfig((c) => ({
      ...c,
      [section]: { ...(c[section] as Record<string, unknown> || {}), [key]: value },
    }));
  }, []);

  return { config, loading, saveState, error, save, update, load, setConfig };
}

/** @deprecated Use `useGuildResources` from dashboard/components/selectors.tsx instead.
 *  Kept for import compatibility; bounded by a 12s timeout so no caller can
 *  hang on "Loading…" forever. */
export async function loadGuildResources(token: string, guildId: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(`/api/dashboard/resources?guildId=${encodeURIComponent(guildId)}`, {
      headers: { 'x-discord-token': token },
      cache: 'no-store',
      signal: controller.signal,
    });
    return resp.json();
  } finally {
    clearTimeout(timer);
  }
}
