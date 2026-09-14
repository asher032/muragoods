'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { Bird, Cloud, Eye, Flower2, Handshake, Heart, HeartCrack, Inbox, Mail, Music } from 'lucide-react';
interface GalleryItem {
  type: 'letter' | 'confession' | 'song';
  id: string;
  title: string;
  content?: string;
  preview: string;
  sender: string;
  recipient?: string;
  category?: string;
  artist?: string;
  artwork?: string;
  theme?: string;
  views: number;
  date: string;
}

const themeAccents: Record<string, string> = {
  default: '#ff6496', midnight: '#6496ff', sunset: '#ffb464', garden: '#64ff96', lavender: '#c896ff',
};

const catColors: Record<string, { emoji: React.ReactNode; color: string }> = {
  Confession: { emoji: <Heart color={'#c896ff'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color: '#c896ff' },
  Appreciation: { emoji: <Heart color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color: '#ffd60a' },
  'Missing Someone': { emoji: <HeartCrack color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color:'#ff6496' },
  Friendship: { emoji: <Handshake className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color: '#64ff96' },
  Crush: { emoji: <Flower2 color={'#ff4d8d'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color: '#ffb4da' },
  'Moving On': { emoji: <Bird className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color:'#6496ff' },
  'Random Thoughts': { emoji: <Cloud className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, color:'#ffb464' },
};

export default function UntoldWordsHome() {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'all' | 'letters' | 'songs'>('all');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [letterRes, confessionRes, songRes] = await Promise.all([
        fetch('/api/untold-words/anonymous?limit=50'),
        fetch('/api/untold-words/confessions?limit=50'),
        fetch('/api/untold-words/explore'),
      ]);

      const letterData = await letterRes.json();
      const confessionData = await confessionRes.json();
      const songData = await songRes.json();

      const allItems: GalleryItem[] = [];

      if (letterData.success && letterData.data) {
        letterData.data.forEach((l: Record<string, unknown>) => {
          allItems.push({
            type: 'letter',
            id: l.shortId as string,
            title: l.title as string,
            preview: (l.content as string || '').slice(0, 120),
            sender: 'Anonymous',
            category: l.category as string,
            views: l.views as number || 0,
            date: l.createdAt as string,
            theme: 'lavender',
          });
        });
      }

      if (confessionData.success && confessionData.data) {
        confessionData.data.forEach((c: Record<string, unknown>) => {
          allItems.push({
            type: 'confession',
            id: c.shortId as string,
            title: c.title as string,
            preview: (c.content as string || '').slice(0, 120),
            sender: 'Anonymous',
            category: c.category as string,
            views: c.views as number || 0,
            date: c.createdAt as string,
            theme: 'default',
          });
        });
      }

      if (songData.success) {
        const songs = songData.songs || songData.data || [];
        songs.forEach((s: Record<string, unknown>) => {
          allItems.push({
            type: 'song',
            id: s.shortId as string,
            title: s.songTitle as string,
            preview: s.message as string || '',
            sender: s.isAnonymous ? 'Anonymous' : (s.senderName as string || 'Someone'),
            recipient: s.recipientName as string,
            artist: s.artist as string,
            views: s.views as number || 0,
            date: s.createdAt as string,
          });
        });
      }

      // Shuffle gallery on each visit for variety
      for (let i = allItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
      }
      setItems(allItems);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filtered = items.filter(item => {
    if (tab === 'letters' && item.type !== 'letter') return false;
    if (tab === 'songs' && item.type !== 'song') return false;
    if (search && !item.title.toLowerCase().includes(search.toLowerCase()) && !item.preview.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Untold Words" />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '80px 20px 100px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '40px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.8s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '20px' }}>
            {[<Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, , <Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />].map((e, i) => (
              <span key={i} style={{ fontSize: '24px', animation: `float ${3 + i * 0.5}s ease-in-out infinite`, animationDelay: `${i * 0.3}s` }}>{e}</span>
            ))}
          </div>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: 'clamp(24px, 6vw, 40px)', color: '#ffd60a', letterSpacing: '-0.02em', lineHeight: 1.2, textShadow: '0 0 40px rgba(255,214,10,0.15)', marginBottom: '12px' }}>
            Untold Words
          </h1>
          <div style={{ width: '50px', height: '2px', background: 'linear-gradient(90deg, transparent, #ffd60a, transparent)', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', maxWidth: '440px', margin: '0 auto', lineHeight: 1.7 }}>
            Some things are easier to say through a letter, a confession, or a song.
          </p>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
          {([['all', 'All'], ['letters', 'Letters'], ['songs', 'Songs']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', borderRadius: '10px', border: `1px solid ${tab === t ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.08)'}`, background: tab === t ? 'rgba(255,214,10,0.1)' : 'rgba(255,255,255,0.03)', color: tab === t ? '#ffd60a' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ marginBottom: '28px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search letters, confessions, songs..." style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {/* Create Something */}
        <div style={{ marginBottom: '40px', opacity: loaded ? 1 : 0, transition: 'all 0.6s ease 0.3s' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px', textAlign: 'center' }}>Create something</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <Link href="/untold-words/confession/create" style={{ textDecoration: 'none' }}>
              <div className="untold-create-card" style={{ background: 'linear-gradient(135deg, rgba(200,150,255,0.08), rgba(200,150,255,0.02))', border: '1px solid rgba(200,150,255,0.2)', borderRadius: '16px', padding: '24px 16px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(200,150,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}><Heart color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
                <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#c896ff', marginBottom: '6px' }}>Anonymous Confession</h3>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>Short thoughts, feelings, things you want off your chest</p>
              </div>
            </Link>
            <Link href="/untold-words/letter/create" style={{ textDecoration: 'none' }}>
              <div className="untold-create-card" style={{ background: 'linear-gradient(135deg, rgba(255,100,150,0.08), rgba(255,100,150,0.02))', border: '1px solid rgba(255,100,150,0.2)', borderRadius: '16px', padding: '24px 16px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(255,100,150,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}><Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
                <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#ffb4a2', marginBottom: '6px' }}>Anonymous Letter</h3>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>Longer personal letters, completely anonymous</p>
              </div>
            </Link>
            <Link href="/untold-words/song/create" style={{ textDecoration: 'none' }}>
              <div className="untold-create-card" style={{ background: 'linear-gradient(135deg, rgba(30,215,96,0.06), rgba(123,47,247,0.04))', border: '1px solid rgba(30,215,96,0.2)', borderRadius: '16px', padding: '24px 16px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(30,215,96,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}><Music color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
                <h3 style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#1ed760', marginBottom: '6px' }}>Send a Song</h3>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>Express your message through a song</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Gallery */}
        <div style={{ opacity: loaded ? 1 : 0, transition: 'all 0.6s ease 0.5s' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px', textAlign: 'center' }}>Explore Untold Words</p>

          {loading && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)', animation: 'pulse 2s ease infinite' }}>Loading...</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px' }}>
              <p style={{ fontSize: '48px', marginBottom: '16px' }}><Inbox className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></p>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>No letters yet</p>
              <Link href="/untold-words/letter/create" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none' }}>Be the first →</Link>
            </div>
          )}

          {/* Horizontal Scrollable Cards */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '16px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {filtered.slice(0, 8).map((item, i) => {
                const accent = item.type === 'confession'
                  ? (catColors[item.category || '']?.color || '#c896ff')
                  : item.type === 'song' ? '#1ed760' : '#ffb4a2';
                const bg = item.type === 'confession'
                  ? 'linear-gradient(135deg, #2d1b4e, #1a0a3e)'
                  : item.type === 'song'
                  ? 'linear-gradient(135deg, #0a2a4a, #0d1b3e)'
                  : 'linear-gradient(135deg, #3e2a0a, #1a1a2e)';
                const viewPath = item.type === 'confession' ? `/untold-words/confession/${item.id}` : item.type === 'song' ? `/untold-words/song/${item.id}` : `/untold-words/letter/${item.id}`;
                return (
                  <Link key={item.id} href={viewPath} style={{ textDecoration: 'none', flexShrink: 0, width: '260px', scrollSnapAlign: 'start' }}>
                    <div style={{ background: bg, border: `1px solid ${accent}30`, borderRadius: '18px', overflow: 'hidden', height: '220px', display: 'flex', flexDirection: 'column', transition: 'all 0.3s ease', cursor: 'pointer', position: 'relative' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 32px ${accent}20`; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      {/* Glow line */}
                      <div style={{ height: '3px', background: `linear-gradient(90deg, ${accent}, transparent)` }} />
                      {/* Content */}
                      <div style={{ padding: '18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: accent, background: accent + '18', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.1em' }}>
                            {item.type === 'confession' ? 'CONFESSION' : item.type === 'song' ? 'SONG' : 'LETTER'}
                          </span>
                          {item.views > 0 && <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)' }}><Eye className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {item.views}</span>}
                        </div>
                        <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '15px', color: accent, marginBottom: '6px', lineHeight: 1.3, flexShrink: 0 }}>{`“${item.title}”`}</h3>
                        {item.artist && <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px', flexShrink: 0 }}>{item.artist}</p>}
                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.preview || ''}</p>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                          <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>— {item.sender}</p>
                          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: accent }}>Read →</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Flat Grid for remaining items */}
          {filtered.length > 3 && (
            <div style={{ columns: 'clamp(1, min(3, 100vw / 300), 3)', columnGap: '16px', marginTop: '24px' }}>
              {filtered.slice(3).map((item, i) => {
                const accent = item.type === 'confession'
                  ? (catColors[item.category || '']?.color || '#c896ff')
                  : item.type === 'song' ? '#1ed760' : '#ffb4a2';
                const typeLabel = item.type === 'confession' ? 'CONFESSION' : item.type === 'song' ? 'SONG' : 'LETTER';
                const viewPath = item.type === 'confession' ? `/untold-words/confession/${item.id}` : item.type === 'song' ? `/untold-words/song/${item.id}` : `/untold-words/letter/${item.id}`;
                return (
                  <Link key={item.id} href={viewPath} style={{ textDecoration: 'none', breakInside: 'avoid', marginBottom: '16px', display: 'block' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px', overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)', animation: `fadeUp 0.4s ease ${i * 0.05}s both`, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = accent + '55'; e.currentTarget.style.boxShadow = `0 12px 40px ${accent}15`; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{ height: '3px', background: `linear-gradient(90deg, ${accent}, transparent)` }} />
                      <div style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <span style={{ fontSize: '8px', fontFamily: 'var(--font-arcade)', color: accent, background: accent + '15', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.1em' }}>{typeLabel}</span>
                          {item.views > 0 && <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)' }}><Eye className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {item.views}</span>}
                        </div>
                        <h3 style={{ fontFamily: item.type === 'song' ? 'var(--font-arcade)' : 'Georgia, serif', fontSize: item.type === 'song' ? '13px' : '16px', color: accent, marginBottom: '8px', lineHeight: 1.4 }}>
                          {item.type === 'song' ? item.title : `\u201C${item.title}\u201D`}
                        </h3>
                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, marginBottom: '12px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.preview || ''}</p>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>— {item.sender}</p>
                          <span style={{ fontSize: '10px', color: accent, fontFamily: 'var(--font-arcade)' }}>Read →</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer quote */}
        <div style={{ textAlign: 'center', marginTop: '48px', padding: '32px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', marginBottom: '8px' }}>&ldquo;Some words are easier to send than to say.&rdquo;</p>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'rgba(255,255,255,0.12)', letterSpacing: '0.15em' }}>MADE WITH MURAGOODS</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }

        /* Hide scrollbar on horizontal scroll */
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </main>
  );
}
