'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

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
  state: AuthState;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  state: 'checking',
  login: async () => ({ success: false }),
  signup: async () => ({ success: false }),
  logout: () => {},
  isAdmin: false,
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

    function checkSession() {
      try {
        const stored = localStorage.getItem('user');
        if (!stored) {
          if (!cancelled) setState('unauthenticated');
          return;
        }

        const parsed = JSON.parse(stored) as User;

        // Validate stored user has required fields
        if (parsed.email && parsed.name) {
          if (!cancelled) {
            setUser(parsed);
            setState('authenticated');
          }
        } else {
          localStorage.removeItem('user');
          if (!cancelled) setState('unauthenticated');
        }
      } catch {
        localStorage.removeItem('user');
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
        // Ensure role is set (signup defaults to 'user')
        if (!userData.role) userData.role = 'user';
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

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, state, login, signup, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}
