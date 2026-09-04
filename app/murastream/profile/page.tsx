'use client';

import { useState, useEffect } from 'react';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';

export default function MuraStreamProfilePage() {
  const { likes, myList, history } = useMuraStreamStore();
  const [username, setUsername] = useState('User');

  useEffect(() => {
    try {
      const user = localStorage.getItem('user');
      if (user) {
        const parsed = JSON.parse(user);
        setUsername(parsed.name || parsed.username || parsed.email?.split('@')[0] || 'User');
      }
    } catch { /* empty */ }
  }, []);

  const moviesWatched = history.filter(h => h.mediaType === 'movie').length;
  const episodesWatched = history.filter(h => h.mediaType === 'tv').length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: '600px' }}>
      <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#E5E5E5', margin: '0 0 24px' }}>
        MURA PROFILE
      </h1>

      {/* Avatar + Name */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '20px',
        padding: '24px', background: '#111', borderRadius: '12px',
        border: '1px solid #1A1A1A', marginBottom: '24px',
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #B85CFF, #7C3AED)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-arcade)', fontSize: '20px', color: '#FFF',
        }}>
          {username.charAt(0).toUpperCase()}
        </div>
        <div>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: '#E5E5E5', margin: 0 }}>{username}</p>
          <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px', color: '#666', margin: '4px 0 0' }}>MuraStream Member</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px',
      }}>
        {[
          { label: 'Movies Watched', value: moviesWatched, color: '#B85CFF' },
          { label: 'Episodes Watched', value: episodesWatched, color: '#f42f25' },
          { label: 'Likes', value: likes.length, color: '#e63946' },
          { label: 'On My List', value: myList.length, color: '#06d6a0' },
        ].map(stat => (
          <div key={stat.label} style={{
            padding: '16px', background: '#111', borderRadius: '10px',
            border: '1px solid #1A1A1A', textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '24px', color: stat.color, margin: '0 0 4px' }}>
              {stat.value}
            </p>
            <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '11px', color: '#888', margin: 0 }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Total Watch Time */}
      <div style={{
        padding: '16px 20px', background: '#111', borderRadius: '10px',
        border: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#B85CFF' }}>🕐</span>
        <div>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: '#E5E5E5', margin: 0 }}>Total Titles Watched</p>
          <p style={{ fontFamily: '"Lucida Sans", Geneva, Verdana, sans-serif', fontSize: '12px', color: '#666', margin: '2px 0 0' }}>
            {history.length} title{history.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
