'use client';

import Image from "next/image";
import Link from "next/link";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const result = await res.json();

      if (result.success) {
        localStorage.setItem('user', JSON.stringify(result.data));
        router.push('/account/orders');
      } else {
        setError(result.error || 'Signup failed');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'linear-gradient(135deg, var(--luigi-green), var(--luigi-green-dark))' }}>
      <div className="w-full max-w-md">
        <div className="wavy-divider absolute left-0 right-0 top-0">
          <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="w-full">
            <path d="M0,0 L1200,0 L1200,30 C1000,60 800,0 600,30 C400,60 200,0 0,30 Z" fill="var(--luigi-green)"/>
          </svg>
        </div>
        <div className="wavy-divider absolute left-0 right-0 bottom-0">
          <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="w-full">
            <path d="M0,30 C200,0 400,60 600,30 C800,0 1000,60 1200,30 L1200,60 L0,60 Z" fill="var(--luigi-green)"/>
          </svg>
        </div>

        <div className="relative z-10 rounded-2xl border-4 border-black bg-white p-8 shadow-2xl">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative w-24 h-24 rounded-full border-4 border-yellow-300 bg-rose-400 flex items-center justify-center shadow-lg overflow-hidden">
              <Image src="/images/luigi-badge.png" alt="Luigi Badge" fill className="object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-widest text-green-600">Muragoods</p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Luigi&apos;s Food</p>
            </div>
          </div>

          <h1 className="text-4xl font-black text-black mb-2 text-center uppercase">Join the Crew (New Game)</h1>
          <p className="text-sm font-bold text-slate-700 mb-6 text-center">Create your account</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <label className="block text-sm font-black text-black uppercase">
              Full Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mario-input mt-2 bg-yellow-50 focus:bg-white"
                placeholder="Your name"
              />
            </label>

            <label className="block text-sm font-black text-black uppercase">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mario-input mt-2 bg-yellow-50 focus:bg-white"
                placeholder="your@email.com"
              />
            </label>

            <label className="block text-sm font-black text-black uppercase">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mario-input mt-2 bg-yellow-50 focus:bg-white"
                placeholder="••••••••"
              />
            </label>

            <label className="block text-sm font-black text-black uppercase">
              Confirm Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mario-input mt-2 bg-yellow-50 focus:bg-white"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-3 text-sm font-black text-rose-600 uppercase">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mario-btn mario-btn-green w-full uppercase font-black text-lg tracking-widest mt-6 border-black disabled:opacity-50"
            >
              {loading ? "⏳ CREATING..." : "✨ CREATE ACCOUNT ✨"}
            </button>
          </form>

          <div className="mt-8 border-t-4 border-black pt-6">
            <p className="text-center text-sm font-black text-black uppercase">
              Have an account?{' '}
              <Link href="/login" className="text-rose-500 hover:text-rose-600 underline">
                Sign in!
              </Link>
            </p>
          </div>

          <Link href="/" className="mario-btn mt-4 block text-center bg-rose-400 text-white border-black hover:bg-rose-500 uppercase font-black">
            ← Back to Shop
          </Link>
        </div>
      </div>
    </main>
  );
}
