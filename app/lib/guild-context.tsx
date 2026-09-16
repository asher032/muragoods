'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  members: number | null;
}

interface GuildContextType {
  token: string;
  setToken: (t: string) => void;
  selected: Guild | null;
  setSelected: (g: Guild | null) => void;
  guilds: Guild[];
  setGuilds: (g: Guild[]) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  error: string;
  setError: (e: string) => void;
  loginUrl: string;
}

const GuildContext = createContext<GuildContextType | null>(null);

const STORAGE_KEY = 'mb_guild_selected';

export function GuildProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string>('');
  const [selected, setSelectedState] = useState<Guild | null>(null);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setToken = useCallback((t: string) => {
    setTokenState(t);
    if (t) {
      sessionStorage.setItem('mb_token', t);
    } else {
      sessionStorage.removeItem('mb_token');
    }
  }, []);

  const setSelected = useCallback((g: Guild | null) => {
    setSelectedState(g);
    if (g) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(g));
      } catch { /* ignore */ }
    } else {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('mb_token');
    if (saved) setToken(saved);
    const sel = sessionStorage.getItem(STORAGE_KEY);
    if (sel) {
      try {
        const parsed = JSON.parse(sel) as Guild;
        setSelectedState(parsed);
        // Also add to guilds list if not already there
        setGuilds((prev) => {
          if (prev.some((g) => g.id === parsed.id)) return prev;
          return [...prev, parsed];
        });
      } catch { /* ignore */ }
    }
  }, [setToken]);

  const loginUrl = 'https://discord.com/oauth2/authorize?client_id=1549395794853888020&redirect_uri=https%3A%2F%2Fmuragoods.vercel.app%2Fdashboard&response_type=token&scope=identify%20guilds';

  return (
    <GuildContext.Provider value={{
      token, setToken, selected, setSelected, guilds, setGuilds,
      loading, setLoading, error, setError, loginUrl,
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
