'use client';

import { AdminHeader } from '../components/AdminShell';
import {
  Banner, Empty, Loading, Panel, RefreshButton, StateBadge, Stat, useAdminResource,
} from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/health — what is actually running.
//
// The previous health surface was a table of environment variables dressed up
// with green ticks, which meant a deployment with no Discord token, an
// unreachable database and an empty playback manifest all reported "Online".
// This page renders only what /api/admin/system-health measured, and the
// "checked" line under every state says what call produced it — so a state is
// always traceable to an actual request rather than to the presence of a key.
// ─────────────────────────────────────────────────────────────────────────

interface Service {
  id: string;
  label: string;
  group: 'website' | 'data' | 'muragoods' | 'discord';
  state: string;
  checked: string;
  detail: string;
  latencyMs: number | null;
}

interface HealthPayload {
  checkedAt: string;
  overall: string;
  services: Service[];
  counts: { online: number; degraded: number; offline: number; notConfigured: number };
}

const GROUP_LABEL: Record<Service['group'], string> = {
  website: 'Muragoods website',
  data: 'Data',
  muragoods: 'Muragoods services',
  discord: 'Discord',
};

export default function AdminHealthPage() {
  const { data, error, loading, reload } = useAdminResource<HealthPayload>('/api/admin/system-health');

  return (
    <>
      <AdminHeader
        title="System health"
        subtitle="Every state below comes from a live, bounded call to the service it describes. A missing credential is reported as NOT CONFIGURED, not as health."
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {error ? <Banner tone="error">Could not read system health: {error}</Banner> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Stat label="Overall" value={<StateBadge state={data.overall} />} />
            <Stat label="Online" value={data.counts.online} tone="var(--mg-success)" />
            <Stat label="Degraded" value={data.counts.degraded} tone="var(--mg-warning)" />
            <Stat label="Offline" value={data.counts.offline} tone="var(--mg-error)" />
            <Stat label="Not configured" value={data.counts.notConfigured} tone="var(--mg-text-muted)" />
          </div>

          {data.overall === 'ONLINE' ? null : (
            <div style={{ marginBottom: 18 }}>
              <Banner tone="warning">
                At least one subsystem is not fully healthy. The overall verdict is the <strong>worst</strong>{' '}
                component, not an average — one dead service cannot hide behind several healthy ones.
              </Banner>
            </div>
          )}

          {(['website', 'data', 'muragoods', 'discord'] as const).map((group) => {
            const services = data.services.filter((s) => s.group === group);
            if (services.length === 0) return null;
            return (
              <Panel key={group} title={GROUP_LABEL[group]}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {services.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) auto 1fr',
                        gap: 12, alignItems: 'start',
                        padding: '11px 12px', borderRadius: 'var(--mg-radius-md)',
                        border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)',
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{s.label}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--mg-text-faint)' }}>
                          checked via {s.checked}
                          {s.latencyMs !== null ? ` · ${s.latencyMs}ms` : ''}
                        </p>
                      </div>
                      <StateBadge state={s.state} />
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mg-text-muted)', lineHeight: 1.5 }}>{s.detail}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            );
          })}

          <Panel>
            <Empty>
              Last probed {new Date(data.checkedAt).toUTCString()}. This page never reports a service as
              healthy because an environment variable exists — only because a request to it succeeded.
            </Empty>
          </Panel>
        </>
      ) : null}
    </>
  );
}