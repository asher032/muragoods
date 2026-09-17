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
}

export interface DashMe {
  authenticated: boolean;
  user?: { discordId: string; username: string; globalName: string; avatar: string | null; avatarUrl: string | null };
  guilds?: DashGuild[];
  selectedGuildId?: string | null;
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
  loginUrl: string;          // server-built OAuth entry (never contains secrets)
  error: string;
  setError: (e: string) => void;
  setSelected: (g: DashGuild | null) => void;  // persists server-side
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
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

  const loadMe = useCallback(async () => {
    try {
      const resp = await fetch('/api/auth/discord/me', { cache: 'no-store' });
      const data = (await resp.json()) as DashMe;
      setMe(data);
      setAuthenticated(Boolean(data.authenticated));
      if (data.authenticated && data.guilds) {
        setGuilds(data.guilds);
        if (data.selectedGuildId) {
          const sel = data.guilds.find((g) => g.id === data.selectedGuildId) || null;
          setSelectedState(sel);
        } else {
          setSelectedState(null);
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
    window.location.href = '/dashboard';
  }, []);

  const loginUrl = '/api/auth/discord';
  const token = authenticated ? 'session' : null;
  // Legacy no-op: pages used to stash a browser token here. The server session
  // is authoritative, so this only nudges the app to re-read /me.
  const setTokenCompat = useCallback((_t: string | null) => { /* no-op */ }, []);

  return (
    <GuildContext.Provider value={{
      authChecked, authenticated, me, user: me?.user ?? null,
      guilds, selected, botOnline, botLatency, loginUrl, error, setError,
      setSelected, refresh: loadMe, logout,
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
