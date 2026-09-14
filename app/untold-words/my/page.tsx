'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { ClipboardList, Eye, Inbox, Mail, Music, Sparkles, Trash2, X } from 'lucide-react';
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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
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
            preview: (l.content as string || '').slice(0, 120),
            sender: 'Anonymous', views: (l.views as number) || 0, date: l.createdAt as string,
          });
        });
      }

      const confessionData = await confessionRes.json();
      if (confessionData.success && confessionData.data) {
        confessionData.data.forEach((c: Record<string, unknown>) => {
          all.push({
            type: 'confession', id: c.shortId as string, title: c.title as string,
            preview: (c.content as string || '').slice(0, 120),
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
            preview: (s.message as string || '').slice(0, 120),
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
    setDeleting(id);
    try {
      let endpoint = '/api/untold-words/anonymous';
      if (type === 'confession') endpoint = '/api/untold-words/confessions';
      if (type === 'song') endpoint = '/api/untold-words/songs';
      const res = await fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shortId: id }) });
      const result = await res.json();
      if (result.success) {
        setSubmissions(prev => prev.filter(s => s.id !== id));
        setConfirmDelete(null);
      }
    } catch { /* empty */ }
    setDeleting(null);
  };

  const filtered = submissions.filter(s => filter === 'all' || s.type === filter);
  const counts = { all: submissions.length, letter: submissions.filter(s => s.type === 'letter').length, confession: submissions.filter(s => s.type === 'confession').length, song: submissions.filter(s => s.type === 'song').length };

  const typeConfig: Record<string, { emoji: React.ReactNode; gradient: string; color: string; label: string; bg: string }> = {
    letter: { emoji: <Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, gradient: 'linear-gradient(135deg, #ff6b9d, #c44569)', color: '#ffb4a2', label: 'LETTER', bg: 'rgba(255,100,150,0.08)' },
    confession: { emoji: <Sparkles color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, gradient: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#c896ff', label: 'CONFESSION', bg: 'rgba(168,85,247,0.08)' },
    song: { emoji: <Music color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, gradient: 'linear-gradient(135deg, #10b981, #059669)', color: '#1ed760', label: 'SONG', bg: 'rgba(16,185,129,0.08)' },
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="My Submissions" />
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '80px 20px 100px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px', opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #ffd60a, #fb8500)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(255,214,10,0.2)' }}>
            <span style={{ fontSize: '28px' }}><ClipboardList className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#ffd60a', marginBottom: '8px' }}>My Submissions</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Manage your letters, confessions, and songs</p>
        </div>

        {/* Stats Bar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
          {[
            { type: 'letter' as const, count: counts.letter, emoji: <Mail className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
            { type: 'confession' as const, count: counts.confession, emoji: <Sparkles color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
            { type: 'song' as const, count: counts.song, emoji: <Music color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
          ].map(s => (
            <div key={s.type} style={{ flex: 1, maxWidth: '120px', padding: '12px 8px', background: typeConfig[s.type].bg, border: `1px solid ${typeConfig[s.type].color}20`, borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '18px' }}>{s.emoji}</span>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: typeConfig[s.type].color, marginTop: '4px' }}>{s.count}</p>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontFamily: 'var(--font-arcade)' }}>{s.type}s</p>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {(['all', 'letter', 'confession', 'song'] as const).map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${filter === t ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.08)'}`, background: filter === t ? 'rgba(255,214,10,0.12)' : 'rgba(255,255,255,0.03)', color: filter === t ? '#ffd60a' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer', transition: 'all 0.2s' }}>
              {t === 'all' ? 'All' : t === 'letter' ? 'Letters' : t === 'confession' ? 'Confessions' : 'Songs'} ({counts[t]})
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,214,10,0.2)', borderTopColor: '#ffd60a', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Loading...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '20px' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px', opacity: 0.5 }}><Inbox className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '16px' }}>No submissions yet</p>
            <Link href="/untold-words" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', background: 'rgba(255,214,10,0.1)', border: '1px solid rgba(255,214,10,0.3)', color: '#ffd60a', fontFamily: 'var(--font-arcade)', fontSize: '10px', textDecoration: 'none' }}><Sparkles color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Create something</Link>
          </div>
        )}

        {/* Cards */}
        <div style={{ display: 'grid', gap: '12px' }}>
          {filtered.map((item, i) => {
            const cfg = typeConfig[item.type];
            const viewPath = item.type === 'confession' ? `/untold-words/confession/${item.id}` : item.type === 'song' ? `/untold-words/song/${item.id}` : `/untold-words/letter/${item.id}`;
            const isDeleting = deleting === item.id;
            const isConfirming = confirmDelete === item.id;

            return (
              <div key={item.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden', transition: 'all 0.3s ease', opacity: isDeleting ? 0.5 : 1, transform: isDeleting ? 'scale(0.98)' : 'scale(1)', animation: `fadeUp 0.3s ease ${i * 0.05}s both` }}>
                {/* Gradient top bar */}
                <div style={{ height: '3px', background: cfg.gradient }} />

                <div style={{ padding: '16px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '8px', fontFamily: 'var(--font-arcade)', color: cfg.color, background: cfg.color + '15', padding: '3px 10px', borderRadius: '6px', letterSpacing: '0.08em' }}>{cfg.emoji} {cfg.label}</span>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}><Eye className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {item.views}</span>
                    </div>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>

                  {/* Content */}
                  <Link href={viewPath} style={{ textDecoration: 'none', display: 'block' }}>
                    <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '16px', color: cfg.color, marginBottom: '4px', cursor: 'pointer', lineHeight: 1.3 }}>{`"${item.title}"`}</h3>
                    {item.artist && <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}><Music color={'#06d6a0'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {item.artist}</p>}
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '14px' }}>{item.preview}</p>
                  </Link>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                    <Link href={viewPath} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `1px solid ${cfg.color}30`, background: cfg.bg, color: cfg.color, fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', transition: 'all 0.2s' }}><Eye className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> View</Link>
                    <button onClick={() => navigator.clipboard.writeText((typeof window !== 'undefined' ? window.location.origin : '') + viewPath)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer', transition: 'all 0.2s' }}><ClipboardList className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Copy</button>

                    {/* Delete with confirmation */}
                    {isConfirming ? (
                      <div style={{ flex: 1, display: 'flex', gap: '4px' }}>
                        <button onClick={() => handleDelete(item.type, item.id)} disabled={isDeleting} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(230,57,70,0.5)', background: 'rgba(230,57,70,0.15)', color: '#e63946', fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: isDeleting ? 'wait' : 'pointer', transition: 'all 0.2s' }}>{isDeleting ? '...' : 'Confirm'}</button>
                        <button onClick={() => setConfirmDelete(null)} style={{ padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer' }}><X className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(item.id)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(230,57,70,0.2)', background: 'rgba(230,57,70,0.06)', color: '#e63946', fontFamily: 'var(--font-arcade)', fontSize: '9px', cursor: 'pointer', transition: 'all 0.2s' }}><Trash2 className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Delete</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style jsx>{`\n        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }\n        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }\n      `}</style>
    </main>
  );
}
