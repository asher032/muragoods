'use client';

import { useMemo, useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import { Banner, Empty, Loading, Panel, RefreshButton, Stat, useAdminResource } from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/users — accounts.
//
// Read access is scoped to `support`: answering "where is my order?" means
// looking at an account. It does not mean being able to destroy one — that
// stays owner-only, and there is no delete button on this page on purpose.
// ─────────────────────────────────────────────────────────────────────────

interface UserRow {
  name: string;
  email: string;
  userId: string;
  perks: { perkId: string; perkName: string }[];
  joinedAt: string;
  totalSpent: number;
  orderCount: number;
  delivered: number;
  coinBalance: number;
}

export default function AdminUsersPage() {
  const { data, error, loading, reload } = useAdminResource<{ success: boolean; data: UserRow[] }>('/api/admin/users');
  const [query, setQuery] = useState('');

  const users = data?.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.email.toLowerCase().includes(q)
      || u.name.toLowerCase().includes(q)
      || u.userId.toLowerCase().includes(q));
  }, [users, query]);

  const stats = useMemo(() => ({
    accounts: users.length,
    spend: users.reduce((s, u) => s + (u.totalSpent || 0), 0),
    coins: users.reduce((s, u) => s + (u.coinBalance || 0), 0),
    unlinked: users.filter((u) => u.userId === 'N/A').length,
  }), [users]);

  return (
    <>
      <AdminHeader
        title="Users"
        subtitle="Accounts, order history and economy balance in one row. Deleting an account is owner-only and is deliberately not offered here."
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {error ? <Banner tone="error">Could not read accounts: {error}</Banner> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Stat label="Accounts" value={stats.accounts} />
            <Stat label="Lifetime spend" value={`₱${stats.spend.toLocaleString('en-PH')}`} />
            <Stat label="Coins in circulation" value={stats.coins.toLocaleString()} />
            <Stat label="Without a userId" value={stats.unlinked} tone={stats.unlinked > 0 ? 'var(--mg-warning)' : undefined} />
          </div>

          <Panel title="Search">
            <input
              className="mg-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email or canonical userId"
              style={{ maxWidth: 420 }}
            />
          </Panel>

          {filtered.length === 0 ? (
            <Empty>No account matches that search.</Empty>
          ) : (
            <Panel title={`${filtered.length} account(s)`}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Canonical ID', 'Joined', 'Orders', 'Delivered', 'Spent', 'Coins'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, letterSpacing: '0.05em', color: 'var(--mg-text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--mg-border)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.email} style={{ borderBottom: '1px solid var(--mg-border)' }}>
                        <td style={{ padding: '9px 10px', fontWeight: 600 }}>{u.name || '—'}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)' }}>{u.email}</td>
                        <td style={{ padding: '9px 10px' }}><code style={{ fontSize: 12 }}>{u.userId}</code></td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)', whiteSpace: 'nowrap' }}>
                          {u.joinedAt ? new Date(u.joinedAt).toISOString().slice(0, 10) : '—'}
                        </td>
                        <td style={{ padding: '9px 10px' }}>{u.orderCount}</td>
                        <td style={{ padding: '9px 10px' }}>{u.delivered}</td>
                        <td style={{ padding: '9px 10px' }}>₱{(u.totalSpent || 0).toLocaleString('en-PH')}</td>
                        <td style={{ padding: '9px 10px' }}>{(u.coinBalance || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      ) : null}
    </>
  );
}