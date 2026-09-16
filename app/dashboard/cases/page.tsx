'use client';

import { useState, useEffect } from 'react';
import { useGuild } from '@/app/lib/guild-context';

export default function CasesPage() {
  const { token, selected } = useGuild();
  const [cases, setCases] = useState<Array<Record<string, unknown>>>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [filterAction, setFilterAction] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!selected || !token) return;
    setLoadingData(true);
    setFetchError('');
    fetch(`/api/dashboard/cases?guildId=${selected.id}`, {
      headers: { 'x-discord-token': token },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCases(data.cases || []);
        else setFetchError(data.error || 'Failed to load cases');
        setLoadingData(false);
      })
      .catch(() => {
        setFetchError('Network error');
        setLoadingData(false);
      });
  }, [selected, token]);

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to view moderation cases.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar to view its cases.</p>;
  }

  const filtered = cases.filter((c) => {
    const targetName = String(c.targetName || '');
    const targetId = String(c.targetId || '');
    const matchAction = !filterAction || c.action === filterAction;
    const matchUser = !searchUser || targetName.includes(searchUser) || targetId.includes(searchUser);
    return matchAction && matchUser;
  });

  return (
    <div>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 20px', fontSize: 26, fontWeight: 800, color: '#fff' }}>🛡️ Moderation Cases — {selected.name}</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={searchUser} onChange={(e) => setSearchUser(e.target.value)} placeholder="Search user..." className="cc-input" style={{
          flex: 1, minWidth: 200,
        }} />
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="cc-input">
          <option value="">All Actions</option>
          <option value="warn">Warn</option>
          <option value="kick">Kick</option>
          <option value="ban">Ban</option>
          <option value="mute">Mute</option>
          <option value="unban">Unban</option>
        </select>
      </div>

      {fetchError && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 16 }}>{fetchError}</div>}

      {loadingData && <p style={{ color: 'var(--cc-text-faint)' }}>Loading cases…</p>}
      {!loadingData && filtered.length === 0 && (
        <div className="cc-card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--cc-text-faint)' }}>No cases found.</p>
        </div>
      )}
      {!loadingData && filtered.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((c, i) => (
            <div key={i} className="cc-card" style={{
              padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#f5f5f7', fontSize: 14 }}>
                  <strong>{String(c.targetName || c.targetId)}</strong> → {String(c.action).toUpperCase()}
                  {c.caseId ? <span style={{ color: 'var(--cc-text-faint)', fontSize: 12, marginLeft: 8 }}>#{String(c.caseId)}</span> : null}
                </div>
                <div style={{ color: 'var(--cc-text-faint)', fontSize: 12, marginTop: 2 }}>
                  By {String(c.moderatorName || c.moderatorId)} — {c.reason ? String(c.reason).slice(0, 80) : 'No reason'}
                </div>
              </div>
              <div style={{ color: 'var(--cc-text-faint)', fontSize: 12, flexShrink: 0 }}>
                {c.createdAt ? new Date(String(c.createdAt)).toLocaleDateString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
