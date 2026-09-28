'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';
import { statusMessage } from '../components/selectors';
import ModuleSettings from '../components/ModuleSettings';

interface LevelingOverview {
  users: number;
  top: Array<{ userId: string; xp: number; level: number }>;
}

export default function LevelingPage() {
  const { token, selected } = useGuild();
  const [overview, setOverview] = useState<LevelingOverview | null>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !selected) return;
    setLoading(true);
    setError('');
    setCode('');
    const resp = await apiFetch<{ success: boolean; overview?: LevelingOverview; error?: string; code?: string }>(
      `/api/dashboard/leveling/overview?guildId=${selected.id}`, { token });
    if (resp.ok && resp.data.success && resp.data.overview) {
      setOverview(resp.data.overview);
    } else {
      setOverview(null);
      setError(resp.ok ? resp.data.error || 'Could not load leveling' : resp.error);
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
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to view leveling.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar.</p>;
  }

  const mapped = error ? statusMessage(code, error) : null;

  return (
    <div style={{ maxWidth: 960 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>📈 Leveling — {selected.name}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        XP formula: next level needs <code>5n² + 50n + 100</code> XP. Same store as Discord — never a parallel history.
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
        <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading leveling…</p>
      )}
      {overview && (
        <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 22 }}>
          <div style={{ fontSize: 13, color: 'var(--cc-text-dim)', marginBottom: 8 }}>
            <strong style={{ color: '#fff' }}>{overview.users}</strong> members earning XP
          </div>
          {overview.top.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>No XP yet — start chatting.</p>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {overview.top.map((t, i) => (
                <div key={t.userId} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                  <strong style={{ color: '#fff' }}>#{i + 1}</strong> <code>&lt;@{t.userId}&gt;</code>
                  {' '}— Level <strong style={{ color: '#fff' }}>{t.level}</strong> ({t.xp.toLocaleString()} XP)
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Configuration</div>
      <ModuleSettings
        moduleId="leveling"
        title="📈 Leveling"
        description="XP rates, level-up channel and rewards"
      />
    </div>
  );
}
