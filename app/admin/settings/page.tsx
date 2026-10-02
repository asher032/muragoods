'use client';

import { useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import {
  Banner, Empty, Field, Loading, Panel, RefreshButton, Stat, StateBadge, useAdminResource,
} from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/settings — audit, payments, bridge and deployment facts.
//
// Two rules again. Secrets are never displayed: a configured key is reported
// as configured, not printed, because an admin panel that renders a token is
// an admin panel that eventually leaks one. And nothing here offers a "save"
// for something that only takes effect on the next deploy.
// ─────────────────────────────────────────────────────────────────────────

interface AuditPayload {
  guildId: string;
  updatedAt: string | null;
  count: number;
  retention: string;
  entries: {
    actor: string;
    summary: string;
    at: string;
    changes: { section: string; field: string; before: string | null; after: string | null }[];
  }[];
}

interface HealthPayload {
  checkedAt: string;
  services: { id: string; label: string; state: string; detail: string }[];
}

interface BotPayload {
  bridge: { configured: boolean; base: string; reachable: boolean | null };
  bot: null | { online: boolean; state: string | null; botUserId: string | null; uptimeSeconds: number | null; latencyMs: number | null };
  readOnly: boolean;
}

export default function AdminSettingsPage() {
  const health = useAdminResource<HealthPayload>('/api/admin/system-health');
  const bot = useAdminResource<BotPayload>('/api/admin/murabot');

  const [guildId, setGuildId] = useState('');
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  async function loadAudit() {
    setAuditBusy(true);
    setAuditError(null);
    setAudit(null);
    const res = await fetch(`/api/admin/audit?guildId=${encodeURIComponent(guildId.trim())}`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setAuditError(body?.error || 'Could not read the audit trail.');
    } else {
      setAudit(body);
    }
    setAuditBusy(false);
  }

  const service = (id: string) => health.data?.services.find((s) => s.id === id);
  const payments = service('payments');
  const notifications = service('notifications');

  return (
    <>
      <AdminHeader
        title="Settings"
        subtitle="Audit trail, payment and notification configuration, the Muragoods ↔ Murabot bridge, and deployment facts. Secrets are reported as configured or not — never displayed."
        actions={<RefreshButton onClick={() => { health.reload(); bot.reload(); }} busy={health.loading} />}
      />

      {/* ── Deployment facts ─────────────────────────────────────────── */}
      <Panel title="Deployment" hint="Facts about this deployment, read from the running process.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <Stat label="Website health" value={health.data ? <StateBadge state={service('website')?.state ?? 'ONLINE'} /> : '—'} />
          <Stat label="Database" value={health.data ? <StateBadge state={service('database')?.state ?? 'OFFLINE'} /> : '—'} />
          <Stat label="Murabot bridge" value={health.data ? <StateBadge state={service('murabot_bridge')?.state ?? 'OFFLINE'} /> : '—'} />
          <Stat
            label="Bot identity"
            value={bot.data?.bot?.botUserId || (bot.data?.bridge.configured ? 'unreported' : 'not configured')}
          />
          <Stat label="Bot uptime" value={bot.data?.bot?.uptimeSeconds != null ? `${Math.round(bot.data.bot.uptimeSeconds / 60)}m` : '—'} />
          <Stat label="Bot latency" value={bot.data?.bot?.latencyMs != null ? `${bot.data.bot.latencyMs}ms` : '—'} />
        </div>
        {bot.data ? (
          <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--mg-text-muted)' }}>
            Bridge endpoint: <code>{bot.data.bridge.base}</code>
            {bot.data.bridge.configured
              ? ' · credential present on this deployment.'
              : ' · no bridge credential, so this deployment cannot drive Murabot.'}
          </p>
        ) : null}
      </Panel>

      {/* ── Payments & notifications ─────────────────────────────────── */}
      <Panel
        title="Payments & notifications"
        hint="These are environment credentials, managed in the deployment's key store. Reporting them here is deliberate: a control that wrote a value the runtime does not read would be a lie."
      >
        {health.loading && !health.data ? <Loading /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {[payments, notifications].filter(Boolean).map((s) => (
              <div key={s!.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 200px) auto 1fr', gap: 12, alignItems: 'start', padding: '11px 12px', borderRadius: 'var(--mg-radius-md)', border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{s!.label}</p>
                <StateBadge state={s!.state} />
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mg-text-muted)', lineHeight: 1.5 }}>{s!.detail}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Audit ────────────────────────────────────────────────────── */}
      <Panel
        title="Audit trail"
        hint="Configuration changes recorded on the guild configuration document — the same store Murabot and the dashboard write to. Reading it is a Muragoods technical scope, not a per-server Discord permission."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 14 }}>
          <div style={{ minWidth: 240 }}>
            <Field label="Discord server ID" value={guildId} onChange={setGuildId} placeholder="123456789012345678" />
          </div>
          <button
            type="button"
            className="mg-btn mg-btn-primary"
            onClick={loadAudit}
            disabled={auditBusy || !/^\d{5,25}$/.test(guildId.trim())}
            style={{ marginBottom: 6 }}
          >
            {auditBusy ? 'Loading…' : 'Load audit trail'}
          </button>
        </div>

        {auditError ? <Banner tone="error">{auditError}</Banner> : null}

        {audit ? (
          audit.entries.length === 0 ? (
            <Empty>No configuration changes have been recorded for this server.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--mg-text-faint)' }}>
                {audit.count} entr{audit.count === 1 ? 'y' : 'ies'}. {audit.retention}
              </p>
              {audit.entries.map((e, i) => (
                <div key={`${e.at}-${i}`} style={{ padding: '11px 12px', borderRadius: 'var(--mg-radius-md)', border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)' }}>
                  <p style={{ margin: 0, fontSize: 12.5 }}>
                    <strong>{e.actor}</strong> · {e.summary}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--mg-text-faint)' }}>{new Date(e.at).toUTCString()}</p>
                  {e.changes?.length ? (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {e.changes.map((c, j) => (
                        <span key={j} className="mg-badge">
                          {c.section ? `${c.section}.` : ''}{c.field}: {c.before ?? '∅'} → {c.after ?? '∅'}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )
        ) : null}
      </Panel>
    </>
  );
}