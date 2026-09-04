'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';

type UserProfile = { name: string; email: string; role: string } | null;

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div style={{
      background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A',
      padding: '20px', textAlign: 'center', flex: '1 1 140px', minWidth: '140px',
    }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#E5E5E5', marginBottom: '4px' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#666', letterSpacing: '0.1em' }}>
        {label}
      </div>
    </div>
  );
}

export default function MuraStreamProfilePage() {
  const router = useRouter();
  const { likes, myList, history, animeProgress, settings, clearAllLibrary } = useMuraStreamStore();
  const [user, setUser] = useState<UserProfile>(null);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser({ name: parsed.name || 'User', email: parsed.email || '', role: parsed.role || 'user' });
      }
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 5000);
      return;
    }
    clearAllLibrary();
    setConfirmClear(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: '600px' }}>
        <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>Loading profile...</p>
        </div>
      </div>
    );
  }

  const moviesWatched = history.filter(h => h.mediaType === 'movie').length;
  const tvWatched = history.filter(h => h.mediaType === 'tv').length;
  const animeWatched = animeProgress.length;
  const totalEpisodes = animeProgress.reduce((sum, a) => sum + a.watchedEpisodes.length, 0);

  return (
    <div style={{ padding: '24px 28px', maxWidth: '600px' }}>
      {/* Header */}
      <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#E5E5E5', margin: '0 0 24px' }}>
        👤 Profile
      </h1>

      {/* User Card */}
      <div style={{
        background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A',
        padding: '24px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{
          width: '60px', height: '60px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #B85CFF, #7C3AED)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-arcade)', fontSize: '24px', color: '#FFF', flexShrink: 0,
        }}>
          {(user?.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#E5E5E5', margin: 0 }}>
            {user?.name || 'User'}
          </p>
          <p style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '12px', color: '#666', margin: '4px 0 0' }}>
            {user?.email}
          </p>
          {user?.role === 'admin' && (
            <span style={{
              fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#facc15',
              background: 'rgba(250,204,21,0.12)', padding: '2px 8px', borderRadius: '4px',
              marginTop: '4px', display: 'inline-block',
            }}>ADMIN</span>
          )}
        </div>
      </div>

      {/* Watch Stats */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#555', letterSpacing: '0.15em', margin: '0 0 12px' }}>
          WATCH STATS
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <StatCard label="MOVIES" value={moviesWatched} icon="🎬" />
          <StatCard label="TV SHOWS" value={tvWatched} icon="📺" />
          <StatCard label="ANIME" value={animeWatched} icon="🍥" />
          <StatCard label="EPISODES" value={totalEpisodes} icon="▶" />
        </div>
      </div>

      {/* Library Stats */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#555', letterSpacing: '0.15em', margin: '0 0 12px' }}>
          LIBRARY
        </p>
        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#E5E5E5' }}>❤️ Likes</span>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#B85CFF' }}>{likes.length}</span>
          </div>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#E5E5E5' }}>⭐ My List</span>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#B85CFF' }}>{myList.length}</span>
          </div>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#E5E5E5' }}>🕐 Watch History</span>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#B85CFF' }}>{history.length}</span>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#E5E5E5' }}>🍥 Anime Progress</span>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#B85CFF' }}>{animeProgress.length}</span>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#555', letterSpacing: '0.15em', margin: '0 0 12px' }}>
          QUICK LINKS
        </p>
        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A', overflow: 'hidden' }}>
          <Link href="/murastream/likes" style={{ padding: '14px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#E5E5E5' }}>❤️ My Likes</span>
            <span style={{ color: '#555', fontSize: '14px' }}>→</span>
          </Link>
          <Link href="/murastream/my-list" style={{ padding: '14px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#E5E5E5' }}>⭐ My List</span>
            <span style={{ color: '#555', fontSize: '14px' }}>→</span>
          </Link>
          <Link href="/murastream/history" style={{ padding: '14px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#E5E5E5' }}>🕐 Watch History</span>
            <span style={{ color: '#555', fontSize: '14px' }}>→</span>
          </Link>
          <Link href="/murastream/library" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#E5E5E5' }}>📚 Library</span>
            <span style={{ color: '#555', fontSize: '14px' }}>→</span>
          </Link>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#555', letterSpacing: '0.15em', margin: '0 0 12px' }}>
          ACCOUNT
        </p>
        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A', overflow: 'hidden' }}>
          <button onClick={handleClearAll} style={{
            width: '100%', padding: '14px 16px', borderBottom: '1px solid #1A1A1A',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#e63946' }}>
              {confirmClear ? '⚠️ Click again to confirm' : '🗑️ Clear All Library Data'}
            </span>
          </button>
          <button onClick={handleSignOut} style={{
            width: '100%', padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: '#e63946' }}>
              🚪 Sign Out
            </span>
            <span style={{ color: '#555', fontSize: '14px' }}>→</span>
          </button>
        </div>
      </div>

      {/* Back */}
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <Link href="/murastream" style={{
          fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#B85CFF',
          textDecoration: 'none', opacity: 0.7,
        }}>
          ← Back to MuraStream
        </Link>
      </div>
    </div>
  );
}
