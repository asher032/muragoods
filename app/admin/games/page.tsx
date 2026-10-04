'use client';

import { useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import {
  Banner, Empty, Field, Loading, Panel, RefreshButton, Stat, useAdminResource,
} from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/games — game configuration and player lookup.
//
// Tuning a game (rewards, cooldowns, visibility) needs the content scope.
// Finding a player across the ecosystem — game progress, rewards, library,
// linked Discord — is a technical/anti-cheat task and needs the technical
// scope, so it is a separate control with its own justification.
// ─────────────────────────────────────────────────────────────────────────

interface Game {
  gameId: string;
  title: string;
  description?: string;
  category?: string;
  enabled: boolean;
  featured?: boolean;
  isNewItem?: boolean;
  maxPlaysPerDay?: number;
  cooldownSec?: number;
  xpPerPlay?: number;
}

interface Player {
  name: string;
  email: string;
  coins: number;
  discord: { username: string } | null;
  games: { gameId: string; plays: number; xp: number; bestScore?: number; lastPlayed?: string }[];
  murastream: { likes: number; watchlist: number; history: number } | null;
}

export default function AdminGamesPage() {
  const { data, error, loading, reload } = useAdminResource<{ success: boolean; games: Game[] }>('/api/admin/games');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const [search, setSearch] = useState('');
  const [playerBusy, setPlayerBusy] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);

  const games = data?.games ?? [];

  async function toggle(game: Game, patch: Partial<Game>) {
    setBusyId(game.gameId);
    setResult(null);
    try {
      const res = await fetch('/api/admin/games', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.gameId, patch }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setResult({ tone: 'error', message: body?.error || 'The change was not saved.' });
        return;
      }
      setResult({ tone: 'success', message: `${game.title} updated.` });
      reload();
    } catch {
      setResult({ tone: 'error', message: 'The server could not be reached. Nothing was changed.' });
    } finally {
      setBusyId(null);
    }
  }

  async function findPlayer() {
    setPlayerBusy(true);
    setPlayerError(null);
    setPlayers([]);
    try {
      const res = await fetch(`/api/admin/players?search=${encodeURIComponent(search.trim())}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setPlayerError(body?.error || 'The lookup could not be run.');
        return;
      }
      setPlayers(body.players ?? []);
    } catch {
      setPlayerError('The server could not be reached.');
    } finally {
      setPlayerBusy(false);
    }
  }

  return (
    <>
      <AdminHeader
        title="Games"
        subtitle="Game availability, rewards and cooldowns — tuned here without a redeploy — plus cross-ecosystem player lookup."
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {error ? <Banner tone="error">{error}</Banner> : null}
      {result ? <div style={{ marginBottom: 16 }}><Banner tone={result.tone}>{result.message}</Banner></div> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Stat label="Games" value={games.length} />
            <Stat label="Enabled" value={games.filter((g) => g.enabled).length} tone="var(--mg-success)" />
            <Stat label="Featured" value={games.filter((g) => g.featured).length} tone="var(--mg-brand)" />
            <Stat label="Hidden" value={games.filter((g) => !g.enabled).length} tone="var(--mg-text-muted)" />
          </div>

          <Panel title="Game configuration" hint="Availability, daily play caps, cooldowns and XP are runtime settings and take effect on the next play.">
            {games.length === 0 ? (
              <Empty>No games are registered in the catalog.</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {games.map((g) => (
                  <div key={g.gameId} style={{ padding: '12px 13px', borderRadius: 'var(--mg-radius-md)', border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{g.title || g.gameId}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--mg-text-muted)' }}>
                          <code>{g.gameId}</code> · {g.category || 'uncategorised'} · max {g.maxPlaysPerDay ?? '—'}/day ·{' '}
                          {g.cooldownSec ?? 0}s cooldown · {g.xpPerPlay ?? 0} xp
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 7 }}>
                        <span className={`mg-badge ${g.enabled ? 'mg-badge-success' : 'mg-badge'}`}>{g.enabled ? 'Enabled' : 'Disabled'}</span>
                        {g.featured ? <span className="mg-badge mg-badge-brand">Featured</span> : null}
                        <button
                          type="button"
                          className="mg-btn mg-btn-secondary"
                          onClick={() => toggle(g, { enabled: !g.enabled })}
                          disabled={busyId === g.gameId}
                        >
                          {busyId === g.gameId ? 'Saving…' : g.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="mg-btn mg-btn-ghost"
                          onClick={() => toggle(g, { featured: !g.featured })}
                          disabled={busyId === g.gameId}
                        >
                          {g.featured ? 'Unfeature' : 'Feature'}
                        </button>
                      </div>
                    </div>
                    {g.description ? (
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mg-text-muted)', lineHeight: 1.5 }}>{g.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Player lookup"
            hint="Searches the canonical account across game progress, rewards, Murastream library and linked Discord identity. Requires the technical scope."
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ minWidth: 260 }}>
                <Field
                  label="Name, email or Discord ID"
                  value={search}
                  onChange={setSearch}
                  placeholder="at least 2 characters"
                />
              </div>
              <button
                type="button"
                className="mg-btn mg-btn-primary"
                onClick={findPlayer}
                disabled={playerBusy || search.trim().length < 2}
                style={{ marginBottom: 6 }}
              >
                {playerBusy ? 'Searching…' : 'Search'}
              </button>
            </div>

            {playerError ? <div style={{ marginTop: 14 }}><Banner tone="error">{playerError}</Banner></div> : null}

            {players.length > 0 ? (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {players.map((p) => (
                  <div key={p.email} style={{ padding: '12px 13px', borderRadius: 'var(--mg-radius-md)', border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)' }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>
                      {p.name} <span style={{ fontWeight: 400, color: 'var(--mg-text-muted)' }}>{p.email}</span>
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--mg-text-muted)' }}>
                      {p.coins.toLocaleString()} coins · Discord: {p.discord?.username || 'not linked'}
                      {p.murastream ? ` · ${p.murastream.likes} likes, ${p.murastream.watchlist} watchlist, ${p.murastream.history} history` : ''}
                    </p>
                    {p.games.length > 0 ? (
                      <div style={{ marginTop: 9, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {p.games.map((g) => (
                          <span key={g.gameId} className="mg-badge">
                            {g.gameId}: {g.plays} plays · {g.xp} xp{g.bestScore != null ? ` · best ${g.bestScore}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}
    </>
  );
}