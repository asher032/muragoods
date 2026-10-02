'use client';

import { useEffect, useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import {
  Banner, Empty, Loading, Panel, RefreshButton, StateBadge, useAdminResource,
} from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/website — website control.
//
// The rule this page follows: a control is offered only where a real write
// path exists. Content lock is a runtime document and is genuinely editable
// here. Branding, navigation, FAQ and policy copy live in the deployed source
// and are edited by shipping a change — so they are REPORTED as deploy-time
// surfaces rather than given text boxes that would silently do nothing.
//
// An admin panel full of inputs that do nothing is worse than no admin panel,
// because it teaches operators to believe their changes landed.
// ─────────────────────────────────────────────────────────────────────────

interface FlagsPayload {
  success: boolean;
  data: { contentLocked: boolean; lockedAt: string | null; lockedMessage: string };
}

interface HealthPayload {
  services: { id: string; label: string; state: string; detail: string }[];
}

export default function AdminWebsitePage() {
  const flags = useAdminResource<FlagsPayload>('/api/admin/site-flags');
  const health = useAdminResource<HealthPayload>('/api/admin/system-health');

  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (flags.data?.data) {
      setLocked(flags.data.data.contentLocked);
      setMessage(flags.data.data.lockedMessage ?? '');
    }
  }, [flags.data]);

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/site-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentLocked: locked, lockedMessage: message }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setResult({ tone: 'error', message: body?.error || 'The change was not saved. Nothing was changed.' });
        return;
      }
      setResult({ tone: 'success', message: locked ? 'Content lock is ON.' : 'Content lock is OFF.' });
      flags.reload();
    } catch {
      setResult({ tone: 'error', message: 'The server could not be reached. Nothing was changed.' });
    } finally {
      setBusy(false);
    }
  }

  const byId = (id: string) => health.data?.services.find((s) => s.id === id);

  return (
    <>
      <AdminHeader
        title="Website"
        subtitle="Runtime website controls. Anything that is decided in source is listed as deploy-time rather than given a control that would silently do nothing."
        actions={<RefreshButton onClick={() => { flags.reload(); health.reload(); }} busy={flags.loading} />}
      />

      {flags.error ? <Banner tone="error">Could not read site flags: {flags.error}</Banner> : null}
      {flags.loading && !flags.data ? <Loading /> : null}
      {result ? <div style={{ marginBottom: 16 }}><Banner tone={result.tone}>{result.message}</Banner></div> : null}

      {flags.data ? (
        <Panel
          title="Content lock & maintenance"
          hint="Hides Murastream and the showcase from everyone while the repository stays public. Admins keep access. This is the only website switch stored at runtime — it takes effect immediately, with no redeploy."
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--mg-brand)' }} />
            Content is locked
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <span className="mg-label">Message shown to visitors while locked</span>
            <textarea
              className="mg-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="Back very soon."
              style={{ marginTop: 6 }}
            />
            <span style={{ display: 'block', marginTop: 5, fontSize: 11.5, color: 'var(--mg-text-faint)' }}>
              {message.length}/200 characters
            </span>
          </label>

          <button type="button" className="mg-btn mg-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save website settings'}
          </button>

          {flags.data.data.lockedAt ? (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--mg-text-faint)' }}>
              Currently locked since {new Date(flags.data.data.lockedAt).toUTCString()}.
            </p>
          ) : null}
        </Panel>
      ) : null}

      <Panel
        title="Integrations configured on this deployment"
        hint="Reported from live probes on the health page. These are environment credentials; they are read from the deployment's key store, never edited here, because a value typed into a form would not be in effect until the next deploy anyway."
      >
        {health.loading && !health.data ? <Loading /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['tmdb', 'discord_api', 'murabot_bridge', 'notifications', 'payments'].map((id) => {
              const s = byId(id);
              if (!s) return null;
              return (
                <div key={id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) auto 1fr', gap: 12, alignItems: 'start', padding: '10px 12px', borderRadius: 'var(--mg-radius-md)', border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)' }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{s.label}</p>
                  <StateBadge state={s.state} />
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mg-text-muted)', lineHeight: 1.5 }}>{s.detail}</p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Deploy-time surfaces"
        hint="These are decided in the deployed source. They are listed so the registry is honest about where they live — not because there is a control here."
      >
        <Empty>
          Homepage layout, navigation, branding, theme tokens, FAQ copy, policy pages, reviews policy and
          contact details are source-level. Changing them is a deploy, not a save — and pretending
          otherwise with a form would produce controls that report success and change nothing.
        </Empty>
      </Panel>
    </>
  );
}