'use client';

import { AdminHeader } from '../components/AdminShell';
import { Banner, Empty, Loading, Panel, RefreshButton, Stat, useAdminResource } from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/economy — currency, balances and the ledger.
//
// Read access needs the economy scope: support staff can answer a question
// about someone's coins only when they have been given that scope, because
// the same view exposes the whole circulation. Individual balance adjustments
// are made through /api/admin/coins, which writes a ledger entry so the change
// is attributable rather than silent.
// ─────────────────────────────────────────────────────────────────────────

interface Payload {
  totals: { coinsInCirculation: number; accountsHoldingCoins: number; averageBalance: number };
  topHolders: { name: string; email: string; userId: string | null; coinBalance: number }[];
  recentActivity: { who: string; email: string; type: string; amount: number; label: string; at: string | null }[];
  antiExploit: { note: string; canonicalStore: string };
  readOnly: boolean;
}

export default function AdminEconomyPage() {
  const { data, error, loading, reload } = useAdminResource<Payload>('/api/admin/economy');

  return (
    <>
      <AdminHeader
        title="Economy"
        subtitle="Currency in circulation, the largest balances and recent ledger activity. Anti-exploit configuration is enforced by Murabot against its own guild configuration."
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {error ? <Banner tone="error">Could not read the economy: {error}</Banner> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Stat label="Coins in circulation" value={data.totals.coinsInCirculation.toLocaleString()} tone="var(--mg-brand)" />
            <Stat label="Accounts holding coins" value={data.totals.accountsHoldingCoins} />
            <Stat label="Average balance" value={data.totals.averageBalance.toLocaleString()} />
          </div>

          <Panel title="Largest balances" hint="Read-only here. Adjustments go through the ledger so they are attributable.">
            {data.topHolders.length === 0 ? (
              <Empty>No account currently holds coins.</Empty>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Canonical ID', 'Balance'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, letterSpacing: '0.05em', color: 'var(--mg-text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--mg-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.topHolders.map((h) => (
                      <tr key={h.email} style={{ borderBottom: '1px solid var(--mg-border)' }}>
                        <td style={{ padding: '9px 10px', fontWeight: 600 }}>{h.name}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)' }}>{h.email}</td>
                        <td style={{ padding: '9px 10px' }}><code style={{ fontSize: 12 }}>{h.userId ?? '—'}</code></td>
                        <td style={{ padding: '9px 10px', fontWeight: 700 }}>{h.coinBalance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Recent ledger activity">
            {data.recentActivity.length === 0 ? (
              <Empty>No coin transaction has been recorded.</Empty>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      {['Who', 'Type', 'Amount', 'Reason', 'When'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, letterSpacing: '0.05em', color: 'var(--mg-text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--mg-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentActivity.map((a, i) => (
                      <tr key={`${a.email}-${i}`} style={{ borderBottom: '1px solid var(--mg-border)' }}>
                        <td style={{ padding: '8px 10px' }}>{a.who}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-text-muted)' }}>{a.type}</td>
                        <td style={{ padding: '8px 10px', color: a.amount >= 0 ? 'var(--mg-success)' : 'var(--mg-error)' }}>
                          {a.amount >= 0 ? '+' : ''}{a.amount}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-text-muted)' }}>{a.label || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-text-faint)', whiteSpace: 'nowrap' }}>
                          {a.at ? new Date(a.at).toUTCString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Configuration & anti-exploit">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--mg-text-muted)', lineHeight: 1.6 }}>{data.antiExploit.note}</p>
            <p style={{ margin: '10px 0 0', fontSize: 12.5 }}>
              Canonical store: <code>{data.antiExploit.canonicalStore}</code>
            </p>
          </Panel>
        </>
      ) : null}
    </>
  );
}