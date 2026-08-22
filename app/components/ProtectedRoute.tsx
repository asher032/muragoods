'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface UserData {
  name?: string;
  email?: string;
  [key: string]: unknown;
}

export function useAuth() {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          setUser(null);
          localStorage.removeItem('user');
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  return { user, isLoading };
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function ProtectedRoute({ children, redirectTo = '/login' }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(redirectTo);
    }
  }, [isLoading, user, router, redirectTo]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[var(--obsidian)] flex items-center justify-center">
        <div className="text-center">
          <p
            className="text-sm text-[var(--gold-bright)] animate-bounce uppercase mb-4"
            style={{ fontFamily: 'var(--font-arcade)' }}
          >
            LOADING...
          </p>
          <p className="text-sm text-[var(--pewter)] uppercase tracking-widest">
            Entering Muragoods...
          </p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
