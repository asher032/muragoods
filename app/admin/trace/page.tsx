'use client';

import { useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import { Banner, Field, Loading, Panel, Stat } from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/trace — is this ONE person or two?
//
// The question behind almost every "my data disappeared" report. Enter a
// Discord snowflake, a canonical userId or an email and see what that single
// identity owns across shop, points, inventory, games, Murastream, letters and
// the Discord link — including the places where the record is genuinely thin,
// because a trace that only ever shows successes cannot find duplication.
// ─────────────────────────────────────────────────────────────────────────

interface Trace {
  found: boolean;
  message?: string;
  identity: {
    canonicalUserId: string | null;
    missingCanonicalId: boolean;
    email: string | null;
    name: string | null;
    role: string;
    staffScopes: string[];
    createdAt: string | null;
    discord: { discordId: string; username: string | null; linkedAt: Date | string | null } | null;
  };
  shop: { orders: number; delivered: number; lifetimeSpend: number; pointsFromOrders: number };
  points: {
    balance: number; ledgerEntries: number; legacyRewardRows: number;
    note: string; recent: { txId: string; source: string; amount: number; reference: string; createdAt: string }[];
  };
  inventory: {
    items: number;
    detail: { itemId: string; name: string; kind: string; quantity: number; source: string; acquiredAt: string | null }[];
    note: string | null;
  };
  games: {
    gamesPlayed: number; totalXp: number; savesNote: string;
    progress: { gameId: string; plays?: number; bestScore?: number; xp?: number; achievements?: string[] }[];
    serverSaves: { gameId: string; highScore?: number; plays?: number }[];
  };
  murastream: { favorites: number; watchlist: number; history: number; comments: number; storageKey: string };
  letters: { total: number; visible: number; hidden: number; note: string };
  murabot: { note: string; resolvable: boolean };
  activity: { type: string; text: string; ref?: string; createdAt: string }[];
}

export default function AdminTracePage() {
  const [discordId, setDiscordId] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [data, setData] = useState<Trace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const params = new URLSearchParams();
    if (discordId.trim()) params.set('discordId', discordId.trim());
    if (userId.trim()) params.set('userId', userId.trim());
    if (email.trim()) params.set('email', email.trim());
    if (![...params.keys()].length) {
      setError('Enter a Discord ID, canonical userId, or email.');
      return;
    }
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/admin/trace?${params.toString()}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'The trace could not be run.');
        return;
      }
      setData(body);
    } catch {
      setError('The server could not be reached.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminHeader
        title="Identity trace"
        subtitle="Resolve one person once, then show what that identity owns across every system. Sections that are genuinely empty say so, because a trace that only reports successes cannot find duplication."
      />

      <Panel title="Find a person">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ minWidth: 200 }}>
            <Field label="Discord user ID" value={discordId} onChange={setDiscordId} placeholder="123456789012345678" />
          </div>
          <div style={{ minWidth: 200 }}>
            <Field label="Canonical userId" value={userId} onChange={setUserId} placeholder="MG-ABC-123456" />
          </div>
          <div style={{ minWidth: 220 }}>
            <Field label="Email" value={email} onChange={setEmail} placeholder="member@example.com" />
          </div>
          <button type="button" className="mg-btn mg-btn-primary" onClick={run} disabled={busy} style={{ marginBottom: 6 }}>
            {busy ? 'Tracing…' : 'Trace'}
          </button>
        </div>
        {error ? <div style={{ marginTop: 14 }}><Banner tone="error">{error}</Banner></div> : null}
      </Panel>

      {busy ? <Loading /> : null}

      {data && !data.found ? (
        <Banner tone="warning">{data.message}</Banner>
      ) : null}

      {data?.found ? (
        <>
          <Panel title="Identity" hint="This is the single person every other section is keyed to.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
              <Stat label="Canonical userId" value={data.identity.canonicalUserId || 'MISSING'} tone={data.identity.missingCanonicalId ? 'var(--mg-error)' : 'var(--mg-text)'} />
              <Stat label="Discord" value={data.identity.discord?.discordId || 'Not linked'} tone={data.identity.discord ? 'var(--mg-success)' : 'var(--mg-text-muted)'} />
              <Stat label="Role" value={data.identity.role} />
              <Stat label="Member since" value={data.identity.createdAt ? data.identity.createdAt.slice(0, 10) : '—'} />
            </div>
            {data.identity.missingCanonicalId ? (
              <div style={{ marginBottom: 12 }}>
                <Banner tone="warning">
                  This account has no canonical userId. One is minted on their next authenticated
                  request; until then, rows keyed only by email will not join to it.
                </Banner>
              </div>
            ) : null}
            {!data.identity.discord ? (
              <Banner tone="info">
                No Discord link. If the person says the bot does not recognise them, this is why —
                it is an unlinked account, not a broken link.
              </Banner>
            ) : null}
          </Panel>

          <Panel title="Across the ecosystem">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Stat label="Orders" value={data.shop.orders} />
              <Stat label="Lifetime spend" value={`₱${data.shop.lifetimeSpend.toLocaleString('en-PH')}`} />
              <Stat label="Points balance" value={data.points.balance.toLocaleString()} tone="var(--mg-brand)" />
              <Stat label="Ledger entries" value={data.points.ledgerEntries} />
              <Stat label="Inventory items" value={data.inventory.items} />
              <Stat label="Games played" value={data.games.gamesPlayed} />
              <Stat label="Game XP" value={data.games.totalXp.toLocaleString()} />
              <Stat label="Murastream (♥/list/history)" value={`${data.murastream.favorites}/${data.murastream.watchlist}/${data.murastream.history}`} />
              <Stat label="Letters" value={`${data.letters.total}`} />
              <Stat label="Comments" value={data.murastream.comments} />
            </div>
          </Panel>

          <Panel title="Points" hint={data.points.note}>
            {data.points.recent.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mg-text-muted)' }}>No ledger entries yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr>{['Transaction', 'Source', 'Amount', 'Reference', 'When'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, letterSpacing: '0.05em', color: 'var(--mg-text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--mg-border)' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {data.points.recent.map((t) => (
                      <tr key={t.txId} style={{ borderBottom: '1px solid var(--mg-border)' }}>
                        <td style={{ padding: '8px 10px' }}><code style={{ fontSize: 11 }}>{t.txId}</code></td>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-text-muted)' }}>{t.source}</td>
                        <td style={{ padding: '8px 10px', color: t.amount >= 0 ? 'var(--mg-success)' : 'var(--mg-error)' }}>{t.amount}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-text-muted)' }}>{t.reference || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-text-faint)' }}>{new Date(t.createdAt).toUTCString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Inventory" hint={data.inventory.note || undefined}>
            {data.inventory.items === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mg-text-muted)' }}>No items owned.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {data.inventory.detail.map((i, idx) => (
                  <span key={`${i.itemId}-${idx}`} className="mg-badge">
                    {i.name} ×{i.quantity} · {i.kind}
                  </span>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Games" hint={data.games.savesNote}>
            {data.games.progress.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mg-text-muted)' }}>No server-validated game progress.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {data.games.progress.map((g) => (
                  <span key={g.gameId} className="mg-badge">
                    {g.gameId}: {g.plays || 0} plays · best {g.bestScore || 0} · {g.xp || 0} xp
                  </span>
                ))}
              </div>
            )}
            {data.games.serverSaves.length > 0 ? (
              <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--mg-text-muted)' }}>
                Server saves: {data.games.serverSaves.map((s) => `${s.gameId} (best ${s.highScore || 0})`).join(', ')}
              </p>
            ) : null}
          </Panel>

          <Panel title="Boundaries" hint="What this trace deliberately does NOT merge.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: 'var(--mg-text-muted)', lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>{data.murabot.note}</p>
              <p style={{ margin: 0 }}>Murastream storage: {data.murastream.storageKey}</p>
              <p style={{ margin: 0 }}>{data.letters.note}</p>
            </div>
          </Panel>
        </>
      ) : null}
    </>
  );
}