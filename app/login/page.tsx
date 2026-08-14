'use client';

import Image from "next/image";
import Link from "next/link";
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
    if (user) {
      router.push('/');
    }
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
        if (email === adminCredentials.email || email === 'mhaxthedog@gmail.com') {
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
    <main className="min-h-screen flex items-center justify-center font-serif">
      <div className="flex w-full max-w-4xl rounded-2xl border-4 border-black overflow-hidden shadow-2xl">
        <div className="charcoal-pattern hidden md:flex md:w-1/2 bg-rose-400 flex-col items-center justify-center p-8 text-center relative">
          <div className="relative z-10">
            <div className="relative w-48 h-48 mx-auto mb-6">
              <Image src="/images/mario-waving.png" alt="Mario Waving" fill className="object-contain wave-anim" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-wider" style={{ textShadow: '4px 4px 0 rgba(0,0,0,0.5)' }}>
              Mario
            </h2>
            <p className="mt-2 text-sm font-bold text-yellow-300 uppercase tracking-widest">Welcome back, Player 1</p>
          </div>
        </div>

        <div className="w-full md:w-1/2 bg-white p-8 md:p-12">
          <div className="bg-yellow-200 p-2 mb-6 border-2 border-black rotate-1 inline-block">
            <h1 className="text-2xl font-black text-rose-500 text-center uppercase tracking-wider">Player 1, Press Start</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
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

            {error && (
              <div className="rounded-lg border-4 border-rose-400 bg-rose-50 p-3 text-sm font-black text-rose-600 uppercase">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              className="mario-btn mario-btn-black w-full uppercase font-black text-lg tracking-widest mt-6"
            >
              🎮 SIGN IN 🎮
            </button>
          </form>

          <div className="mt-8 border-t-4 border-black pt-6">
            <p className="text-center text-sm font-black text-black uppercase">
              No account yet?{' '}
              <Link href="/signup" className="text-rose-500 hover:text-rose-600 underline">
                Sign up!
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
