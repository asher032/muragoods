'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';
import { GameBackgroundSettings } from '@/app/components/GameBackgroundSettings';

interface GameDef {
  gameId: string; title: string; description: string; category: string;
  route: string; featured: boolean; isNewItem: boolean; maxPlaysPerDay: number;
}

interface Summary {
  level: number; into: number; need: number; totalXp: number; totalPlays: number;
  totalTimeSec: number; achievements: number; favoriteGames: number; gamesPlayed: number;
}

const ART: Record<string, string> = {
  spin: '🎡', trivia: '🧠', memory: '🃏', flappy: '🐤',
  checkin: '📅', mysterybox: '🎁', refer: '💌',
};

const CATEGORY_LABELS: Record<string, string> = {
  chance: '🎲 Chance', activities: '🏃 Activities', simulation: '🌱 Simulation',
  progression: '🏆 Progression', social: '👥 Social', arcade: '🕹️ Arcade', daily: '📅 Daily',
};

export default function GameCenterPage() {
  const router = useRouter();
  const { coins } = useCoins();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [discordLinked, setDiscordLinked] = useState<boolean | null>(null);
  const [games, setGames] = useState<GameDef[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Array<{ gameId: string; bestScore: number; plays: number; lastPlayed: string }>>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [leaders, setLeaders] = useState<Array<{ key: string; name: string; value: number }>>([]);

  const load = useCallback(async () => {
    const raw = localStorage.getItem('user');
    if (!raw) { setSignedIn(false); return; }
    setSignedIn(true);
    try {
      const [defs, prog, favs, lb, link] = await Promise.all([
        fetch('/api/games/definitions').then(r => r.json()).catch(() => ({})),
        fetch('/api/games/progress?summary=1').then(r => r.json()).catch(() => ({})),
        fetch('/api/favorites?type=game&action=favorite').then(r => r.json()).catch(() => ({})),
        fetch('/api/games/leaderboards?board=xp&limit=5').then(r => r.json()).catch(() => ({})),
        fetch('/api/account/discord').then(r => r.json()).catch(() => ({})),
      ]);
      if (defs.success) setGames(defs.games || []);
      if (prog.success) {
        setSummary(prog.summary || null);
        setRecent((prog.games || []).slice(0, 3));
      }
      if (favs.success) setFavorites((favs.rows || []).map((r: { contentId: string }) => r.contentId));
      if (lb.success) setLeaders(lb.entries || []);
      setDiscordLinked(Boolean(link.success && link.linked));
    } catch { /* offline */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (signedIn === false) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Game Center" />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 48 }}>🎮</p>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>Muragoods Game Center</h1>
          <p style={{ color: '#aaa' }}>Sign in to play — progress saves to your account.</p>
          <Link href="/login" style={{ display: 'inline-block', marginTop: 16, background: '#ffd60a', color: '#111', fontWeight: 800, padding: '12px 28px', borderRadius: 12, textDecoration: 'none' }}>
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  // Discord gate: linked players enter; everyone else connects (or
  // continues with just the Muragoods account — progress still saves).
  if (signedIn && discordLinked === false) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Game Center" />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 48 }}>🎮</p>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>Discord account required</h1>
          <p style={{ color: '#aaa', fontSize: 14, lineHeight: 1.6 }}>
            Connect your Discord account to save your game progress, rewards,
            achievements, and cross-platform activity.
          </p>
          <a
            href="/api/auth/discord?mode=link&next=/games"
            style={{ display: 'inline-block', marginTop: 16, background: '#5865F2', color: '#fff', fontWeight: 800, padding: '12px 28px', borderRadius: 12, textDecoration: 'none' }}
          >
            Connect Discord
          </a>
          <div>
            <button onClick={() => setDiscordLinked(null)}
              style={{ marginTop: 12, background: 'transparent', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
              Continue with just my Muragoods account
            </button>
          </div>
        </div>
      </main>
    );
  }

  const byId = new Map(games.map(g => [g.gameId, g]));
  const featured = games.find(g => g.featured) || games[0];
  const continueGames = recent.map(r => ({ ...r, def: byId.get(r.gameId) })).filter(r => r.def);
  const favDefs = favorites.map(id => byId.get(id)).filter(Boolean) as GameDef[];

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 16, padding: 16, backdropFilter: 'blur(12px)',
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Game Center" />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px 90px' }}>
        {/* Header + my stats strip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: 0 }}>🎮 Game Center</h1>
          <div style={{ display: 'flex', gap: 10, fontSize: 13, color: '#ffd60a', fontWeight: 700 }}>
            {summary && (
              <>
                <span>🎮 Lv{summary.level}</span>
                <span>🪙 {coins.toLocaleString()}</span>
                <span>🏆 {summary.achievements}</span>
                <span>🔥 {summary.totalPlays} plays</span>
              </>
            )}
          </div>
        </div>

        {/* Featured */}
        {featured && (
          <Link href={`/games/${featured.gameId}`} style={{ textDecoration: 'none' }}>
            <div style={{ ...card, background: 'linear-gradient(135deg, rgba(123,47,247,0.25), rgba(255,214,10,0.12))', padding: 28, marginBottom: 22 }}>
              <p style={{ color: '#ffd60a', fontSize: 11, fontWeight: 800, letterSpacing: 2, margin: '0 0 6px' }}>FEATURED GAME</p>
              <p style={{ fontSize: 52, margin: '4px 0' }}>{ART[featured.gameId] || '🎮'}</p>
              <h2 style={{ color: '#fff', fontSize: 30, fontWeight: 800, margin: '0 0 6px' }}>{featured.title}</h2>
              <p style={{ color: '#ccc', fontSize: 14, margin: '0 0 14px' }}>{featured.description}</p>
              <span style={{ display: 'inline-block', background: '#ffd60a', color: '#111', fontWeight: 800, padding: '12px 30px', borderRadius: 12 }}>
                ▶ PLAY NOW
              </span>
            </div>
          </Link>
        )}

        {/* Continue playing */}
        {continueGames.length > 0 && (
          <>
            <h2 style={h2}>▶ Continue Playing</h2>
            <div style={rail}>
              {continueGames.map(r => (
                <Link key={r.gameId} href={`/games/${r.gameId}`} style={{ ...card, minWidth: 220, textDecoration: 'none' }}>
                  <p style={{ fontSize: 34, margin: '0 0 6px' }}>{ART[r.gameId] || '🎮'}</p>
                  <p style={{ color: '#fff', fontWeight: 700, margin: '0 0 4px' }}>{r.def!.title}</p>
                  <p style={{ color: '#888', fontSize: 12, margin: 0 }}>Best {r.bestScore} · {r.plays} plays</p>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* My stats + leaderboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 22 }}>
          <div style={card}>
            <h3 style={h3}>📊 My Game Stats</h3>
            {summary ? (
              <>
                <p style={{ color: '#fff', fontWeight: 800, margin: '0 0 4px' }}>🎮 Game Level {summary.level}</p>
                <Bar value={summary.need ? summary.into / summary.need : 0} />
                <p style={dim}>XP {summary.totalXp.toLocaleString()} · {summary.totalPlays} plays · {summary.gamesPlayed} games · ❤️ {summary.favoriteGames}</p>
              </>
            ) : <p style={dim}>Play a game to start your profile.</p>}
            <Link href="/account/connected" style={linkBtn}>👤 My Muragoods</Link>
          </div>
          <div style={card}>
            <h3 style={h3}>🏆 Top Players</h3>
            {leaders.length === 0 && <p style={dim}>No ranked players yet.</p>}
            {leaders.map((l, i) => (
              <p key={l.key} style={{ color: '#ddd', fontSize: 13, margin: '4px 0' }}>
                <strong style={{ color: '#ffd60a' }}>#{i + 1}</strong> {l.name} — {l.value.toLocaleString()} XP
              </p>
            ))}
            <Link href="/games/leaderboards" style={linkBtn}>Full leaderboards →</Link>
          </div>
        </div>

        {/* Level background */}
        <h2 style={h2}>🎨 Level Background</h2>
        <div style={{ ...card, marginBottom: 22 }}>
          <GameBackgroundSettings />
        </div>

        {/* Jobs */}
        <Link href="/jobs" style={{ textDecoration: 'none' }}>
          <div style={{ ...card, background: 'linear-gradient(135deg, rgba(6,214,160,0.22), rgba(255,214,10,0.12))', padding: 22, marginBottom: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 44 }}>💼</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', color: '#fff', fontSize: 20, fontWeight: 800 }}>Jobs — Work Shifts</span>
              <span style={{ display: 'block', color: '#ccc', fontSize: 13, marginTop: 4 }}>Clock in, play a shift mini-game, earn ⏣. No mini-game, no payout.</span>
            </span>
            <span style={{ background: '#ffd60a', color: '#111', fontWeight: 800, padding: '12px 24px', borderRadius: 12, whiteSpace: 'nowrap' }}>
              VIEW JOBS
            </span>
          </div>
        </Link>

        {/* Favorite games */}
        {favDefs.length > 0 && (
          <>
            <h2 style={h2}>❤️ Favorite Games</h2>
            <div style={rail}>
              {favDefs.map(g => <GameCard key={g.gameId} g={g} />)}
            </div>
          </>
        )}

        {/* All games */}
        <h2 style={h2}>🕹️ All Games</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {games.map(g => <GameCard key={g.gameId} g={g} />)}
        </div>

        {/* Categories */}
        <h2 style={h2}>🗂️ Categories</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(CATEGORY_LABELS).map(([k, label]) => {
            const n = games.filter(g => g.category === k).length;
            return n ? <span key={k} style={{ ...card, padding: '8px 14px', fontSize: 13, color: '#ddd' }}>{label} · {n}</span> : null;
          })}
        </div>
        <p style={{ ...dim, marginTop: 18 }}>
          Discord economy games (Blackjack, Slots, Fishing, Farming, Pets…) live in Murabot — open <strong>/help → 💰 Economy</strong> in Discord.
        </p>
      </div>
    </main>
  );

  function GameCard({ g }: { g: GameDef }) {
    return (
      <Link href={`/games/${g.gameId}`} style={{ ...card, textDecoration: 'none' }}>
        <p style={{ fontSize: 34, margin: '0 0 6px' }}>{ART[g.gameId] || '🎮'}</p>
        <p style={{ color: '#fff', fontWeight: 700, margin: '0 0 4px' }}>
          {g.title} {g.isNewItem && <span style={pill}>NEW</span>}
        </p>
        <p style={{ color: '#888', fontSize: 12, margin: 0 }}>{CATEGORY_LABELS[g.category] || g.category}</p>
      </Link>
    );
  }
}

const h2: React.CSSProperties = { color: '#fff', fontSize: 18, fontWeight: 800, margin: '22px 0 12px' };
const h3: React.CSSProperties = { color: '#fff', fontSize: 15, fontWeight: 800, margin: '0 0 10px' };
const dim: React.CSSProperties = { color: '#888', fontSize: 12.5 };
const rail: React.CSSProperties = { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 };
const linkBtn: React.CSSProperties = { display: 'inline-block', marginTop: 10, color: '#ffd60a', fontSize: 13, fontWeight: 700, textDecoration: 'none' };
const pill: React.CSSProperties = { background: '#06d6a0', color: '#06110c', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 8, marginLeft: 6 };

function Bar({ value }: { value: number }) {
  return (
    <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#7b2ff7,#ffd60a)' }} />
    </div>
  );
}
