'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    // Simple validation - in production, connect to real auth
    if (email && password.length >= 6) {
      localStorage.setItem('user', JSON.stringify({ email, name: email.split('@')[0] }));
      router.push('/account/orders');
    } else {
      setError('Invalid email or password');
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fffef8,_#f7f0d8_22%,_#c2f2d4_58%,_#d7f3ff_100%)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="rounded-[36px] border border-white/60 bg-white/30 p-8 shadow-[0_30px_100px_rgba(88,116,51,0.12)] backdrop-blur">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-5xl font-black text-white ring-4 ring-yellow-200">
              M
            </div>
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-500">Muragoods</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Mínura-ng Pagkain</p>
            </div>
          </div>

          <h1 className="text-3xl font-black text-slate-900 mb-2">Login</h1>
          <p className="text-sm text-slate-600 mb-6">Sign in to your Muragoods account</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-orange-400"
                placeholder="your@email.com"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-orange-400"
                placeholder="••••••••"
              />
            </label>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            <button
              type="submit"
              className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-700"
            >
              Sign In
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-6">
            <p className="text-center text-sm text-slate-600">
              Don't have an account?{' '}
              <a href="/signup" className="font-bold text-orange-500 hover:text-orange-400">
                Sign up
              </a>
            </p>
          </div>

          <a href="/" className="mt-4 block text-center text-sm font-bold text-slate-600 hover:text-slate-900">
            Continue Shopping
          </a>
        </div>
      </div>
    </main>
  );
}
