'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';

export default function LoginPage() {
  const { user, state, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // If already authenticated, redirect away from login
  useEffect(() => {
    if (state === 'authenticated' && user) {
      if (user.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/');
      }
    }
  }, [state, user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    const result = await login(email, password);
    if (result.success) {
      // Redirect based on role — check localStorage for the role
      const stored = localStorage.getItem('user');
      const userData = stored ? JSON.parse(stored) : null;
      if (userData?.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/');
      }
    } else {
      setError(result.error || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-8">
          {/* Logo + Brand */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative w-20 h-20 border-2 border-[var(--gold)] overflow-hidden">
              <Image src="/images/login-side.png" alt="Muragoods Login" fill className="object-cover" />
            </div>
            <div className="text-center">
              <p
                className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold-bright)]"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Muragoods
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--pewter)]">
                Player Login
              </p>
            </div>
          </div>

          <h1
            className="text-xl mb-2 text-center text-[var(--cream)]"
            style={{ fontFamily: 'var(--font-arcade)' }}
          >
            SIGN IN
          </h1>
          <p className="text-sm text-[var(--pewter)] mb-8 text-center">
            Access your orders and favorites
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <label className="block">
              <span
                className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="deco-input"
                placeholder="your@email.com"
              />
            </label>

            <label className="block">
              <span
                className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="deco-input"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-3 text-sm text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="deco-btn deco-btn-crimson w-full deco-btn-lg mt-6" style={{ opacity: loading ? 0.7 : 1 }}>
              {loading ? 'SIGNING IN...' : 'SIGN IN'}
            </button>

            <div className="text-center mt-4">
              <Link href="/forgot-password" className="text-[10px] text-[var(--gold)] hover:text-[var(--gold-bright)] underline transition-colors" style={{ fontFamily: 'var(--font-arcade)' }}>
                Forgot Password?
              </Link>
            </div>
          </form>

          <div className="my-8">
            <hr className="deco-divider" />
          </div>

          <p className="text-center text-sm text-[var(--cream-muted)]">
            No account yet?{' '}
            <Link href="/signup" className="text-[var(--gold)] hover:text-[var(--gold-bright)] underline transition-colors">
              Sign up!
            </Link>
          </p>

          <Link href="/" className="deco-btn w-full mt-6 text-center">
            ← Back to Shop
          </Link>
        </div>
      </div>
    </main>
  );
}
