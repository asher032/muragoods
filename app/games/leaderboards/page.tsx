'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';

const BOARDS = [
  { id: 'xp', label: 'Highest Game XP' },
  { id: 'plays', label: 'Most Games Played' },
  { id: 'achievements', label: 'Most Achievements' },
  { id: 'streak', label: 'Longest Streak' },
];

const GAMES = [
  { id: '', label: 'All games' },
  { id: 'spin', label: '🎡 Spin' }, { id: 'trivia', label: '🧠 Trivia' },
  { id: 'memory', label: '🃏 Memory' }, { id: 'flappy', label: '🐤 Flappy' },
  { id: 'checkin', label: '📅 Check-In' }, { id: 'mysterybox', label: '🎁 Mystery Box' },
];

export default function GameLeaderboardsPage() {
  const [board, setBoard] = useState('xp');
  const [gameId, setGameId] = useState('');
  const [entries, setEntries] = useState<Array<{ key: string; name: string; value: number }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/games/leaderboards?board=${board}&gameId=${gameId}&limit=25`);
        const data = await res.json();
        if (data.success) setEntries(data.entries || []);
      } catch { /* offline */ }
    })();
  }, [board, gameId]);

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Leaderboards" />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 90px' }}>
        <Link href="/games" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Game Center</Link>
        <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>🏆 Muragoods Leaderboard</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
          {BOARDS.map(b => (
            <button key={b.id} onClick={() => setBoard(b.id)} style={tab(board === b.id)}>{b.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {GAMES.map(g => (
            <button key={g.id} onClick={() => setGameId(g.id)} style={tab(gameId === g.id)}>{g.label}</button>
          ))}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, padding: 18 }}>
          {entries.length === 0 && <p style={{ color: '#888', fontSize: 13 }}>No ranked players yet — be the first!</p>}
          {entries.map((e, i) => (
            <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: i < 3 ? '#ffd60a' : '#888', fontWeight: 800, width: 32 }}>#{i + 1}</span>
              <Link href={`/games/profile/${e.key}`} style={{ color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none', flex: 1 }}>{e.name}</Link>
              <span style={{ color: '#ffd60a', fontWeight: 700, fontSize: 14 }}>{e.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <p style={{ color: '#666', fontSize: 12, marginTop: 12 }}>Only public game profiles appear. Set yours in Account → Privacy.</p>
      </div>
    </main>
  );
}

const tab = (on: boolean): React.CSSProperties => ({
  background: on ? '#ffd60a' : 'rgba(255,255,255,0.06)', color: on ? '#111' : '#ccc',
  border: 'none', fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
});
