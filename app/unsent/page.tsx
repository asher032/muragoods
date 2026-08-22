'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

interface Letter {
  _id: string;
  recipientName: string;
  content: string;
  category: string;
  likes: number;
  createdAt: string;
}

const categories = ['All', 'Love', 'Friendship', 'Appreciation', 'Regret', 'Memories', 'Moving On', 'Other'];

export default function UnsentHome() {
  const router = useRouter();
  const [searchName, setSearchName] = useState('');
  const [randomLetters, setRandomLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) setIsLoggedIn(true);

    async function fetchRandom() {
      try {
        const res = await fetch('/api/unsent?random=true');
        const result = await res.json();
        if (result.success) setRandomLetters(result.data);
      } catch { /* empty */ }
      setLoading(false);
    }
    fetchRandom();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchName.trim()) {
      router.push(`/unsent/archive?name=${encodeURIComponent(searchName.trim())}`);
    }
  };

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="The Unsent Project" />

      {/* Hero */}
      <section className="px-4 pt-16 pb-20 sm:px-8 text-center">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl text-[var(--cream)] uppercase leading-tight"
            style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}
          >
            The Unsent<br />Project
          </h1>
          <div className="h-[2px] w-32 bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent mx-auto mt-6" />
          <p className="mt-6 text-base sm:text-lg text-[var(--cream-muted)] max-w-lg mx-auto leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
            A collection of messages and letters that people write but never send.
            Discover words written for people who may never know they were written.
          </p>

          {/* Search */}
          <form onSubmit={handleSearch} className="mt-10 max-w-md mx-auto">
            <label className="block text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-3" style={{ fontFamily: 'var(--font-arcade)' }}>
              🔍 Search for a name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Enter a name..."
                className="deco-input rounded-xl flex-1"
              />
              <button type="submit" className="deco-btn deco-btn-gold rounded-xl">Search</button>
            </div>
          </form>

          {/* Quick Links */}
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link href="/unsent/archive" className="deco-btn rounded-xl">📚 Browse Archive</Link>
            {isLoggedIn && (
              <Link href="/unsent/submit" className="deco-btn deco-btn-gold rounded-xl">✉️ Submit a Letter</Link>
            )}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="px-4">
        <div className="deco-container">
          <div className="h-[2px] bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent" />
        </div>
      </div>

      {/* Random Letters */}
      <section className="px-4 py-12 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          <h2 className="text-xl text-[var(--cream)] uppercase text-center mb-8" style={{ fontFamily: 'var(--font-arcade)', textShadow: '2px 2px 0px var(--gold-dark)' }}>
            ✨ Recently Written
          </h2>

          {loading && (
            <div className="text-center py-12">
              <p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>LOADING...</p>
            </div>
          )}

          {!loading && randomLetters.length === 0 && (
            <div className="text-center py-12 border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl">
              <p className="text-sm text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>NO LETTERS YET</p>
              <p className="text-xs text-[var(--pewter)] mt-2">Be the first to submit an unsent letter!</p>
            </div>
          )}

          {!loading && randomLetters.length > 0 && (
            <div className="space-y-4">
              {randomLetters.map((letter) => (
                <div key={letter._id} className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl p-6 hover:border-[var(--gold)] transition-all group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[8px] px-3 py-1 border border-[rgba(242,240,228,0.15)] rounded-lg text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                      {letter.category}
                    </span>
                    <span className="text-[8px] text-[var(--pewter)]">{new Date(letter.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[10px] text-[var(--pewter)] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>To: {letter.recipientName}</p>
                  <p className="text-sm text-[var(--cream-muted)] leading-relaxed line-clamp-3">{letter.content}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-[9px] text-[var(--pewter)]">❤️ {letter.likes}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-center mt-8">
            <Link href="/unsent/archive" className="deco-btn deco-btn-gold rounded-xl">📚 View Full Archive</Link>
          </div>
        </div>
      </section>

      {/* Submit CTA */}
      {!isLoggedIn && (
        <section className="px-4 pb-16 sm:px-8">
          <div className="deco-container" style={{ maxWidth: '40rem' }}>
            <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.05)] rounded-2xl p-8 text-center">
              <p className="text-3xl mb-4">✉️</p>
              <h3 className="text-sm text-[var(--cream)] uppercase mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>Have something to say?</h3>
              <p className="text-sm text-[var(--pewter)] mb-4">Log in to submit your own unsent letter to the archive.</p>
              <Link href="/login" className="deco-btn deco-btn-gold rounded-xl">Log In to Submit</Link>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
