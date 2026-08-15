'use client';

import Link from "next/link";
import Image from "next/image";
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
    <main className="min-h-screen flex items-center justify-center px-4" style={{ backgroundImage: 'url(/images/background2.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="w-full max-w-md">
        <div className="rounded-2xl border-4 border-black bg-white p-8 shadow-2xl">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative w-20 h-20 rounded-full border-4 border-yellow-300 overflow-hidden shadow-lg">
              <Image src="/images/login-side.png" alt="Muragoods Login" fill className="object-cover" />
            </div>
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-widest text-rose-500">Muragoods</p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Player Login</p>
            </div>
          </div>

          <h1 className="text-3xl font-black text-black mb-2 text-center uppercase">Sign In</h1>
          <p className="text-sm font-bold text-slate-700 mb-6 text-center">Access your orders and favorites</p>

          <form onSubmit={handleLogin} className="space-y-4">
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
                {error}
              </div>
            )}

            <button
              type="submit"
              className="mario-btn mario-btn-black w-full uppercase font-black text-lg tracking-widest mt-6"
            >
              SIGN IN
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
