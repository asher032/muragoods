'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

interface Letter {
  shortId: string;
  recipientName: string;
  senderName: string;
  isAnonymous: boolean;
  title: string;
  content: string;
  theme: string;
  views: number;
  createdAt: string;
}

interface Song {
  shortId: string;
  recipientName: string;
  senderName: string;
  isAnonymous: boolean;
  songTitle: string;
  artist: string;
  message: string;
  views: number;
  createdAt: string;
}

const themeAccents: Record<string, string> = {
  default: '#ff6496', midnight: '#6496ff', sunset: '#ffb464', garden: '#64ff96', lavender: '#c896ff',
};

export default function GalleryPage() {
  const [tab, setTab] = useState<'all' | 'letters' | 'songs'>('all');
  const [letters, setLetters] = useState<Letter[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const res = await fetch('/api/untold-words/explore');
        const result = await res.json();
        if (result.success) {
          setLetters(result.letters || []);
          setSongs(result.songs || []);
        }
      } catch { /* empty */ }
      setLoading(false);
    }
    fetchAll();
  }, []);

  const allItems = [
    ...letters.map(l => ({ type: 'letter' as const, id: l.shortId, title: l.title, recipient: l.recipientName, sender: l.isAnonymous ? 'Anonymous' : l.senderName, theme: l.theme, views: l.views, date: l.createdAt, preview: l.content?.slice(0, 80) || '' })),
    ...songs.map(s => ({ type: 'song' as const, id: s.shortId, title: s.songTitle, recipient: s.recipientName, sender: s.isAnonymous ? 'Anonymous' : s.senderName, theme: 'default', views: s.views, date: s.createdAt, preview: `${s.artist} — ${s.message?.slice(0, 60) || ''}` })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = tab === 'all' ? allItems : tab === 'letters' ? allItems.filter(i => i.type === 'letter') : allItems.filter(i => i.type === 'song');

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Gallery" />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '80px 20px 100px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: 'clamp(22px, 5vw, 32px)', color: '#ffd60a', marginBottom: '8px', textShadow: '0 0 30px rgba(255,214,10,0.15)' }}>Untold Letters Gallery</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>Words people chose to send but never said out loud.</p>
          <div style={{ width: '40px', height: '2px', background: 'linear-gradient(90deg, transparent, #ffd60a, transparent)', margin: '16px auto 0' }} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', justifyContent: 'center' }}>
          {([['all', '✨ All'], ['letters', '💌 Letters'], ['songs', '🎵 Songs']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 18px', borderRadius: '10px', border: `1px solid ${tab === t ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.08)'}`, background: tab === t ? 'rgba(255,214,10,0.1)' : 'rgba(255,255,255,0.03)', color: tab === t ? '#ffd60a' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)', animation: 'pulse 2s ease infinite' }}>Loading letters...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px' }}>
            <p style={{ fontSize: '48px', marginBottom: '16px' }}>📭</p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '16px' }}>No letters yet — be the first to send one.</p>
            <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none' }}>Create a Letter →</Link>
          </div>
        )}

        {/* Masonry-style grid */}
        <div style={{ columns: 'clamp(1, min(3, 100vw / 300), 3)', columnGap: '16px' }}>
          {filtered.map((item, i) => (
            <Link key={item.id} href={item.type === 'letter' ? `/untold-words/letter/${item.id}` : `/untold-words/song/${item.id}`} style={{ textDecoration: 'none', breakInside: 'avoid', marginBottom: '16px', display: 'block' }}>
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '18px',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                animation: `fadeUp 0.4s ease ${i * 0.05}s both`,
                cursor: 'pointer',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = (themeAccents[item.theme] || '#ffd60a') + '55'; e.currentTarget.style.boxShadow = `0 12px 40px ${(themeAccents[item.theme] || '#ffd60a')}15`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* Color bar */}
                <div style={{ height: '3px', background: `linear-gradient(90deg, ${themeAccents[item.theme] || '#ffd60a'}, transparent)` }} />

                <div style={{ padding: '20px' }}>
                  {/* Type badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '8px', fontFamily: 'var(--font-arcade)', color: themeAccents[item.theme] || '#ffd60a', background: (themeAccents[item.theme] || '#ffd60a') + '15', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.1em' }}>
                      {item.type === 'letter' ? '💌 LETTER' : '🎵 SONG'}
                    </span>
                    {item.views > 0 && <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)' }}>👁 {item.views}</span>}
                  </div>

                  {/* Title */}
                  <h3 style={{ fontFamily: item.type === 'letter' ? 'Georgia, serif' : 'var(--font-arcade)', fontSize: item.type === 'letter' ? '16px' : '13px', color: themeAccents[item.theme] || '#ffd60a', marginBottom: '8px', lineHeight: 1.4 }}>
                    {item.type === 'letter' ? `&ldquo;${item.title}&rdquo;` : item.title}
                  </h3>

                  {/* Preview */}
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.preview}...
                  </p>

                  {/* Footer */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>For {item.recipient}</p>
                      <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)' }}>— {item.sender}</p>
                    </div>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>→</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '48px', padding: '32px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>Have something to say?</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/untold-words/letter/create" style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(255,100,150,0.3)', background: 'rgba(255,100,150,0.1)', color: '#ffb4a2', fontFamily: 'var(--font-arcade)', fontSize: '10px', textDecoration: 'none' }}>💌 Write a Letter</Link>
            <Link href="/untold-words/song/create" style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(123,47,247,0.3)', background: 'rgba(123,47,247,0.1)', color: '#e8b4f8', fontFamily: 'var(--font-arcade)', fontSize: '10px', textDecoration: 'none' }}>🎵 Send a Song</Link>
          </div>
        </div>
      </div>

      <style jsx>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
    </main>
  );
}
