'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

const categories = [
  { id: 'Confession', emoji: '💜', color: '#c896ff' },
  { id: 'Appreciation', emoji: '💛', color: '#ffd60a' },
  { id: 'Missing Someone', emoji: '💔', color: '#ff6496' },
  { id: 'Friendship', emoji: '🤝', color: '#64ff96' },
  { id: 'Crush', emoji: '🩷', color: '#ffb4da' },
  { id: 'Moving On', emoji: '🦋', color: '#6496ff' },
  { id: 'Random Thoughts', emoji: '💭', color: '#ffb464' },
];

export default function CreateAnonymousLetter() {
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Random Thoughts');

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/untold-words/anonymous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category }),
      });
      const result = await res.json();
      if (result.success) setCreated(result.data.shortId);
    } catch { /* empty */ }
    setCreating(false);
  };

  if (created) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Letter Published" />
        <div style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px', animation: 'float 3s ease-in-out infinite' }}>💌</div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#ffd60a', marginBottom: '8px' }}>Your anonymous letter is live!</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>It&apos;s now part of the Untold Letters archive.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              <Link href={`/untold-words/anonymous/${created}`} style={{ display: 'block', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.12)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', textAlign: 'center' }}>📖 Read Your Letter</Link>
              <Link href="/untold-words/anonymous/archive" style={{ display: 'block', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', textAlign: 'center' }}>📚 Browse Archive</Link>
              <Link href="/untold-words/anonymous/create" style={{ display: 'block', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', textAlign: 'center' }}>✍️ Write Another</Link>
            </div>
          </div>
        </div>
        <style jsx>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }`}</style>
      </main>
    );
  }

  const selectedCat = categories.find(c => c.id === category);

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Anonymous Letter" />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 20px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>💌</span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#c896ff', marginBottom: '8px' }}>Write an Anonymous Letter</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>Some words are meant to be shared, even when you don&apos;t want your name attached.</p>
        </div>

        <div style={{ display: 'grid', gap: '16px', opacity: loaded ? 1 : 0, transition: 'all 0.6s ease 0.2s' }}>
          {/* Category */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>Category</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setCategory(cat.id)} style={{ padding: '6px 12px', borderRadius: '10px', border: `1px solid ${category === cat.id ? cat.color + '66' : 'rgba(255,255,255,0.08)'}`, background: category === cat.id ? cat.color + '15' : 'rgba(255,255,255,0.03)', color: category === cat.id ? cat.color : 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: 'var(--font-arcade)', cursor: 'pointer', transition: 'all 0.2s' }}>
                  {cat.emoji} {cat.id}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your letter a title..." maxLength={100} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '16px', fontFamily: 'var(--font-arcade)', padding: '8px 0' }} />
            <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textAlign: 'right', marginTop: '4px' }}>{title.length}/100</p>
          </div>

          {/* Content */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Your Letter *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write what you've been holding inside..." rows={10} maxLength={2000} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'Georgia, serif', padding: '8px 0', resize: 'vertical', lineHeight: 2 }} />
            <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textAlign: 'right', marginTop: '4px' }}>{content.length}/2000</p>
          </div>

          {/* Privacy note */}
          <div style={{ background: 'rgba(255,214,10,0.04)', border: '1px solid rgba(255,214,10,0.12)', borderRadius: '12px', padding: '14px 16px' }}>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              🔒 <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Completely anonymous.</strong> No name, no email, no identity attached. Your letter is stored without any sender information. Anyone can read it in the archive, but no one will know who wrote it.
            </p>
          </div>

          {/* Submit */}
          <button onClick={handleCreate} disabled={creating || !title.trim() || !content.trim()} style={{ padding: '16px', borderRadius: '14px', border: `2px solid ${selectedCat?.color || '#c896ff'}44`, background: creating ? `${selectedCat?.color || '#c896ff'}05` : `${selectedCat?.color || '#c896ff'}18`, color: selectedCat?.color || '#c896ff', fontFamily: 'var(--font-arcade)', fontSize: '12px', cursor: creating || !title.trim() || !content.trim() ? 'not-allowed' : 'pointer', opacity: !title.trim() || !content.trim() ? 0.4 : 1, transition: 'all 0.2s' }}>
            {creating ? 'PUBLISHING...' : '💌 PUBLISH ANONYMOUSLY'}
          </button>
        </div>
      </div>
    </main>
  );
}
