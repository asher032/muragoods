'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

const ART: Record<string, string> = {
  spin: '🎡', trivia: '🧠', memory: '🃏', flappy: '🐤',
  checkin: '📅', mysterybox: '🎁', refer: '💌',
};

const HOW_TO: Record<string, string[]> = {
  spin: ['Each spin costs 15 coins (charged server-side).', '3 spins per day — the wheel animates to your real prize.', 'Prizes are rolled on the server, up to 50 coins.'],
  trivia: ['10 questions per run, 2 runs per day.', 'Correct answers build score; streaks and speed pay more.', 'Final score converts to coins (capped daily).'],
  memory: ['Flip cards and clear the whole board.', 'Fewer moves + faster time = bigger reward.', 'Hard boards unlock achievements.'],
  flappy: ['Tap to fly, dodge the pipes.', 'Every 2 pipes earns a coin (capped per run).', 'Scores of 20+ unlock achievements.'],
  checkin: ['Check in once per day.', 'Consecutive days grow your streak and reward.', 'Day 7 pays the MEGA reward.'],
  mysterybox: ['Each box costs 10 coins (charged server-side).', 'Coin prizes, percent-off codes and legendary pulls.', 'Discount codes are single-use server promos for checkout.'],
  refer: ['Share your referral code with friends.', 'You earn when they sign up — credited server-side.'],
};

interface FavState { favorite: boolean; save: boolean }

export default function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [def, setDef] = useState<{ title: string; description: string; category: string; route: string; maxPlaysPerDay: number } | null>(null);
  const [progress, setProgress] = useState<{ bestScore: number; plays: number; xp: number; achievements: string[]; lastPlayed?: string } | null>(null);
  const [fav, setFav] = useState<FavState>({ favorite: false, save: false });
  const [leaders, setLeaders] = useState<Array<{ key: string; name: string; value: number }>>([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem('user')));
    (async () => {
      try {
        const d = await fetch('/api/games/definitions').then(r => r.json());
        const g = (d.games || []).find((x: { gameId: string }) => x.gameId === id);
        if (g) setDef(g);
      } catch { /* offline */ }
      try {
        const p = await fetch(`/api/games/progress?gameId=${encodeURIComponent(id)}`).then(r => r.json());
        if (p.success && p.progress) setProgress(p.progress);
      } catch { /* signed out */ }
      try {
        const f = await fetch(`/api/favorites?type=game&action=favorite`).then(r => r.json());
        if (f.success) setFav({
          favorite: (f.rows || []).some((r: { contentId: string }) => r.contentId === id),
          save: false,
        });
        const s = await fetch(`/api/favorites?type=game&action=save`).then(r => r.json());
        if (s.success) setFav(prev => ({
          ...prev,
          save: (s.rows || []).some((r: { contentId: string }) => r.contentId === id),
        }));
      } catch { /* signed out */ }
      try {
        const l = await fetch(`/api/games/leaderboards?board=xp&gameId=${encodeURIComponent(id)}&limit=5`).then(r => r.json());
        if (l.success) setLeaders(l.entries || []);
      } catch { /* offline */ }
    })();
  }, [id]);

  const toggle = async (action: 'favorite' | 'save') => {
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: 'game', contentId: id, action,
          snapshot: { title: def?.title || id },
        }),
      });
      const data = await res.json();
      if (data.success) setFav(prev => ({ ...prev, [action]: data.state === 'added' }));
    } catch { /* offline */ }
  };

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 16, padding: 18, backdropFilter: 'blur(12px)',
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel={def?.title || 'Game'} />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 90px' }}>
        <Link href="/games" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Game Center</Link>
        <div style={{ ...card, marginTop: 14, textAlign: 'center', padding: 32 }}>
          <p style={{ fontSize: 64, margin: 0 }}>{ART[id] || '🎮'}</p>
          <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 800, margin: '8px 0 4px' }}>{def?.title || id}</h1>
          <p style={{ color: '#aaa', fontSize: 14 }}>{def?.description || ''}</p>
          {def && (
            <Link href={def.route}
              style={{ display: 'inline-block', marginTop: 12, background: '#ffd60a', color: '#111', fontWeight: 800, padding: '14px 44px', borderRadius: 12, textDecoration: 'none', fontSize: 16 }}>
              ▶ PLAY
            </Link>
          )}
          {signedIn && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
              <button onClick={() => void toggle('favorite')}
                style={favBtn(fav.favorite)}>❤️ {fav.favorite ? 'Favorited' : 'Favorite'}</button>
              <button onClick={() => void toggle('save')}
                style={favBtn(fav.save)}>⭐ {fav.save ? 'Saved' : 'Save'}</button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 14 }}>
          <div style={card}>
            <h3 style={h3}>📖 How to play</h3>
            {(HOW_TO[id] || ['Play the game — progress saves automatically.']).map((t, i) => (
              <p key={i} style={{ color: '#bbb', fontSize: 13, margin: '6px 0' }}>• {t}</p>
            ))}
          </div>
          <div style={card}>
            <h3 style={h3}>📊 Your stats</h3>
            {progress ? (
              <>
                <p style={stat}>Best score <strong>{progress.bestScore}</strong></p>
                <p style={stat}>Plays <strong>{progress.plays}</strong> · XP <strong>{progress.xp}</strong></p>
                <p style={stat}>Achievements <strong>{(progress.achievements || []).length}</strong></p>
              </>
            ) : <p style={stat}>{signedIn ? 'No plays yet — hit PLAY!' : 'Sign in to track stats.'}</p>}
            {def && <p style={stat}>Daily limit <strong>{def.maxPlaysPerDay}</strong> plays</p>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 14 }}>
          <div style={card}>
            <h3 style={h3}>🏆 Leaderboard</h3>
            {leaders.length === 0 && <p style={stat}>No ranked players yet.</p>}
            {leaders.map((l, i) => (
              <p key={l.key} style={{ color: '#ddd', fontSize: 13, margin: '4px 0' }}>
                <strong style={{ color: '#ffd60a' }}>#{i + 1}</strong> {l.name} — {l.value.toLocaleString()} XP
              </p>
            ))}
          </div>
          <div style={card}>
            <h3 style={h3}>🎁 Rewards</h3>
            <p style={stat}>Coins and XP are granted server-side after each verified play.</p>
            <p style={stat}>Rare pulls unlock achievements and checkout discount codes.</p>
            {progress && progress.achievements?.length > 0 && (
              <p style={stat}>🏅 {progress.achievements.join(', ')}</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

const h3: React.CSSProperties = { color: '#fff', fontSize: 15, fontWeight: 800, margin: '0 0 8px' };
const stat: React.CSSProperties = { color: '#bbb', fontSize: 13, margin: '6px 0' };
const favBtn = (on: boolean): React.CSSProperties => ({
  background: on ? 'rgba(255,214,10,0.2)' : 'rgba(255,255,255,0.06)',
  border: `1px solid ${on ? '#ffd60a' : 'rgba(255,255,255,0.15)'}`,
  color: on ? '#ffd60a' : '#ccc', fontWeight: 700, fontSize: 13,
  padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
});
