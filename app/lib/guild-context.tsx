'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

// ── Dashboard session context ────────────────────────────────────────────
// Authentication lives in an HttpOnly session cookie managed by the server
// (/api/auth/discord/*). The browser holds no Discord token at all. The
// selected guild is stored server-side on the session, so it survives
// browser restarts, new tabs and devices — one selection, ever.

export interface DashGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  // Live detection facts (from /api/dashboard/servers). Null = unknown
  // (bot unreachable / unverifiable) — never guessed.
  botInstalled?: boolean | null;
  botOnlineInGuild?: boolean | null;
  botConnection?: 'online' | 'offline' | 'unknown';
  channelCount?: number | null;
  categoryCount?: number | null;
  roleCount?: number | null;
  memberCount?: number | null;
  presenceCount?: number | null;
  botPermissions?: string | null;
  needsInvite?: boolean;
  missingPermissions?: boolean;
  inviteUrl?: string | null;
}

export interface ServersMeta {
  botOnline: boolean | null;
  botGuildCount: number | null;
  userGuildCount: number;
  manageableCount: number;
  refreshedAt: string;
  cached?: boolean;
}

export interface DashMe {
  authenticated: boolean;
  user?: { discordId: string; username: string; globalName: string; avatar: string | null; avatarUrl: string | null };
  guilds?: DashGuild[];
  selectedGuildId?: string | null;
  botInSelectedGuild?: boolean | null;
  botGuildIds?: string[] | null;
  bot?: { online: boolean; latency: number | null; guilds: number | null };
  lastAuthAt?: string;
  sessionExpiresAt?: string;
}

interface GuildContextType {
  authChecked: boolean;      // /me has answered at least once
  authenticated: boolean;
  me: DashMe | null;
  user: DashMe['user'] | null;
  guilds: DashGuild[];
  selected: DashGuild | null;
  botOnline: boolean;
  botLatency: number | null;
  botInSelectedGuild: boolean | null;
  loginUrl: string;          // server-built OAuth entry (never contains secrets)
  error: string;
  setError: (e: string) => void;
  setSelected: (g: DashGuild | null) => void;  // persists server-side
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  // ── Live server detection (GET /api/dashboard/servers) ─────────────────
  // Merges the user's live Discord authorization with the bot's live
  // presence. Managing a server never implies the bot is installed there.
  serversLoading: boolean;
  serversError: string;
  serversMeta: ServersMeta | null;
  refreshServers: (force?: boolean) => Promise<void>;
  // ── Legacy compatibility ────────────────────────────────────────────────
  // Older dashboard pages gated on a client-held token. Credentials now live
  // ONLY in the HttpOnly session cookie, so `token` is reduced to an
  // authentication marker (never a credential) used purely as a render gate.
  token: string | null;
  setToken: (t: string | null) => void;
  setGuilds: (g: DashGuild[]) => void;
}

const GuildContext = createContext<GuildContextType | null>(null);

export function GuildProvider({ children }: { children: ReactNode }) {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [me, setMe] = useState<DashMe | null>(null);
  const [guilds, setGuilds] = useState<DashGuild[]>([]);
  // Auth marker for legacy pages — never a credential.
  const [selected, setSelectedState] = useState<DashGuild | null>(null);
  const [botOnline, setBotOnline] = useState(false);
  const [botLatency, setBotLatency] = useState<number | null>(null);
  const [error, setError] = useState('');
  // Live detection state.
  const [serversLoading, setServersLoading] = useState(false);
  const [serversError, setServersError] = useState('');
  const [serversMeta, setServersMeta] = useState<ServersMeta | null>(null);

  // Live server detection: user's Discord authorization × bot's presence,
  // merged server-side. Auth snapshot from /me stays the fallback so the
  // selector never goes empty when the bot service is unreachable.
  const loadServers = useCallback(async (force = false) => {
    setServersLoading(true);
    setServersError('');
    try {
      const resp = await fetch(`/api/dashboard/servers${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const data = (await resp.json().catch(() => null)) as {
        success?: boolean; servers?: DashGuild[]; meta?: ServersMeta; error?: string;
      } | null;
      if (!resp.ok || !data?.success || !Array.isArray(data.servers)) {
        setServersError(data?.error || `Server detection failed (HTTP ${resp.status})`);
        return;
      }
      setServersMeta(data.meta ?? null);
      const live: DashGuild[] = data.servers;
      setGuilds(live);
      // Re-resolve the selection against the live list so names/icons and
      // bot facts stay current; keep the /me selection id as the anchor.
      setSelectedState((prev) => {
        const anchor = prev?.id ?? null;
        if (!anchor) return prev;
        return live.find((g) => g.id === anchor) ?? prev;
      });
    } catch {
      setServersError('Could not reach server detection');
    } finally {
      setServersLoading(false);
    }
  }, []);

  const refreshServers = useCallback(async (force = false) => {
    if (force) {
      // POST clears the server cache first (Refresh Servers button).
      try { await fetch('/api/dashboard/servers', { method: 'POST', cache: 'no-store' }); } catch { /* loadServers reports */ }
      await loadServers(false);
    } else {
      await loadServers(false);
    }
  }, [loadServers]);

  const loadMe = useCallback(async () => {
    try {
      const resp = await fetch('/api/auth/discord/me', { cache: 'no-store' });
      const data = (await resp.json()) as DashMe;
      setMe(data);
      setAuthenticated(Boolean(data.authenticated));
      if (data.authenticated && data.guilds) {
        // Live detection replaces the login-time snapshot when it answers;
        // the snapshot keeps the UI usable until then.
        setGuilds((prev) => (prev.length > 0 ? prev : data.guilds ?? []));
        if (data.selectedGuildId) {
          const sel = data.guilds.find((g) => g.id === data.selectedGuildId) || null;
          setSelectedState((prev) => prev ?? sel);
        } else {
          setSelectedState((prev) => prev);
        }
      } else {
        setGuilds([]);
        setSelectedState(null);
      }
    } catch {
      setMe({ authenticated: false });
      setAuthenticated(false);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => { void loadMe(); }, [loadMe]);

  // After authentication, run live detection once (snapshot is the fallback).
  useEffect(() => {
    if (authenticated) void loadServers(false);
  }, [authenticated, loadServers]);

  // Bot status pill — real data from the bot service via the site API.
  useEffect(() => {
    if (!authenticated) return;
    let alive = true;
    const load = async () => {
      try {
        const resp = await fetch('/api/dashboard/status', { cache: 'no-store' });
        if (!resp.ok) return;
        const data = (await resp.json()) as {
          status?: string;
          services?: Record<string, { status?: string; responseTime?: number }>;
        };
        if (!alive) return;
        setBotOnline(data.services?.botGateway?.status === 'ok');
        setBotLatency(data.services?.botGateway?.responseTime ?? null);
      } catch { /* keep last state */ }
    };
    void load();
    const t = setInterval(load, 45_000);
    return () => { alive = false; clearInterval(t); };
  }, [authenticated]);

  // Server-side, permission-verified selection.
  const setSelected = useCallback((g: DashGuild | null) => {
    setSelectedState(g); // optimistic
    if (!g) return;
    void (async () => {
      try {
        const resp = await fetch('/api/auth/discord/logout', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId: g.id }),
        });
        if (!resp.ok) {
          const data = (await resp.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error || 'Could not switch server');
          void loadMe(); // roll back to the server truth
        }
      } catch {
        setError('Network error while switching server');
      }
    })();
  }, [loadMe]);

  const logout = useCallback(async () => {
    try { await fetch('/api/auth/discord/logout', { method: 'POST' }); } catch { /* ignore */ }
    setAuthenticated(false);
    setMe(null);
    setGuilds([]);
    setSelectedState(null);
    setServersMeta(null);
    setServersError('');
    window.location.href = '/dashboard';
  }, []);

  const loginUrl = '/api/auth/discord';
  const token = authenticated ? 'session' : null;
  // Legacy no-op: pages used to stash a browser token here. The server session
  // is authoritative, so this only nudges the app to re-read /me.
  const setTokenCompat = useCallback((_t: string | null) => { /* no-op */ }, []);

  // Full refresh: session snapshot + live detection.
  const refreshAll = useCallback(async () => {
    await loadMe();
    await loadServers(false);
  }, [loadMe, loadServers]);

  // Bot membership for the selected guild: live detection first, /me second.
  const botInSelectedGuild: boolean | null =
    selected?.botInstalled ?? me?.botInSelectedGuild ?? null;

  return (
    <GuildContext.Provider value={{
      authChecked, authenticated, me, user: me?.user ?? null,
      guilds, selected, botOnline, botLatency, botInSelectedGuild,
      loginUrl, error, setError,
      setSelected, refresh: refreshAll, logout,
      serversLoading, serversError, serversMeta, refreshServers,
      token, setToken: setTokenCompat, setGuilds,
    }}>
      {children}
    </GuildContext.Provider>
  );
}

export function useGuild(): GuildContextType {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error('useGuild must be used within GuildProvider');
  return ctx;
}
