'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';

// ── /dashboard/diagnostics ──────────────────────────────────────────────
// One table naming the exact failing service: each row resolves to
// Online / Degraded / Offline / Unknown with a Retry button — never a
// permanent "Loading…". Backed by GET /api/dashboard/health (+ guild
// verification when a server is selected). Real measured states only.

type State = 'ok' | 'degraded' | 'offline' | 'unauthenticated' | 'unconfigured' | 'unknown' | 'online';

interface HealthData {
  ok: boolean;
  dashboard?: State;
  authentication?: State;
  database?: State;
  discord_api?: State;
  discord_gateway?: State;
  bot?: State;
  guild_service?: State;
  detail?: { databaseState?: string | null; checkedAt?: string; responseTimeMs?: number };
}

const ROWS: Array<{ key: keyof HealthData; label: string }> = [
  { key: 'dashboard', label: 'Dashboard API' },
  { key: 'authentication', label: 'Authentication' },
  { key: 'database', label: 'Database' },
  { key: 'discord_api', label: 'Discord API' },
  { key: 'discord_gateway', label: 'Discord Gateway' },
  { key: 'bot', label: 'Murabot' },
  { key: 'guild_service', label: 'Guild service' },
];

function pill(state: State | undefined): { text: string; cls: string } {
  switch (state) {
    case 'ok':
    case 'online':
      return { text: 'Online', cls: 'cc-status-online' };
    case 'degraded':
      return { text: 'Degraded', cls: 'cc-status-degraded' };
    case 'offline':
      return { text: 'Offline', cls: 'cc-status-offline' };
    case 'unauthenticated':
      return { text: 'Sign-in required', cls: 'cc-status-offline' };
    case 'unconfigured':
      return { text: 'Not configured', cls: 'cc-status-degraded' };
    default:
      return { text: 'Unknown', cls: '' };
  }
}

function hintFor(key: string, state: State | undefined, data: HealthData | null): string {
  if (state === 'unauthenticated') return 'Discord authentication required — sign in again, do not retry blindly.';
  if (key === 'database' && state === 'offline')
    return `Database unavailable${data?.detail?.databaseState ? ` (${data.detail.databaseState})` : ''}. Retry.`;
  if (key === 'bot' && state !== 'ok') return 'Bot service did not report healthy — music/bridge features may fail; other modules still work.';
  if (key === 'discord_api' && state !== 'ok') return 'Discord did not answer — permission checks will retry automatically.';
  if (key === 'guild_service' && state === 'degraded') return 'You do not manage this server, or the bot is not installed here.';
  return '';
}

export default function DiagnosticsPage() {
  const { token, selected, authChecked, authenticated } = useGuild();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [latency, setLatency] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!authChecked) return;
    setLoading(true);
    setError('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const started = Date.now();
    try {
      const qs = selected ? `?guildId=${encodeURIComponent(selected.id)}` : '';
      const resp = await fetch(`/api/dashboard/health${qs}`, { cache: 'no-store', signal: controller.signal });
      const body = (await resp.json().catch(() => null)) as HealthData | null;
      setLatency(Date.now() - started);
      if (!body || typeof body.ok !== 'boolean') {
        setData(null);
        setError(`Health check returned HTTP ${resp.status} with no usable body.`);
        return;
      }
      setData({ ...body, dashboard: 'online' });
    } catch (err) {
      setData(null);
      setError(err instanceof DOMException && err.name === 'AbortError'
        ? 'Health check timed out after 15s — retry.'
        : 'Could not reach the health endpoint — retry.');
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [authChecked, selected]);

  useEffect(() => {
    setData(null);
    setError('');
    void load();
  }, [load]);

  if (!authChecked) {
    return <p style={{ color: 'var(--cc-text-dim)', fontSize: 13 }}>Checking your session…</p>;
  }
  if (!token || !authenticated) {
    return (
      <div className="cc-card" style={{ padding: 24, maxWidth: 560 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#fff' }}>Discord authentication required</h1>
        <p style={{ fontSize: 13, color: 'var(--cc-text-dim)' }}>
          Diagnostics needs a signed-in session. Your session expired or was never created — sign in again.
        </p>
        <a href="/api/auth/discord" className="cc-btn cc-btn-primary">Connect with Discord</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>Diagnostics</h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        Live service states{selected ? <> for <strong style={{ color: '#fff' }}>{selected.name}</strong></> : ' (no server selected — guild row will read Unknown)'}.
        {latency != null && <> Checked in {latency}ms.</>}
      </p>

      {loading && !data && !error && (
        <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Checking services…</p>
      )}
      {error && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 14, fontSize: 13 }}>
          <strong>⚠️ Health check failed.</strong>
          <div style={{ marginTop: 4 }}>{error}</div>
          <button className="cc-btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {data && (
        <div className="cc-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--cc-text-faint)', fontSize: 11 }}>
                <th style={{ padding: '10px 16px' }}>SERVICE</th>
                <th style={{ padding: '10px 16px' }}>STATUS</th>
                <th style={{ padding: '10px 16px' }}>NOTE</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const state = (data[r.key] as State | undefined) ?? 'unknown';
                const p = pill(state);
                const hint = hintFor(r.key, state, data);
                return (
                  <tr key={r.key} style={{ borderTop: '1px solid var(--cc-border)' }}>
                    <td style={{ padding: '10px 16px', color: '#fff', fontWeight: 600 }}>{r.label}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className={`cc-status-pill ${p.cls}`}><span className="cc-dot" /> {p.text}</span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--cc-text-dim)', fontSize: 12 }}>{hint || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--cc-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="cc-btn" style={{ fontSize: 12 }} onClick={() => void load()} disabled={loading}>
              {loading ? 'Checking…' : 'Retry'}
            </button>
            {!selected && (
              <span style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>Select a Discord server to continue — guild checks need one.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
