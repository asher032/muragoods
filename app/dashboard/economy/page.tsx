'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';
import { statusMessage } from '../components/selectors';
import ModuleSettings from '../components/ModuleSettings';

interface EconomyOverview {
  users: number;
  circulation: { pocket: number; bank: number; total: number };
  dau: number;
  transactions: number;
  top: Array<{ userId: string; balance: number; bank: number }>;
  recent: Array<{ type: string; amount: number; at: string }>;
}

export default function EconomyPage() {
  const { token, selected } = useGuild();
  const [overview, setOverview] = useState<EconomyOverview | null>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !selected) return;
    setLoading(true);
    setError('');
    setCode('');
    const resp = await apiFetch<{ success: boolean; overview?: EconomyOverview; error?: string; code?: string }>(
      `/api/dashboard/economy/overview?guildId=${selected.id}`, { token });
    if (resp.ok && resp.data.success && resp.data.overview) {
      setOverview(resp.data.overview);
    } else {
      setOverview(null);
      setError(resp.ok ? resp.data.error || 'Could not load economy' : resp.error);
      setCode(resp.ok ? resp.data.code || '' : (resp as { code?: string }).code || '');
    }
    setLoading(false);
  }, [token, selected]);

  useEffect(() => {
    setOverview(null);
    setError('');
    setCode('');
    void load();
  }, [selected?.id, load]);

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to view the economy.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar.</p>;
  }

  const stat = (label: string, value: string | number) => (
    <div className="cc-card" style={{ padding: '12px 16px' }}>
      <div className="cc-section-label">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 2 }}>{value}</div>
    </div>
  );

  const mapped = error ? statusMessage(code, error) : null;

  return (
    <div style={{ maxWidth: 960 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>💰 Economy — {selected.name}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        Live totals from the same database the Discord commands use — never a parallel economy.
      </p>

      <div className="cc-section-label" style={{ marginBottom: 10 }}>Overview</div>
      {mapped && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 12 }}>
          <strong>⚠️ {mapped.title}</strong>
          <div style={{ marginTop: 4 }}>{mapped.hint}</div>
          <button className="cc-btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {loading && !overview && (
        <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading economy…</p>
      )}
      {overview && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
            {stat('Users', overview.users)}
            {stat('In circulation', overview.circulation.total.toLocaleString())}
            {stat('Daily active', overview.dau)}
            {stat('Transactions', overview.transactions.toLocaleString())}
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 22 }}>
            <div className="cc-card" style={{ padding: '14px 18px' }}>
              <strong style={{ color: '#fff', fontSize: 14 }}>🏆 Top holders</strong>
              {overview.top.length === 0 ? (
                <p style={{ margin: '8px 0 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>No holders yet.</p>
              ) : (
                <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                  {overview.top.map((t, i) => (
                    <div key={t.userId} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                      <strong style={{ color: '#fff' }}>#{i + 1}</strong> <code>&lt;@{t.userId}&gt;</code>
                      {' '}— {(t.balance + t.bank).toLocaleString()}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="cc-card" style={{ padding: '14px 18px' }}>
              <strong style={{ color: '#fff', fontSize: 14 }}>📜 Recent activity</strong>
              {overview.recent.length === 0 ? (
                <p style={{ margin: '8px 0 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>No transactions yet.</p>
              ) : (
                <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                  {overview.recent.slice(0, 8).map((t, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                      <code>{t.type}</code> {t.amount > 0 ? '+' : ''}{t.amount}
                      <span style={{ color: 'var(--cc-text-faint)' }}> · {new Date(t.at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Configuration</div>
      <ModuleSettings moduleId="economy" />
    </div>
  );
}
