'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';

interface BotError {
  id: string;
  source: string;
  message: string;
  command: string;
  guildId: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  detail: string;
  resolved: boolean;
  createdAt: string;
}

const SEVERITY_CHIP: Record<BotError['severity'], string> = {
  info: 'cc-chip-ok',
  warning: 'cc-chip-warn',
  error: 'cc-chip-err',
  critical: 'cc-chip-err',
};

type Tab = 'open' | 'resolved' | 'all';

export default function ErrorsPage() {
  const { token, selected } = useGuild();
  const [errors, setErrors] = useState<BotError[]>([]);
  const [tab, setTab] = useState<Tab>('open');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    const url = selected
      ? `/api/dashboard/errors?guildId=${encodeURIComponent(selected.id)}`
      : '/api/dashboard/errors';
    const resp = await apiFetch<{ success: boolean; errors: BotError[] }>(url, { token });
    if (resp.ok && resp.data.success) {
      setErrors(resp.data.errors);
    } else if (resp.ok) {
      setError('Unexpected response from the error service.');
    } else {
      setError(resp.error);
    }
    setLoading(false);
  }, [token, selected]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const visible = useMemo(() => {
    let list = errors;
    if (tab === 'open') list = list.filter((e) => !e.resolved);
    if (tab === 'resolved') list = list.filter((e) => e.resolved);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        e.message.toLowerCase().includes(q) ||
        e.command.toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q) ||
        e.guildId.includes(q));
    }
    return list;
  }, [errors, tab, query]);

  const openCount = errors.filter((e) => !e.resolved).length;

  const setResolved = async (e: BotError, resolved: boolean) => {
    setBusyId(e.id);
    const resp = await apiFetch<{ success: boolean }>('/api/dashboard/errors', {
      method: 'PATCH',
      token: token || undefined,
      body: { id: e.id, resolved },
    });
    if (resp.ok && resp.data.success) {
      setErrors((prev) => prev.map((x) => (x.id === e.id ? { ...x, resolved } : x)));
    } else {
      setError(resp.ok ? 'Update failed.' : `Update failed: ${resp.error}`);
    }
    setBusyId(null);
  };

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to view the Error Center.</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
          <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 800, color: '#fff' }}>🚨 Error Center{selected ? ` — ${selected.name}` : ''}</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--cc-text-dim)' }}>
            Real errors relayed from the bot, backend and database. {openCount} unresolved.
          </p>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div className="cc-tabs" role="tablist">
          {(['open', 'resolved', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`cc-tab ${tab === t ? 'cc-tab-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'open' ? `Open (${openCount})` : t === 'resolved' ? 'Resolved' : 'All'}
            </button>
          ))}
        </div>
        <input
          className="cc-input"
          style={{ maxWidth: 280 }}
          placeholder="Search message, command, source…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && errors.length === 0 && <p style={{ color: 'var(--cc-text-faint)' }}>Loading errors…</p>}

      {!loading && visible.length === 0 && (
        <div className="cc-card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--cc-text-faint)' }}>
            {tab === 'open' ? '✅ No unresolved errors — everything reported is healthy.' : 'Nothing here yet.'}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {visible.map((e) => (
          <div key={e.id} className="cc-card" style={{ padding: '14px 18px', opacity: e.resolved ? 0.65 : 1 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
            >
              <span className={`cc-chip ${SEVERITY_CHIP[e.severity] || 'cc-chip-err'}`}>{e.severity}</span>
              <span className="cc-chip">{e.source}</span>
              {e.command && <span className="cc-chip">/{e.command}</span>}
              <span style={{ flex: 1, minWidth: 200, fontWeight: 600, color: '#fff', fontSize: 14 }}>{e.message}</span>
              <span style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </div>
            {expanded === e.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--cc-border)', paddingTop: 12 }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--cc-text-dim)' }}>
                  Source: {e.source}
                  {e.guildId && (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: 'pointer' }}>Developer details</summary>
                      <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>Guild ID: {e.guildId}</span>
                    </details>
                  )}
                </p>
                {e.detail && (
                  <pre style={{
                    margin: '10px 0', padding: 12, borderRadius: 8, overflowX: 'auto',
                    background: 'rgba(0,0,0,0.35)', fontSize: 12, color: 'var(--cc-text-dim)',
                  }}>{e.detail}</pre>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  {e.resolved ? (
                    <button className="cc-btn" onClick={() => setResolved(e, false)} disabled={busyId === e.id}>
                      Mark Unresolved
                    </button>
                  ) : (
                    <button className="cc-btn cc-btn-primary" onClick={() => setResolved(e, true)} disabled={busyId === e.id}>
                      {busyId === e.id ? 'Saving…' : 'Resolve'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
