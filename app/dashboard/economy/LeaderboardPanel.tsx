'use client';

import type { LeaderboardRow } from './useEconomyData';

// ── 🏆 Leaderboard ──────────────────────────────────────────────────────
// One row per CANONICAL USER, never per display name.
//
// The identity column is `canonicalUserId` — the user id that keys the wallet.
// A display name is shown alongside because it is what a human recognises,
// and it is resolved live from the guild so renames are reflected. It is never
// used to group, merge, deduplicate or sort: two members may share a name, and
// any name may change at any time.
//
// A member who left the server, or whose name cannot be resolved, still
// appears — keyed by their id — rather than collapsing into a shared or blank
// row. That is what makes this list reconcile with circulation.

export default function LeaderboardPanel({ rows, symbol }: {
  rows: LeaderboardRow[];
  symbol: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="cc-card" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>
          No wallets yet — balances appear as members use the economy.
        </p>
      </div>
    );
  }

  const medal = ['🥇', '🥈', '🥉'];

  return (
    <div className="cc-card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--cc-border, #2a2a3a)' }}>
            <th style={th}>#</th>
            <th style={th}>Member</th>
            <th style={th}>Canonical user ID</th>
            <th style={thRight}>Pocket</th>
            <th style={thRight}>Bank</th>
            <th style={thRight}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.canonicalUserId} style={{ borderBottom: '1px solid var(--cc-border, #1e1e2a)' }}>
              <td style={td}>
                {i < 3 ? medal[i] : i + 1}
              </td>
              <td style={td}>
                <strong style={{ color: '#fff' }}>
                  {row.displayName || 'Unknown User'}
                </strong>
                {!row.displayName && (
                  <div style={{ fontSize: 11, color: 'var(--cc-text-faint)' }}>
                    No longer a member of this server
                  </div>
                )}
              </td>
              <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                {row.canonicalUserId}
                {row.userId && row.userId !== row.canonicalUserId ? (
                  <div style={{ fontSize: 10.5 }}>discord: {row.userId}</div>
                ) : null}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>{row.balance.toLocaleString()}</td>
              <td style={{ ...td, textAlign: 'right' }}>{row.bank.toLocaleString()}</td>
              <td style={{ ...td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>
                {row.total.toLocaleString()} {symbol}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: 0, padding: '10px 14px', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
        Sorted by total (pocket + bank). Ties break on canonical user id, so the order is stable
        between identical requests. Discord: <code>/leaderboard stats</code>.
      </p>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11,
  textTransform: 'uppercase', letterSpacing: 1, color: 'var(--cc-text-faint)',
  fontWeight: 700,
};
const thRight: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '9px 14px', color: 'var(--cc-text-dim)' };
