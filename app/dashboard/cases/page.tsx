'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';
import { useGuildResources } from '../components/selectors';

interface CaseNote { text: string; at: string | null }
interface CaseDoc {
  caseId: number;
  action: string;
  targetId: string;
  moderatorId: string;
  reason: string;
  duration: string;
  notes: CaseNote[];
  source: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

const ACTIONS = ['warn', 'timeout', 'mute', 'unmute', 'kick', 'ban', 'unban', 'role_add', 'role_remove', 'note'];
const SOURCES = ['discord', 'dashboard', 'automod', 'system'];
const STATUSES = ['active', 'closed'];
const PAGE_SIZE = 50;

function toCSV(cases: CaseDoc[]): string {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['caseId', 'action', 'targetId', 'moderatorId', 'reason', 'duration', 'source', 'status', 'createdAt']];
  for (const c of cases) {
    rows.push([c.caseId, c.action, c.targetId, c.moderatorId, c.reason, c.duration, c.source, c.status, c.createdAt ?? ''].map(cell));
  }
  return rows.map((r) => r.join(',')).join('\n');
}

export default function CasesPage() {
  const { token, selected } = useGuild();
  const [cases, setCases] = useState<CaseDoc[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [caseIdQuery, setCaseIdQuery] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [reasonDraft, setReasonDraft] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const { resources } = useGuildResources(selected?.id ?? null);

  const nameOf = useCallback((id: string) => {
    const m = (resources?.members ?? []).find((x) => x.id === id);
    return m ? `${m.name} (@${m.username ?? m.name})` : null;
  }, [resources]);

  const load = useCallback(async (append = false) => {
    if (!token || !selected) return;
    setLoadingData(true);
    setFetchError('');
    const params = new URLSearchParams({ guildId: selected.id, limit: String(PAGE_SIZE) });
    if (filterAction) params.set('action', filterAction);
    if (filterSource) params.set('source', filterSource);
    if (filterStatus) params.set('status', filterStatus);
    if (caseIdQuery.trim()) params.set('search', caseIdQuery.trim());
    if (append && cases.length > 0) {
      params.set('before', String(Math.min(...cases.map((c) => c.caseId))));
    }
    const resp = await apiFetch<{ success: boolean; cases: CaseDoc[]; error?: string }>(
      `/api/dashboard/cases?${params.toString()}`, { token });
    if (resp.ok && resp.data.success) {
      const rows = resp.data.cases;
      setCases((prev) => (append ? [...prev, ...rows] : rows));
    } else {
      setFetchError(resp.ok ? resp.data.error || 'Failed to load cases' : resp.error);
    }
    setLoadingData(false);
  }, [token, selected, filterAction, filterSource, filterStatus, caseIdQuery, cases]);

  useEffect(() => {
    setCases([]);
    setExpanded(null);
    if (selected && token) void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, filterAction, filterSource, filterStatus]);

  const mutate = async (caseId: number, body: Record<string, unknown>, what: string) => {
    if (!token || !selected) return;
    setBusyId(caseId);
    setNotice('');
    setFetchError('');
    const resp = await apiFetch<{ success: boolean; error?: string }>('/api/dashboard/cases', {
      method: 'PATCH', token, body: { guildId: selected.id, caseId, ...body },
    });
    if (resp.ok && resp.data.success) {
      setNotice(`✅ Case #${caseId} ${what}.`);
      setNoteDraft('');
      await load(false);
    } else {
      setFetchError(resp.ok ? resp.data.error || 'Update failed' : resp.error);
    }
    setBusyId(null);
  };

  const exportCSV = () => {
    const blob = new Blob([toCSV(cases)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moderation-cases-${selected?.id ?? 'guild'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to view moderation cases.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar to view its cases.</p>;
  }

  const sourceChip = (s: string) => s === 'automod' ? '🤖 AutoMod' : s === 'dashboard' ? '🖥️ Dashboard' : s === 'system' ? '⚙️ System' : '💬 Discord';

  return (
    <div style={{ maxWidth: 960 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 20px', fontSize: 26, fontWeight: 800, color: '#fff' }}>📋 Moderation Cases — {selected.name}</h1>
      <p style={{ margin: '-14px 0 20px', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
        One shared history: Discord commands, dashboard actions and AutoMod write the same case store.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={caseIdQuery} onChange={(e) => setCaseIdQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load(false); }}
          placeholder="Search case #, target or moderator…" className="cc-input" style={{ flex: 1, minWidth: 200 }} />
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="cc-input" aria-label="Filter by action">
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="cc-input" aria-label="Filter by source">
          <option value="">All sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="cc-input" aria-label="Filter by status">
          <option value="">Active + closed</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="cc-btn" onClick={exportCSV} disabled={cases.length === 0}>Export CSV</button>
      </div>

      {fetchError && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 16 }}>{fetchError}</div>}
      {notice && <div className="cc-alert cc-alert-ok" role="status" style={{ marginBottom: 16 }}>{notice}</div>}

      {loadingData && cases.length === 0 && <p style={{ color: 'var(--cc-text-faint)' }}>Loading cases…</p>}
      {!loadingData && cases.length === 0 && (
        <div className="cc-card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--cc-text-faint)' }}>No cases found.</p>
        </div>
      )}
      {cases.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {cases.map((c) => (
            <div key={c.caseId} className="cc-card" style={{ padding: '12px 16px', opacity: c.status === 'closed' ? 0.65 : 1 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                onClick={() => {
                  setExpanded(expanded === c.caseId ? null : c.caseId);
                  setReasonDraft(c.reason);
                  setNoteDraft('');
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#f5f5f7', fontSize: 14 }}>
                    <strong>#{c.caseId}</strong> {c.action.toUpperCase()} — {nameOf(c.targetId) ?? 'Unknown member'}
                  </div>
                  <div style={{ color: 'var(--cc-text-faint)', fontSize: 12, marginTop: 2 }}>
                    {sourceChip(c.source)} · {c.reason ? c.reason.slice(0, 80) : 'No reason'}
                    {' · '}{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}
                  </div>
                </div>
                <span className="cc-chip">{c.status}</span>
              </div>
              {expanded === c.caseId && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--cc-border)', paddingTop: 12, display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                    <div>Moderator: <strong style={{ color: '#fff' }}>{nameOf(c.moderatorId) ?? (c.moderatorId === '0' ? 'System' : 'Unknown member')}</strong></div>
                    {c.duration && <div>Duration: {c.duration}</div>}
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: 'pointer' }}>Developer details</summary>
                      <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>targetId: {c.targetId} · moderatorId: {c.moderatorId}</span>
                    </details>
                  </div>
                  {(c.notes ?? []).length > 0 && (
                    <div style={{ display: 'grid', gap: 4 }}>
                      {c.notes.map((n, i) => (
                        <div key={i} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                          📝 {n.text} <span style={{ color: 'var(--cc-text-faint)' }}>{n.at ? `— ${new Date(n.at).toLocaleString()}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input className="cc-input" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Add a moderator note…" maxLength={300} style={{ flex: 1, minWidth: 200 }} />
                    <button className="cc-btn" disabled={busyId === c.caseId || !noteDraft.trim()}
                      onClick={() => mutate(c.caseId, { note: noteDraft.trim() }, 'note added')}>
                      {busyId === c.caseId ? 'Saving…' : 'Add note'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input className="cc-input" value={reasonDraft} onChange={(e) => setReasonDraft(e.target.value)}
                      placeholder="Edit reason…" maxLength={500} style={{ flex: 1, minWidth: 200 }} />
                    <button className="cc-btn" disabled={busyId === c.caseId}
                      onClick={() => mutate(c.caseId, { reason: reasonDraft }, 'reason updated')}>
                      Save reason
                    </button>
                    {c.status === 'active' ? (
                      <button className="cc-btn" disabled={busyId === c.caseId}
                        onClick={() => mutate(c.caseId, { status: 'closed' }, 'closed')}>
                        Close case
                      </button>
                    ) : (
                      <button className="cc-btn" disabled={busyId === c.caseId}
                        onClick={() => mutate(c.caseId, { status: 'active' }, 'reopened')}>
                        Reopen case
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {cases.length >= PAGE_SIZE && (
        <button className="cc-btn" onClick={() => load(true)} disabled={loadingData} style={{ marginTop: 14 }}>
          {loadingData ? 'Loading…' : 'Load older cases'}
        </button>
      )}
    </div>
  );
}
