'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

interface Submission {
  type: 'letter' | 'confession' | 'song';
  id: string;
  title: string;
  preview: string;
  sender: string;
  artist?: string;
  date: string;
  views: number;
}

export default function MySubmissions() {
  const [loaded, setLoaded] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'letter' | 'confession' | 'song'>('all');

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all types
      const [letterRes, confessionRes, songRes] = await Promise.all([
        fetch('/api/untold-words/anonymous?limit=100'),
        fetch('/api/untold-words/confessions?limit=100'),
        fetch('/api/untold-words/explore'),
      ]);

      const all: Submission[] = [];

      const letterData = await letterRes.json();
      if (letterData.success && letterData.data) {
        letterData.data.forEach((l: Record<string, unknown>) => {
          all.push({
            type: 'letter', id: l.shortId as string, title: l.title as string,
            preview: (l.content as string || '').slice(0, 100),
            sender: 'Anonymous', views: (l.views as number) || 0, date: l.createdAt as string,
          });
        });
      }

      const confessionData = await confessionRes.json();
      if (confessionData.success && confessionData.data) {
        confessionData.data.forEach((c: Record<string, unknown>) => {
          all.push({
            type: 'confession', id: c.shortId as string, title: c.title as string,
            preview: (c.content as string || '').slice(0, 100),
            sender: 'Anonymous', views: (c.views as number) || 0, date: c.createdAt as string,
          });
        });
      }

      const songData = await songRes.json();
      const songs = songData.songs || songData.data || [];
      if (songData.success) {
        songs.forEach((s: Record<string, unknown>) => {
          all.push({
            type: 'song', id: s.shortId as string, title: s.songTitle as string,
            preview: (s.message as string || '').slice(0, 100),
            sender: s.isAnonymous ? 'Anonymous' : (s.senderName as string || 'Someone'),
            artist: s.artist as string, views: (s.views as number) || 0, date: s.createdAt as string,
          });
        });
      }

      all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setSubmissions(all);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  const handleDelete = async (type: string, id: string) => {
    if (!confirm('Are you sure you want to delete this? This cannot be undone.')) return;
    setDeleting(id);
    try {
      const endpoint = type === 'confession' ? '/api/untold-words/confessions' : '/api/untold-words/anonymous';
      const res = await fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shortId: id }) });
      const result = await res.json();
      if (result.success) setSubmissions(prev => prev.filter(s => s.id !== id));
    } catch { /* empty */ }
    setDeleting(null);
  };

  const filtered = submissions.filter(s => filter === 'all' || s.type === filter);
  const counts = { all: submissions.length, letter: submissions.filter(s => s.type === 'letter').length, confession: submissions.filter(s => s.type === 'confession').length, song: submissions.filter(s => s.type === 'song').length };

  const typeConfig: Record<string, { emoji: string; color: string; label: string }> = {
    letter: { emoji: '💌', color: '#ffb4a2', label: 'LETTER' },
    confession: { emoji: '✨', color: '#c896ff', label: 'CONFESSION' },
    song: { emoji: '🎵', color: '#1ed760', label: 'SONG' },
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="My Submissions" />
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '80px 20px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>📋</span>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#ffd60a', marginBottom: '8px' }}>My Submissions</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>All your letters, confessions, and songs</p>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {(['all', 'letter', 'confession', 'song'] as const).map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${filter === t ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.08)'}`, background: filter === t ? 'rgba(255,214,10,0.1)' : 'rgba(255,255,255,0.03)', color: filter === t ? '#ffd60a' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer', transition: 'all 0.2s' }}>
              {t === 'all' ? '✨ All' : t === 'letter' ? '💌 Letters' : t === 'confession' ? '✨ Confessions' : '🎵 Songs'} ({counts[t]})
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'rgba(255,255,255,0.3)', animation: 'pulse 2s ease infinite' }}>Loading...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px' }}>
            <p style={{ fontSize: '48px', marginBottom: '16px' }}>📭</p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>No submissions yet</p>
            <Link href="/untold-words" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', textDecoration: 'none' }}>Create something →</Link>
          </div>
        )}

        <div style={{ display: 'grid', gap: '12px' }}>
          {filtered.map((item, i) => {
            const cfg = typeConfig[item.type];
            const viewPath = item.type === 'confession' ? `/untold-words/confession/${item.id}` : item.type === 'song' ? `/untold-words/song/${item.id}` : `/untold-words/letter/${item.id}`;
            return (
              <div key={item.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '16px', animation: `fadeUp 0.3s ease ${i * 0.05}s both` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '8px', fontFamily: 'var(--font-arcade)', color: cfg.color, background: cfg.color + '15', padding: '2px 8px', borderRadius: '6px' }}>{cfg.emoji} {cfg.label}</span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>{item.views} views</span>
                  </div>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>{new Date(item.date).toLocaleDateString()}</span>
                </div>
                <Link href={viewPath} style={{ textDecoration: 'none' }}>
                  <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '15px', color: cfg.color, marginBottom: '4px', cursor: 'pointer' }}>{item.type === 'song' ? item.title : `\u201C${item.title}\u201D`}</h3>
                  {item.artist && <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>{item.artist}</p>}
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '12px' }}>{item.preview}</p>
                </Link>
                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                  <Link href={viewPath} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>👁 View</Link>
                  <button onClick={() => navigator.clipboard.writeText((typeof window !== 'undefined' ? window.location.origin : '') + viewPath)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer' }}>📋 Copy Link</button>
                  <button onClick={() => handleDelete(item.type, item.id)} disabled={deleting === item.id} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(230,57,70,0.3)', background: 'rgba(230,57,70,0.08)', color: '#e63946', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: deleting === item.id ? 'wait' : 'pointer', opacity: deleting === item.id ? 0.5 : 1 }}>{deleting === item.id ? '...' : '🗑 Delete'}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style jsx>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
      `}</style>
    </main>
  );
}
