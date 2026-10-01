'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { TxnRow } from './useEconomyData';

// ── 💳 Transactions ─────────────────────────────────────────────────────
// The full economy audit log, filtered SERVER-SIDE. Every filter composes into
// one query against the canonical ledger; nothing is filtered in the browser
// from an already-truncated page, so the total always matches the filters.
//
// The panel fetches only when a filter actually changes — there is no polling
// and no effect that re-runs on every render.

const DIRECTIONS = [
  { id: 'all', label: 'All amounts' },
  { id: 'positive', label: 'Positive only' },
  { id: 'negative', label: 'Negative only' },
];

const RANGES = [
  { id: '24', label: 'Last 24 hours' },
  { id: '168', label: 'Last 7 days' },
  { id: '720', label: 'Last 30 days' },
  { id: '2160', label: 'Last 90 days' },
];

export default function TransactionsPanel({ guildId, symbol }: { guildId: string; symbol: string }) {
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState('all');
  const [direction, setDirection] = useState('all');
  const [range, setRange] = useState('168');
  const [userId, setUserId] = useState('');
  const [itemId, setItemId] = useState('');
  const [txId, setTxId] = useState('');
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const requestId = useRef(0);

  const PAGE = 50;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    // Yield once before touching state so this runs as a microtask rather
    // than synchronously inside the effect body.
    await Promise.resolve();
    if (id !== requestId.current) return;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      guildId,
      endpoint: 'transactions',
      action,
      direction,
      hours: range,
      limit: String(PAGE),
      skip: String(skip),
    });
    if (userId.trim()) params.set('userId', userId.trim());
    if (itemId.trim()) params.set('itemId', itemId.trim());
    if (txId.trim()) params.set('txId', txId.trim());
    const resp = await apiFetch<{ success: boolean; rows?: TxnRow[]; total?: number; actions?: string[]; error?: string }>(
      `/api/dashboard/economy/read?${params.toString()}`,
    );
    if (id !== requestId.current) return;
    if (resp.ok && resp.data.success) {
      setRows(resp.data.rows ?? []);
      setTotal(resp.data.total ?? 0);
      if (resp.data.actions?.length) setActions(resp.data.actions);
    } else {
      setRows([]);
      setError(resp.ok ? resp.data.error || 'Could not load transactions.' : resp.error);
    }
    setLoading(false);
  }, [guildId, action, direction, range, userId, itemId, txId, skip]);

  useEffect(() => {
    // Fetch-on-mount / on-filter-change. `load` awaits before every state
    // write, so nothing is set synchronously in the effect body. Filters are
    // the only trigger — this panel does not poll.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  // Any filter change returns to the first page — staying on page 7 of a
  // narrower result set is how "no results" states get misread as empty data.
  const setFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setSkip(0);
  };

  const showing = useMemo(
    () => (total === 0 ? '0' : `${skip + 1}–${Math.min(skip + PAGE, total)} of ${total.toLocaleString()}`),
    [skip, total],
  );

  const inputStyle = {
    background: 'var(--cc-bg)', color: 'var(--cc-text)',
    border: '1px solid var(--cc-border, #2a2a3a)', borderRadius: 6,
    padding: '6px 8px', fontSize: 12.5,
  } as const;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <select value={range} onChange={(e) => setFilter(setRange)(e.target.value)} style={inputStyle}>
          {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <select value={action} onChange={(e) => setFilter(setAction)(e.target.value)} style={inputStyle}>
          <option value="all">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={direction} onChange={(e) => setFilter(setDirection)(e.target.value)} style={inputStyle}>
          {DIRECTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <input
          value={userId}
          onChange={(e) => setFilter(setUserId)(e.target.value)}
          placeholder="User ID"
          style={{ ...inputStyle, minWidth: 130, flex: '1 1 130px' }}
        />
        <input
          value={itemId}
          onChange={(e) => setFilter(setItemId)(e.target.value)}
          placeholder="Item id"
          style={{ ...inputStyle, minWidth: 130, flex: '1 1 130px' }}
        />
        <input
          value={txId}
          onChange={(e) => setFilter(setTxId)(e.target.value)}
          placeholder="Transaction ID"
          style={{ ...inputStyle, minWidth: 150, flex: '1 1 150px' }}
        />
      </div>

      {error && (
        <div className="cc-alert cc-alert-error" style={{ marginBottom: 10 }} role="alert">{error}</div>
      )}

      <div style={{ fontSize: 12, color: 'var(--cc-text-faint)', marginBottom: 8 }}>
        {loading ? 'Loading…' : `Showing ${showing} transaction(s)`}
      </div>

      {rows.length === 0 && !loading ? (
        <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>
          No transactions match these filters.
        </p>
      ) : (
        <div className="cc-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--cc-border, #2a2a3a)' }}>
                <th style={th}>Transaction</th>
                <th style={th}>Action</th>
                <th style={th}>Amount</th>
                <th style={th}>Item</th>
                <th style={th}>Source</th>
                <th style={thRight}>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <Fragment key={t.txId}>
                  <tr
                    onClick={() => setOpen(open === t.txId ? null : t.txId)}
                    style={{
                      borderBottom: '1px solid var(--cc-border)',
                      cursor: 'pointer',
                      background: open === t.txId ? 'var(--cc-accent-softer, var(--mg-brand-softer))' : undefined,
                    }}
                  >
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                      {(t.txId ?? 'no-id').slice(0, 10)}…
                    </td>
                    <td style={td}>
                      <code style={{ color: 'var(--cc-accent)' }}>{t.action}</code>
                    </td>
                    <td style={{ ...td, color: t.amount >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString()} {t.currency ?? symbol}
                    </td>
                    <td style={{ ...td, color: 'var(--cc-text-faint)' }}>{t.itemId ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--cc-text-faint)' }}>{t.source}</td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--cc-text-faint)' }}>
                      {new Date(t.at).toLocaleString()}
                    </td>
                  </tr>
                  {open === t.txId && (
                    <tr>
                      <td colSpan={6} style={{ ...td, background: 'rgba(0,0,0,0.25)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                          <Detail label="Transaction ID" value={t.txId ?? '—'} mono />
                          <Detail label="User" value={t.userId ?? '—'} mono />
                          <Detail label="Guild" value={t.guildId ?? '—'} mono />
                          <Detail label="Action" value={t.action ?? '—'} />
                          <Detail label="Amount" value={`${t.amount > 0 ? '+' : ''}${t.amount.toLocaleString()} ${t.currency ?? symbol}`} />
                          <Detail label="Item" value={t.itemId ?? '—'} />
                          <Detail label="Source" value={t.source} />
                          <Detail label="Result" value={t.result} />
                          <Detail label="Timestamp" value={new Date(t.at).toISOString()} mono />
                        </div>
                        {Object.keys(t.metadata ?? {}).length > 0 && (
                          <pre style={{
                            margin: '10px 0 0', padding: 10, fontSize: 11, overflowX: 'auto',
                            background: 'rgba(0,0,0,0.4)', borderRadius: 6, color: 'var(--cc-text-dim)',
                          }}>
                            {JSON.stringify(t.metadata, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
        <button
          className="cc-btn"
          style={{ fontSize: 12 }}
          disabled={skip === 0 || loading}
          onClick={() => setSkip(Math.max(0, skip - PAGE))}
        >
          ← Newer
        </button>
        <button
          className="cc-btn"
          style={{ fontSize: 12 }}
          disabled={skip + PAGE >= total || loading}
          onClick={() => setSkip(skip + PAGE)}
        >
          Older →
        </button>
        <span style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>{showing}</span>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--cc-text-faint)' }}>
        {label}
      </div>
      <div style={{
        fontSize: 12, color: '#fff', marginTop: 2, wordBreak: 'break-all',
        fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      }}>
        {value}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: 10.5,
  textTransform: 'uppercase', letterSpacing: 1, color: 'var(--cc-text-faint)', fontWeight: 700,
};
const thRight: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 12px', color: 'var(--cc-text-dim)' };
