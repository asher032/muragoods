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

export default function CreateConfession() {
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Confession');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return;
    if (visibility === 'public' && !showConfirm) { setShowConfirm(true); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/untold-words/confessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category, visibility }),
      });
      const result = await res.json();
      if (result.success) setCreated(result.data.shortId);
    } catch { /* empty */ }
    setCreating(false);
    setShowConfirm(false);
  };

  if (created) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Confession Published" />
        <div style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px', animation: 'float 3s ease-in-out infinite' }}>💜</div>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#ffd60a', marginBottom: '8px' }}>Your confession is live!</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>
              {visibility === 'public' ? 'It\'s now part of the Untold Words gallery.' : 'Only people with the link can see it.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Link href={`/untold-words/confession/${created}`} style={{ display: 'block', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.12)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', textAlign: 'center' }}>📖 Read Your Confession</Link>
              <Link href="/untold-words" style={{ display: 'block', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '11px', textDecoration: 'none', textAlign: 'center' }}>← Back to Untold Words</Link>
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
      <NavBar pageLabel="Anonymous Confession" />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 20px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>💜</span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#c896ff', marginBottom: '8px' }}>Anonymous Confession</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>Short thoughts, feelings, or things you want to get off your chest.</p>
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
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give it a title..." maxLength={100} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '16px', fontFamily: 'var(--font-arcade)', padding: '8px 0' }} />
            <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textAlign: 'right', marginTop: '4px' }}>{title.length}/100</p>
          </div>

          {/* Content */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#ffd60a', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Your Confession *</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write what you've been holding inside..." rows={8} maxLength={1500} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'Georgia, serif', padding: '8px 0', resize: 'vertical', lineHeight: 2 }} />
            <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', textAlign: 'right', marginTop: '4px' }}>{content.length}/1500</p>
          </div>

          {/* Visibility */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>Who can see this?</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setVisibility('public')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${visibility === 'public' ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.08)'}`, background: visibility === 'public' ? 'rgba(255,214,10,0.1)' : 'rgba(255,255,255,0.03)', color: visibility === 'public' ? '#ffd60a' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' }}>
                <span style={{ fontSize: '16px', display: 'block', marginBottom: '4px' }}>🌎</span>
                Public
                <span style={{ display: 'block', fontSize: '8px', marginTop: '4px', opacity: 0.6 }}>Visible in the gallery</span>
              </button>
              <button onClick={() => setVisibility('private')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${visibility === 'private' ? 'rgba(123,47,247,0.4)' : 'rgba(255,255,255,0.08)'}`, background: visibility === 'private' ? 'rgba(123,47,247,0.1)' : 'rgba(255,255,255,0.03)', color: visibility === 'private' ? '#e8b4f8' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' }}>
                <span style={{ fontSize: '16px', display: 'block', marginBottom: '4px' }}>🔒</span>
                Private
                <span style={{ display: 'block', fontSize: '8px', marginTop: '4px', opacity: 0.6 }}>Only with the link</span>
              </button>
            </div>
          </div>

          {/* Submit */}
          <button onClick={handleCreate} disabled={creating || !title.trim() || !content.trim()} style={{ padding: '16px', borderRadius: '14px', border: `2px solid ${selectedCat?.color || '#c896ff'}44`, background: creating ? `${selectedCat?.color || '#c896ff'}05` : `${selectedCat?.color || '#c896ff'}18`, color: selectedCat?.color || '#c896ff', fontFamily: 'var(--font-arcade)', fontSize: '12px', cursor: creating || !title.trim() || !content.trim() ? 'not-allowed' : 'pointer', opacity: !title.trim() || !content.trim() ? 0.4 : 1, transition: 'all 0.2s' }}>
            {creating ? 'PUBLISHING...' : visibility === 'public' ? '💜 PUBLISH ANONYMOUSLY' : '💜 PUBLISH PRIVATELY'}
          </button>
        </div>

        {/* Confirm Public Modal */}
        {showConfirm && (
          <div onClick={() => setShowConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', backdropFilter: 'blur(8px)' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#141428', border: '1px solid rgba(255,214,10,0.3)', borderRadius: '20px', padding: '32px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌎</div>
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: '#ffd60a', marginBottom: '12px' }}>Make this confession public?</h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>Anyone may be able to read this in the Untold Words gallery. Your identity will remain anonymous.</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleCreate} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,214,10,0.4)', background: 'rgba(255,214,10,0.12)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer' }}>Make Public</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
