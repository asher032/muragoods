'use client';

import { useState, useEffect } from 'react';
import { useGuild } from '@/app/lib/guild-context';

interface AuditFieldChange {
  section: string;
  field: string;
  before: unknown;
  after: unknown;
}

interface AuditEntry {
  actor: string;
  summary: string;
  changes?: AuditFieldChange[];
  before?: unknown;
  after?: unknown;
  at: string;
}

export default function AuditPage() {
  const { token, selected } = useGuild();
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const renderValue = (v: unknown): string | null => {
    if (v === undefined || v === null) return null;
    return typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v);
  };

  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!selected || !token) return;
    setLoadingData(true);
    setFetchError('');
    fetch(`/api/dashboard/audit?guildId=${selected.id}`, {
      headers: { 'x-discord-token': token },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setAudit(data.audit || []);
        else setFetchError(data.error || 'Failed to load audit log');
        setLoadingData(false);
      })
      .catch(() => {
        setFetchError('Network error');
        setLoadingData(false);
      });
  }, [selected, token]);

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to view the audit log.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar to view its audit log.</p>;
  }

  return (
    <div>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 20px', fontSize: 26, fontWeight: 800, color: '#fff' }}>📜 Audit Log — {selected.name}</h1>

      {fetchError && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 16 }}>{fetchError}</div>}

      {loadingData && <p style={{ color: 'var(--cc-text-faint)' }}>Loading audit log…</p>}
      {!loadingData && audit.length === 0 && (
        <div className="cc-card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--cc-text-faint)' }}>No configuration changes recorded yet.</p>
        </div>
      )}
      {!loadingData && audit.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {audit.map((entry, i) => (
            <div key={i} className="cc-card" style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 12 }}>
                <strong style={{ color: '#f5f5f7', fontSize: 14 }}>{String(entry.actor)}</strong>
                <span style={{ color: 'var(--cc-text-faint)', fontSize: 12, flexShrink: 0 }}>
                  {entry.at ? new Date(String(entry.at)).toLocaleString() : ''}
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--cc-text-dim)', fontSize: 13.5 }}>{String(entry.summary)}</p>
              {Array.isArray(entry.changes) && entry.changes.length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                  {entry.changes.map((c, j) => (
                    <div key={j} style={{
                      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline',
                      fontSize: 12.5, padding: '5px 10px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.03)',
                    }}>
                      <code style={{ color: 'var(--cc-accent)', fontSize: 12 }}>
                        {c.section ? `${c.section}.` : ''}{c.field}
                      </code>
                      <span style={{ color: 'var(--cc-err)' }}>− {c.before === null || c.before === '' ? '(empty)' : String(c.before)}</span>
                      <span style={{ color: 'var(--cc-ok)' }}>+ {c.after === null || c.after === '' ? '(empty)' : String(c.after)}</span>
                    </div>
                  ))}
                </div>
              )}
              {!Array.isArray(entry.changes) && Boolean(entry.before || entry.after) && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--cc-text-faint)' }}>
                  {renderValue(entry.before) ? <div>Before: {String(renderValue(entry.before))}</div> : null}
                  {renderValue(entry.after) ? <div>After: {String(renderValue(entry.after))}</div> : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
