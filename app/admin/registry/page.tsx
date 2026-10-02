'use client';

import { useMemo, useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import { Empty, Panel, Stat, useAdminResource } from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/registry — the map of the whole ecosystem.
//
// "Add the missing controls" is only actionable if you can first see what
// exists. Every feature is listed with the four access levels and the
// machinery behind it, so a gap — a feature with no admin surface — is visible
// rather than merely undocumented. scripts/check-admin-coverage.mjs fails CI
// when a declared surface does not exist.
// ─────────────────────────────────────────────────────────────────────────

interface Feature {
  id: string;
  area: string;
  feature: string;
  user: string;
  serverAdmin: string;
  staffScope?: string;
  owner: string;
  adminSurface: string;
  api?: string;
  store?: string;
  runtime?: string;
  ownerManageable?: false;
}

interface Payload {
  registry: {
    areas: string[];
    features: Feature[];
    count: number;
  } | null;
}

const LEVEL_STYLE: Record<string, string> = {
  manage: 'var(--mg-success)',
  read: 'var(--mg-info)',
  use: 'var(--mg-text-muted)',
  guildConfig: 'var(--mg-accent-bot)',
  none: 'var(--mg-text-faint)',
};

export default function AdminRegistryPage() {
  const { data, error, loading } = useAdminResource<Payload>('/api/admin/access');
  const [area, setArea] = useState<string>('all');
  const [query, setQuery] = useState('');

  const features = data?.registry?.features ?? [];
  const areas = data?.registry?.areas ?? [];

  const filtered = useMemo(() => features.filter((f) => {
    if (area !== 'all' && f.area !== area) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return f.feature.toLowerCase().includes(q)
      || f.id.toLowerCase().includes(q)
      || (f.api || '').toLowerCase().includes(q)
      || (f.store || '').toLowerCase().includes(q);
  }), [features, area, query]);

  const stats = useMemo(() => ({
    total: features.length,
    manageable: features.filter((f) => f.owner === 'manage').length,
    withApi: features.filter((f) => f.api).length,
    gaps: features.filter((f) => !f.adminSurface || f.ownerManageable === false).length,
  }), [features]);

  return (
    <>
      <AdminHeader
        title="Feature registry"
        subtitle="Every feature in the Muragoods ecosystem, its four access levels, and the API, database and runtime service behind it."
      />

      {error ? <p style={{ color: 'var(--mg-error)', fontSize: 13 }}>{error}</p> : null}
      {loading && !data ? <p style={{ fontSize: 13, color: 'var(--mg-text-muted)' }}>Loading…</p> : null}

      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Stat label="Features" value={stats.total} />
            <Stat label="Owner-manageable" value={stats.manageable} tone="var(--mg-success)" />
            <Stat label="With a canonical API" value={stats.withApi} />
            <Stat label="Read-only for owner" value={stats.gaps} tone="var(--mg-text-muted)" />
          </div>

          <Panel title="Filter">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ minWidth: 240 }}>
                <span className="mg-label">Search</span>
                <input
                  className="mg-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Feature, id, API or store"
                  style={{ marginTop: 6 }}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                <button type="button" className={`mg-btn ${area === 'all' ? 'mg-btn-primary' : 'mg-btn-ghost'}`} onClick={() => setArea('all')}>All</button>
                {areas.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`mg-btn ${area === a ? 'mg-btn-primary' : 'mg-btn-ghost'}`}
                    onClick={() => setArea(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {filtered.length === 0 ? (
            <Empty>No feature matches that filter.</Empty>
          ) : (
            <Panel title={`${filtered.length} feature(s)`}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 900 }}>
                  <thead>
                    <tr>
                      {['Feature', 'User', 'Server admin', 'Staff scope', 'Owner', 'Admin surface', 'API', 'Store', 'Runtime'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, letterSpacing: '0.05em', color: 'var(--mg-text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--mg-border)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => (
                      <tr key={f.id} style={{ borderBottom: '1px solid var(--mg-border)', verticalAlign: 'top' }}>
                        <td style={{ padding: '9px 10px' }}>
                          <p style={{ margin: 0, fontWeight: 600 }}>{f.feature}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--mg-text-faint)' }}>{f.id}</p>
                        </td>
                        <td style={{ padding: '9px 10px', color: LEVEL_STYLE[f.user] ?? 'var(--mg-text-muted)' }}>{f.user}</td>
                        <td style={{ padding: '9px 10px', color: LEVEL_STYLE[f.serverAdmin] ?? 'var(--mg-text-muted)' }}>{f.serverAdmin}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)' }}>{f.staffScope ?? '—'}</td>
                        <td style={{ padding: '9px 10px', color: LEVEL_STYLE[f.owner] ?? 'var(--mg-text-muted)' }}>
                          {f.owner}{f.ownerManageable === false ? '*' : ''}
                        </td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)', whiteSpace: 'nowrap' }}>{f.adminSurface || '—'}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)' }}>{f.api || '—'}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)' }}>{f.store || '—'}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)' }}>{f.runtime || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--mg-text-faint)' }}>
                <strong>*</strong> = genuinely user-owned; no admin control exists or should exist
                (a member&apos;s face value on a review, a letter&apos;s contents). Not a gap.
              </p>
            </Panel>
          )}
        </>
      ) : null}
    </>
  );
}