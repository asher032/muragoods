'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

const categories = [
  { id: 'All', emoji: '✨', color: '#ffd60a' },
  { id: 'Confession', emoji: '💜', color: '#c896ff' },
  { id: 'Appreciation', emoji: '💛', color: '#ffd60a' },
  { id: 'Missing Someone', emoji: '💔', color: '#ff6496' },
  { id: 'Friendship', emoji: '🤝', color: '#64ff96' },
  { id: 'Crush', emoji: '🩷', color: '#ffb4da' },
  { id: 'Moving On', emoji: '🦋', color: '#6496ff' },
  { id: 'Random Thoughts', emoji: '💭', color: '#ffb464' },
];

interface Letter {
  shortId: string;
  title: string;
  content: string;
  category: string;
  likes: number;
  views: number;
  createdAt: string;
}

export default function AnonymousArchive() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLetters = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (activeCategory !== 'All') params.set('category', activeCategory);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/untold-words/anonymous?${params}`);
      const result = await res.json();
      if (result.success) {
        setLetters(result.data);
        setTotalPages(result.pages);
        setTotal(result.total);
      }
    } catch { /* empty */ }
    setLoading(false);
  }, [page, activeCategory, search]);

  useEffect(() => { fetchLetters(); }, [fetchLetters]);

  const handleCategoryChange = (cat: string) => { setActiveCategory(cat); setPage(1); };
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); };

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Anonymous Archive" />
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '80px 20px 100px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: 'clamp(20px, 5vw, 28px)', color: '#c896ff', marginBottom: '8px' }}>Anonymous Letters</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>Some words are meant to be shared, even when you don&apos;t want your name attached.</p>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '8px' }}>{total} letters shared</p>
          <div style={{ width: '40px', height: '2px', background: 'linear-gradient(90deg, transparent, #c896ff, transparent)', margin: '16px auto 0' }} />
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search letters..." style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
            <button type="submit" style={{ padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(200,150,255,0.3)', background: 'rgba(200,150,255,0.1)', color: '#c896ff', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>🔍</button>
          </div>
        </form>

        {/* Categories */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '24px' }}>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => handleCategoryChange(cat.id)} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${activeCategory === cat.id ? cat.color + '55' : 'rgba(255,255,255,0.06)'}`, background: activeCategory === cat.id ? cat.color + '12' : 'rgba(255,255,255,0.02)', color: activeCategory === cat.id ? cat.color : 'rgba(255,255,255,0.35)', fontSize: '9px', fontFamily: 'var(--font-arcade)', cursor: 'pointer', transition: 'all 0.2s' }}>
              {cat.emoji} {cat.id}
            </button>
          ))}
        </div>

        {/* Letters */}
        {loading && <div style={{ textAlign: 'center', padding: '40px' }}><p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)', animation: 'pulse 2s ease infinite' }}>Loading...</p></div>}

        {!loading && letters.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px' }}>
            <p style={{ fontSize: '36px', marginBottom: '12px' }}>📭</p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>No letters found</p>
            <Link href="/untold-words/anonymous/create" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#c896ff', textDecoration: 'none', display: 'inline-block', marginTop: '12px' }}>Be the first →</Link>
          </div>
        )}

        <div style={{ display: 'grid', gap: '12px' }}>
          {letters.map((letter, i) => {
            const cat = categories.find(c => c.id === letter.category);
            return (
              <Link key={letter.shortId} href={`/untold-words/anonymous/${letter.shortId}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px', transition: 'all 0.3s ease', animation: `fadeUp 0.4s ease ${i * 0.04}s both` }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = (cat?.color || '#c896ff') + '44'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '8px', fontFamily: 'var(--font-arcade)', color: cat?.color || '#c896ff', background: (cat?.color || '#c896ff') + '15', padding: '3px 8px', borderRadius: '6px' }}>{cat?.emoji} {letter.category}</span>
                    <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)' }}>{new Date(letter.createdAt).toLocaleDateString()}</span>
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '13px', color: cat?.color || '#c896ff', marginBottom: '8px' }}>{letter.title}</h3>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{letter.content}</p>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>❤️ {letter.likes}</span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>👁 {letter.views}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.3 : 1 }}>← Prev</button>
            <span style={{ padding: '8px 12px', fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.3 : 1 }}>Next →</button>
          </div>
        )}

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '40px', padding: '28px', border: '1px solid rgba(200,150,255,0.15)', borderRadius: '16px', background: 'rgba(200,150,255,0.04)' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>Have something to say?</p>
          <Link href="/untold-words/anonymous/create" style={{ display: 'inline-block', padding: '10px 24px', borderRadius: '10px', border: '1px solid rgba(200,150,255,0.3)', background: 'rgba(200,150,255,0.1)', color: '#c896ff', fontFamily: 'var(--font-arcade)', fontSize: '10px', textDecoration: 'none' }}>💌 Write Anonymously</Link>
        </div>
      </div>

      <style jsx>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } } @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
    </main>
  );
}
