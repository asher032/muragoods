'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';
import { statusMessage } from '../components/selectors';

interface GameDef {
  gameId: string; title: string; description: string; category: string;
  route: string; enabled: boolean; featured: boolean; isNew: boolean;
  maxPlaysPerDay: number; cooldownSec: number; xpPerPlay: number;
}

interface Player {
  name: string; email: string; coins: number; key: string;
  discord: { username: string; linkedAt: string | null } | null;
  games: Array<{ gameId: string; plays: number; xp: number; bestScore: number; achievements: number }>;
  favorites: number;
  murastream: { likes: number; watchlist: number; history: number } | null;
}

// Admin game management: enable/feature/tune games, inspect players.
// Reads the same collections the site and (via the shared DB) the bot use.
export default function GamesAdminPage() {
  const { token, selected } = useGuild();
  const [games, setGames] = useState<GameDef[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const resp = await apiFetch<{ success: boolean; games?: GameDef[]; error?: string }>(
      '/api/admin/games', { token: token ?? undefined });
    if (resp.ok && resp.data.success && resp.data.games) setGames(resp.data.games);
    else setError(resp.ok ? resp.data.error || 'Could not load games' : resp.error);
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const patch = async (gameId: string, p: Record<string, unknown>) => {
    const resp = await apiFetch<{ success: boolean; game?: GameDef; error?: string }>(
      '/api/admin/games', { token: token ?? undefined, method: 'PATCH', body: JSON.stringify({ gameId, patch: p }) });
    if (resp.ok && resp.data.success && resp.data.game) {
      setGames(gs => gs.map(g => (g.gameId === gameId ? resp.data.game as GameDef : g)));
    } else {
      setError(resp.ok ? resp.data.error || 'Save failed' : resp.error);
    }
  };

  const lookup = async () => {
    if (search.trim().length < 2 || !token) return;
    const resp = await apiFetch<{ success: boolean; players?: Player[]; error?: string }>(
      `/api/admin/players?search=${encodeURIComponent(search.trim())}`, { token: token ?? undefined });
    if (resp.ok && resp.data.success) setPlayers(resp.data.players || []);
    else setError(resp.ok ? resp.data.error || 'Lookup failed' : resp.error);
  };

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to manage games.</p>;
  }

  const toggleBtn = (on: boolean, label: string, fn: () => void) => (
    <button onClick={fn} aria-label={label} style={{
      width: 40, height: 22, borderRadius: 11, position: 'relative', cursor: 'pointer',
      background: on ? 'var(--cc-accent)' : 'rgba(255,255,255,0.14)', border: 'none',
    }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff' }} />
    </button>
  );

  return (
    <div style={{ maxWidth: 980 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>🎮 Games {selected ? `— ${selected.name}` : ''}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        Tune games without deploys. The site Game Center is at <a href="/games" style={{ color: 'var(--cc-accent)' }}>/games</a> — rewards, cooldowns and visibility here apply everywhere instantly.
      </p>
      {error && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 12 }}>{statusMessage('', error)?.hint || error}</div>}
      {loading && <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading…</p>}

      <div className="cc-section-label" style={{ marginBottom: 10 }}>Game catalog</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {games.map(g => (
          <div key={g.gameId} className="cc-card" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ color: '#fff', fontSize: 14, flex: 1, minWidth: 160 }}>{g.title} <code style={{ fontSize: 11, color: 'var(--cc-text-faint)' }}>{g.gameId}</code></strong>
              <label style={{ fontSize: 12, color: 'var(--cc-text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
                Enabled {toggleBtn(g.enabled, `Toggle ${g.gameId}`, () => void patch(g.gameId, { enabled: !g.enabled }))}
              </label>
              <label style={{ fontSize: 12, color: 'var(--cc-text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
                Featured {toggleBtn(g.featured, `Feature ${g.gameId}`, () => void patch(g.gameId, { featured: !g.featured }))}
              </label>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
              <Num label="Max plays/day" value={g.maxPlaysPerDay} onChange={(v) => void patch(g.gameId, { maxPlaysPerDay: v })} />
              <Num label="Cooldown (s)" value={g.cooldownSec} onChange={(v) => void patch(g.gameId, { cooldownSec: v })} />
              <Num label="XP/play" value={g.xpPerPlay} onChange={(v) => void patch(g.gameId, { xpPerPlay: v })} />
              <span>Route <code>{g.route}</code> · {g.category}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Player lookup</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void lookup(); }}
          placeholder="Email, name or Discord username…" className="cc-input" style={{ flex: 1 }} />
        <button onClick={() => void lookup()} className="cc-btn cc-btn-primary">Search</button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {players.map(p => (
          <div key={p.email} className="cc-card" style={{ padding: '14px 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
            <strong style={{ color: '#fff' }}>{p.name}</strong> <code>{p.email}</code>
            {' '}· 🪙 {p.coins} · key <code>{p.key}</code>
            <div style={{ marginTop: 6 }}>
              Discord: {p.discord ? <>@{p.discord.username} (linked {p.discord.linkedAt ? new Date(p.discord.linkedAt).toLocaleDateString() : '?'})</> : 'not linked'}
            </div>
            <div style={{ marginTop: 6 }}>
              Games: {p.games.length === 0 ? 'none' : p.games.map(g => `${g.gameId} (${g.plays} plays, ${g.xp} xp, best ${g.bestScore})`).join(' · ')}
            </div>
            <div style={{ marginTop: 4 }}>
              ❤️ {p.favorites} favorites
              {p.murastream && <> · 🎬 {p.murastream.likes} likes, {p.murastream.watchlist} watchlist, {p.murastream.history} history</>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {label}
      <input type="number" defaultValue={value} key={value}
        onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }}
        className="cc-input" style={{ width: 76 }} />
    </label>
  );
}
