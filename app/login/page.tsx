'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adminCredentials } from '@/app/lib/muragoods-data';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) router.push('/');
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();

      if (result.success) {
        localStorage.setItem('user', JSON.stringify(result.data));
        if (email === adminCredentials.email) {
          router.push('/admin');
        } else {
          router.push('/');
        }
      } else {
        setError(result.error || 'Login failed');
      }
    } catch {
      setError('An error occurred. Please try again.');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Card */}
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

          {/* Title */}
          <h1
            className="text-xl mb-2 text-center text-[var(--cream)]"
            style={{ fontFamily: 'var(--font-arcade)' }}
          >
            SIGN IN
          </h1>
          <p className="text-sm text-[var(--pewter)] mb-8 text-center">
            Access your orders and favorites
          </p>

          {/* Form */}
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

            <button type="submit" className="deco-btn deco-btn-crimson w-full deco-btn-lg mt-6">
              SIGN IN
            </button>
          </form>

          {/* Divider */}
          <div className="my-8">
            <hr className="deco-divider" />
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-[var(--cream-muted)]">
            No account yet?{' '}
            <Link href="/signup" className="text-[var(--gold)] hover:text-[var(--gold-bright)] underline transition-colors">
              Sign up!
            </Link>
          </p>

          {/* Back Button */}
          <Link href="/" className="deco-btn w-full mt-6 text-center">
            ← Back to Shop
          </Link>
        </div>
      </div>
    </main>
  );
}
