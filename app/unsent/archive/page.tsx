'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

interface Letter {
  _id: string;
  recipientName: string;
  content: string;
  category: string;
  likes: number;
  likedBy: string[];
  bookmarks: number;
  bookmarkedBy: string[];
  createdAt: string;
}

const categories = ['All', 'Love', 'Friendship', 'Appreciation', 'Regret', 'Memories', 'Moving On', 'Other'];
const categoryEmojis: Record<string, string> = {
  Love: '❤️', Friendship: '🤝', Appreciation: '💛', Regret: '😔',
  Memories: '📷', 'Moving On': '🦋', Other: '📝',
};

function ArchiveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialName = searchParams.get('name') || '';

  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState(initialName);
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('newest');
  const [userEmail, setUserEmail] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try { setUserEmail(JSON.parse(userStr).email); } catch { /* empty */ }
    }
  }, []);

  const fetchLetters = useCallback(async (reset = false) => {
    setLoading(true);
    const p = reset ? 1 : page;
    const params = new URLSearchParams();
    if (searchName) params.set('name', searchName);
    if (category !== 'All') params.set('category', category);
    params.set('sort', sort);
    params.set('page', String(p));
    params.set('limit', '20');

    try {
      const res = await fetch(`/api/unsent?${params}`);
      const result = await res.json();
      if (result.success) {
        if (reset) { setLetters(result.data); setPage(1); }
        else setLetters(prev => [...prev, ...result.data]);
        setTotalPages(result.totalPages || 1);
      }
    } catch { /* empty */ }
    setLoading(false);
  }, [searchName, category, sort, page]);

  useEffect(() => {
    fetchLetters(true);
  }, [searchName, category, sort]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLetters(true);
  };

  const handleLike = async (letter: Letter) => {
    if (!userEmail) { router.push('/login'); return; }
    try {
      const res = await fetch('/api/unsent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: letter._id, action: 'like', email: userEmail }),
      });
      const result = await res.json();
      if (result.success) {
        setLetters(prev => prev.map(l => l._id === letter._id ? { ...result.data } : l));
      }
    } catch { /* empty */ }
  };

  const handleBookmark = async (letter: Letter) => {
    if (!userEmail) { router.push('/login'); return; }
    try {
      const res = await fetch('/api/unsent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: letter._id, action: 'bookmark', email: userEmail }),
      });
      const result = await res.json();
      if (result.success) {
        setLetters(prev => prev.map(l => l._id === letter._id ? { ...result.data } : l));
      }
    } catch { /* empty */ }
  };

  return (
    <>
      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Search by name..."
            className="deco-input rounded-xl flex-1"
          />
          <button type="submit" className="deco-btn deco-btn-gold rounded-xl">🔍</button>
        </div>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 border rounded-lg text-[8px] transition-all ${category === cat ? 'border-[var(--gold)] bg-[var(--gold)] text-[var(--obsidian)]' : 'border-[rgba(242,240,228,0.12)] text-[var(--pewter)] hover:border-[var(--gold)]'}`}
            style={{ fontFamily: 'var(--font-arcade)' }}
          >
            {cat !== 'All' && categoryEmojis[cat]} {cat}
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="deco-select rounded-lg ml-auto"
          style={{ width: 'auto', padding: '6px 28px 6px 10px', fontSize: '9px' }}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
      </div>

      {/* Results */}
      {loading && letters.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>LOADING...</p>
        </div>
      )}

      {!loading && letters.length === 0 && (
        <div className="text-center py-16 border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl">
          <p className="text-4xl mb-4">📭</p>
          <p className="text-sm text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
            {searchName ? `No letters for "${searchName}"` : 'No letters yet'}
          </p>
          {searchName && (
            <button onClick={() => { setSearchName(''); }} className="deco-btn deco-btn-sm mt-4 rounded-xl">Clear Search</button>
          )}
        </div>
      )}

      {/* Letter Cards */}
      <div className="space-y-4">
        {letters.map(letter => {
          const isExpanded = expandedId === letter._id;
          const isLiked = userEmail && letter.likedBy?.includes(userEmail);
          const isBookmarked = userEmail && letter.bookmarkedBy?.includes(userEmail);
          return (
            <div key={letter._id} className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl overflow-hidden hover:border-[var(--gold)] transition-all">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[8px] px-3 py-1 border border-[rgba(242,240,228,0.15)] rounded-lg text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                    {categoryEmojis[letter.category] || '📝'} {letter.category}
                  </span>
                  <span className="text-[8px] text-[var(--pewter)]">{new Date(letter.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-[10px] text-[var(--gold)] mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>To: {letter.recipientName}</p>
                <p className={`text-sm text-[var(--cream-muted)] leading-relaxed whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-4'}`}>
                  {letter.content}
                </p>
                {letter.content.length > 200 && (
                  <button onClick={() => setExpandedId(isExpanded ? null : letter._id)} className="text-[9px] text-[var(--gold)] mt-2 hover:text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                    {isExpanded ? '← Show less' : 'Read more →'}
                  </button>
                )}
              </div>
              <div className="border-t border-[rgba(242,240,228,0.08)] px-5 py-3 flex items-center gap-4">
                <button onClick={() => handleLike(letter)} className={`flex items-center gap-1.5 text-[9px] transition-colors ${isLiked ? 'text-[var(--crimson)]' : 'text-[var(--pewter)] hover:text-[var(--crimson)]'}`}>
                  <span>{isLiked ? '❤️' : '🤍'}</span>
                  <span style={{ fontFamily: 'var(--font-arcade)' }}>{letter.likes || 0}</span>
                </button>
                <button onClick={() => handleBookmark(letter)} className={`flex items-center gap-1.5 text-[9px] transition-colors ${isBookmarked ? 'text-[var(--gold-bright)]' : 'text-[var(--pewter)] hover:text-[var(--gold-bright)]'}`}>
                  <span>{isBookmarked ? '🔖' : '📑'}</span>
                  <span style={{ fontFamily: 'var(--font-arcade)' }}>{letter.bookmarks || 0}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More */}
      {!loading && page < totalPages && (
        <div className="text-center mt-6">
          <button onClick={() => { setPage(p => p + 1); fetchLetters(); }} className="deco-btn rounded-xl">Load More</button>
        </div>
      )}
    </>
  );
}

export default function ArchivePage() {
  return (
    <main className="min-h-screen">
      <NavBar pageLabel="The Archive" />
      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              📚 The Archive
            </h1>
            <p className="mt-2 text-sm text-[var(--pewter)]">Browse unsent letters written for people</p>
          </div>
          <Suspense fallback={<div className="text-center py-16"><p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>LOADING...</p></div>}>
            <ArchiveContent />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
