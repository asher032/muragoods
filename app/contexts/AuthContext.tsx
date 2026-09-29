'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ── Ecosystem auth context ───────────────────────────────────────────────
// ONE identity for Muragoods, Murastream, games, letters, rewards and the
// Murabot dashboard. The server (/api/me) is the source of truth; the
// localStorage copy is an optimistic seed only and is revalidated on mount.
// localStorage is never trusted for authorization — every protected API
// derives identity from the HttpOnly session cookies server-side.

type MeUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  role: string;
  coins: number;
  discord: { connected: boolean; userId: string | null; username: string | null };
};

type User = {
  name: string;
  email: string;
  userId: string;
  role: string;
  createdAt?: string;
};

type AuthState = 'checking' | 'authenticated' | 'unauthenticated' | 'error';

type AuthContextType = {
  user: User | null;
  me: MeUser | null;
  linked: boolean;
  state: AuthState;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  me: null,
  linked: true,
  state: 'checking',
  login: async () => ({ success: false }),
  signup: async () => ({ success: false }),
  logout: async () => {},
  refresh: async () => {},
  isAdmin: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

function toLegacyUser(me: MeUser): User {
  return { name: me.username, email: me.email, userId: me.id, role: me.role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<MeUser | null>(null);
  const [linked, setLinked] = useState(true);
  const [state, setState] = useState<AuthState>('checking');

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch('/api/me', { cache: 'no-store', signal: controller.signal });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean; authenticated?: boolean; linked?: boolean; user?: MeUser;
      } | null;
      if (data?.success && data.authenticated && data.user) {
        const legacy = toLegacyUser(data.user);
        setMe(data.user);
        setUser(legacy);
        setLinked(data.linked !== false);
        setState('authenticated');
        try {
          localStorage.setItem('user', JSON.stringify(legacy));
        } catch { /* seed is best-effort */ }
      } else {
        setMe(null);
        setUser(null);
        setState('unauthenticated');
        try {
          localStorage.removeItem('user');
        } catch { /* ignore */ }
      }
    } catch {
      // Unreachable backend: fall back to the optimistic seed (if any) so
      // the UI paints, but mark error so gates don't pretend success.
      try {
        const stored = localStorage.getItem('user');
        if (stored) {
          const parsed = JSON.parse(stored) as User;
          if (parsed.email && parsed.name) {
            setUser(parsed);
            setState('error');
            return;
          }
        }
      } catch { /* corrupt seed */ }
      setMe(null);
      setUser(null);
      setState('error');
    } finally {
      clearTimeout(timer);
    }
  }, []);

  // Server truth on mount — runs ONCE.
  useEffect(() => {
    let cancelled = false;
    // Optimistic paint from the seed; refresh() overwrites with server truth.
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored) as User;
        if (parsed.email && parsed.name) setUser(parsed);
      }
    } catch { /* ignore */ }
    void refresh().then(() => {
      if (cancelled) {
        setUser(null);
        setMe(null);
        setState('checking');
      }
    });
    return () => { cancelled = true; };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (result?.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: result?.error || 'Login failed' };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, [refresh]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const result = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (result?.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: result?.error || 'Signup failed' };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, [refresh]);

  // ONE logout: the server clears the shop cookie AND revokes the Discord
  // dashboard session, so the user leaves the whole ecosystem at once.
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
    } catch { /* cookie clearing is best-effort client-side too */ }
    try {
      localStorage.removeItem('user');
    } catch { /* ignore */ }
    setUser(null);
    setMe(null);
    setState('unauthenticated');
  }, []);

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, me, linked, state, login, signup, logout, refresh, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}
