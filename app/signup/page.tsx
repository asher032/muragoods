'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();

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

    localStorage.setItem('user', JSON.stringify({ email, name }));
    router.push('/account/orders');
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-red-600 to-red-700 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="rounded-lg border-4 border-black bg-white p-8 shadow-2xl">
          <div className="diagonal-stripes rounded-lg p-6 mb-8 text-center relative">
            <div className="relative flex flex-col items-center gap-4">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-yellow-300 bg-red-600 text-5xl font-black text-white shadow-lg">
                M
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-yellow-300">Muragoods</p>
                <p className="text-xs font-bold uppercase tracking-widest text-yellow-100">Mario's Food</p>
              </div>
            </div>
          </div>

          <h1 className="text-4xl font-black text-black mb-2 text-center uppercase">🎮 JOIN MURAGOODS 🎮</h1>
          <p className="text-sm font-bold text-slate-700 mb-6 text-center">Create your account</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <label className="block text-sm font-black text-black uppercase">
              Full Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none transition focus:border-red-600 focus:bg-white"
                placeholder="Your name"
              />
            </label>

            <label className="block text-sm font-black text-black uppercase">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none transition focus:border-red-600 focus:bg-white"
                placeholder="your@email.com"
              />
            </label>

            <label className="block text-sm font-black text-black uppercase">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none transition focus:border-red-600 focus:bg-white"
                placeholder="••••••••"
              />
            </label>

            <label className="block text-sm font-black text-black uppercase">
              Confirm Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-2 w-full rounded-lg border-4 border-black bg-yellow-50 px-4 py-3 font-semibold text-black outline-none transition focus:border-red-600 focus:bg-white"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-lg border-4 border-red-600 bg-red-100 p-3 text-sm font-black text-red-700 uppercase">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              className="mario-btn w-full bg-yellow-400 text-black hover:bg-yellow-300 uppercase font-black text-lg tracking-widest mt-6 border-black"
            >
              ✨ CREATE ACCOUNT ✨
            </button>
          </form>

          <div className="mt-8 border-t-4 border-black pt-6">
            <p className="text-center text-sm font-black text-black uppercase">
              Have an account?{' '}
              <a href="/login" className="text-red-600 hover:text-red-700 underline">
                Sign in!
              </a>
            </p>
          </div>

          <a href="/" className="mario-btn mt-4 block text-center bg-red-600 text-white border-black hover:bg-red-700 uppercase font-black">
            ← Back to Shop
          </a>
        </div>
      </div>
    </main>
  );
}
