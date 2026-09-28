'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

export default function PublicGameProfilePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const [profile, setProfile] = useState<{
    name: string; avatar: string; coins: number; level: number; into: number; need: number;
    totalXp: number; totalPlays: number; gamesPlayed: number; achievementCount: number;
    bestStreak: number; favorites: Array<{ contentId: string; title: string }>;
  } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/games/profile?user=${encodeURIComponent(key)}`);
        const data = await res.json();
        if (data.success) setProfile(data.profile);
        else setMissing(true);
      } catch { setMissing(true); }
    })();
  }, [key]);

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Player Profile" />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 90px' }}>
        <Link href="/games/leaderboards" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Leaderboards</Link>
        {missing && <p style={{ color: '#aaa', marginTop: 20 }}>Unknown or private player.</p>}
        {profile && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 18, padding: 26, marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {profile.avatar
                ? <img src={profile.avatar} alt="" width={56} height={56} style={{ borderRadius: 28 }} />
                : <span style={{ fontSize: 48 }}>🎮</span>}
              <div>
                <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: 0 }}>{profile.name}</h1>
                <p style={{ color: '#ffd60a', fontSize: 13, margin: '2px 0 0' }}>🎮 Game Level {profile.level}</p>
              </div>
            </div>
            <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', margin: '14px 0' }}>
              <div style={{ width: `${Math.round((profile.need ? profile.into / profile.need : 0) * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#7b2ff7,#ffd60a)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: '#ccc' }}>
              <span>🏆 {profile.achievementCount} Achievements</span>
              <span>🎯 {profile.totalPlays} Games Played</span>
              <span>🔥 Best streak {profile.bestStreak}</span>
              <span>🪙 {profile.coins.toLocaleString()} Coins</span>
            </div>
            {profile.favorites.length > 0 && (
              <>
                <h3 style={{ color: '#fff', fontSize: 14, margin: '16px 0 8px' }}>❤️ Favorite Games</h3>
                {profile.favorites.map(f => (
                  <p key={f.contentId} style={{ color: '#ddd', fontSize: 13, margin: '4px 0' }}>• {f.title}</p>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
