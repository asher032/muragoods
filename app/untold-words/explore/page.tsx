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
  theme: string;
  createdAt: string;
}

interface Song {
  shortId: string;
  recipientName: string;
  senderName: string;
  isAnonymous: boolean;
  songTitle: string;
  artist: string;
  createdAt: string;
}

const themeAccents: Record<string, string> = {
  default: '#ff6496', midnight: '#6496ff', sunset: '#ffb464', garden: '#64ff96', lavender: '#c896ff',
};

export default function ExplorePage() {
  const [tab, setTab] = useState<'letters' | 'songs'>('letters');
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

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Explore" />
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '80px 20px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#ffd60a', marginBottom: '8px' }}>Explore Untold Words</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Public messages from the community</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {(['letters', 'songs'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `1px solid ${tab === t ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.08)'}`, background: tab === t ? 'rgba(255,214,10,0.1)' : 'rgba(255,255,255,0.03)', color: tab === t ? '#ffd60a' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s' }}>
              {t === 'letters' ? '💌 Letters' : '🎵 Songs'}
            </button>
          ))}
        </div>

        {loading && <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px', padding: '40px' }}>Loading...</p>}

        {!loading && tab === 'letters' && letters.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
            <p style={{ fontSize: '36px', marginBottom: '12px' }}>💌</p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>No public letters yet</p>
            <Link href="/untold-words/letter/create" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none', display: 'inline-block', marginTop: '12px' }}>Be the first →</Link>
          </div>
        )}

        {!loading && tab === 'songs' && songs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
            <p style={{ fontSize: '36px', marginBottom: '12px' }}>🎵</p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>No public songs yet</p>
            <Link href="/untold-words/song/create" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none', display: 'inline-block', marginTop: '12px' }}>Be the first →</Link>
          </div>
        )}

        <div style={{ display: 'grid', gap: '12px' }}>
          {tab === 'letters' && letters.map(l => (
            <Link key={l.shortId} href={`/untold-words/letter/${l.shortId}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px', transition: 'all 0.3s ease', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,100,150,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: themeAccents[l.theme] || themeAccents.default, flexShrink: 0 }} />
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: themeAccents[l.theme] || themeAccents.default }}>&ldquo;{l.title}&rdquo;</p>
                </div>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>For {l.recipientName}</p>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>— {l.isAnonymous ? 'Anonymous' : l.senderName}</p>
              </div>
            </Link>
          ))}

          {tab === 'songs' && songs.map(s => (
            <Link key={s.shortId} href={`/untold-words/song/${s.shortId}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px', transition: 'all 0.3s ease', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(123,47,247,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #7b2ff7, #ff6496)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '20px' }}>🎵</span>
                </div>
                <div>
                  <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#e8b4f8', marginBottom: '2px' }}>{s.songTitle}</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{s.artist}</p>
                  <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>For {s.recipientName} — {s.isAnonymous ? 'Anonymous' : s.senderName}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
