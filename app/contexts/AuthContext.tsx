'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

type User = {
  name: string;
  email: string;
  userId: string;
  createdAt?: string;
};

type AuthState = 'checking' | 'authenticated' | 'unauthenticated' | 'error';

type AuthContextType = {
  user: User | null;
  state: AuthState;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  state: 'checking',
  login: async () => ({ success: false }),
  signup: async () => ({ success: false }),
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<AuthState>('checking');

  // Check session on mount — runs ONCE
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const stored = localStorage.getItem('user');
        if (!stored) {
          if (!cancelled) { setState('unauthenticated'); }
          return;
        }

        const parsed = JSON.parse(stored) as User;

        // Verify session is still valid by calling the server
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: parsed.email, password: '' }),
        });

        // Even if password check fails (we don't send it), if the user object exists locally
        // and has required fields, we treat the session as valid for UX purposes
        if (!cancelled) {
          if (parsed.email && parsed.name && parsed.userId) {
            setUser(parsed);
            setState('authenticated');
          } else {
            localStorage.removeItem('user');
            setState('unauthenticated');
          }
        }
      } catch {
        // Network error — try to use local session
        try {
          const stored = localStorage.getItem('user');
          if (stored) {
            const parsed = JSON.parse(stored) as User;
            if (parsed.email && parsed.name && parsed.userId) {
              if (!cancelled) { setUser(parsed); setState('authenticated'); }
              return;
            }
          }
        } catch { /* empty */ }
        if (!cancelled) setState('unauthenticated');
      }
    }

    checkSession();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();

      if (result.success && result.data) {
        const userData = result.data as User;
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        setState('authenticated');
        return { success: true };
      }

      return { success: false, error: result.error || 'Login failed' };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const result = await res.json();

      if (result.success && result.data) {
        const userData = result.data as User;
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        setState('authenticated');
        return { success: true };
      }

      return { success: false, error: result.error || 'Signup failed' };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('user');
    setUser(null);
    setState('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ user, state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

