'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch, dashboardApi, type BotStatusResponse } from '../lib/api';

interface ServiceRow {
  key: string;
  label: string;
  health?: { status: 'ok' | 'degraded' | 'offline'; responseTime: number; lastCheck: string };
}

interface KeepaliveResponse {
  success: boolean;
  last: { ok: boolean; dbOk: boolean; botOk: boolean; botStatus: number; botLatencyMs: number; detail: string; at: string } | null;
  schedule: string;
  totals: {
    checks: number;
    ok: number;
    failed: number;
    lastFailure: { at: string; detail: string; botStatus: number } | null;
  };
}

const NEXT_CHECK_POLL_MS = 45_000;

export default function HealthPage() {
  const { token, selected } = useGuild();
  const [status, setStatus] = useState<BotStatusResponse | null>(null);
  const [keepalive, setKeepalive] = useState<KeepaliveResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [nextRun, setNextRun] = useState<Date | null>(null);

  const runCheck = useCallback(async (manual: boolean) => {
    setError('');
    if (manual) setRunning(true);
    try {
      const resp = await dashboardApi.status();
      if (resp.ok) {
        setStatus(resp.data);
        setLastRun(new Date());
        setNextRun(new Date(Date.now() + NEXT_CHECK_POLL_MS));
      } else {
        setError(`Health check failed: ${resp.error}${resp.retryable ? ' (will retry on next cycle)' : ''}`);
      }
    } finally {
      if (manual) setRunning(false);
    }
  }, []);

  // Auto-refresh cycle — the dashboard polls, the backend /status does the real checks.
  useEffect(() => {
    runCheck(false);
    const t = setInterval(() => runCheck(false), NEXT_CHECK_POLL_MS);
    return () => clearInterval(t);
  }, [runCheck]);

  const services: ServiceRow[] = useMemo(() => [
    { key: 'dashboardBackend', label: 'Dashboard Backend', health: status?.services.dashboardBackend },
    { key: 'database', label: 'Database', health: status?.services.database },
    { key: 'discordApi', label: 'Discord API', health: status?.services.discordApi },
    { key: 'botGateway', label: 'Bot Gateway', health: status?.services.botGateway },
  ], [status]);

  const loadKeepalive = useCallback(async () => {
    try {
      const resp = await apiFetch<KeepaliveResponse>('/api/dashboard/keepalive');
      if (resp.ok && resp.data.success) setKeepalive(resp.data);
      // Silent on failure — keep-alive is supplementary data, not a page blocker.
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    loadKeepalive();
    const t = setInterval(loadKeepalive, 60_000);
    return () => clearInterval(t);
  }, [loadKeepalive]);

  const overall = status?.status ?? 'offline';
  const pill = overall === 'ok' ? 'cc-status-online' : overall === 'degraded' ? 'cc-status-degraded' : 'cc-status-offline';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff' }}>Health Monitor</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--cc-text-dim)' }}>
            Real server-side checks — no synthetic traffic, no fabricated status.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`cc-status-pill ${pill}`}>
            <span className="cc-dot" />
            {overall === 'ok' ? 'Operational' : overall === 'degraded' ? 'Degraded' : 'Offline'}
          </span>
          <button className="cc-btn cc-btn-primary" onClick={() => runCheck(true)} disabled={running}>
            {running ? 'Running…' : 'Run Health Check'}
          </button>
        </div>
      </div>

      {error && <div className="cc-alert cc-alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="cc-card" style={{ padding: '6px 0', overflowX: 'auto', marginBottom: 18 }}>
        <table className="cc-table">
          <thead>
            <tr><th>Service</th><th>Status</th><th>Latency</th><th>Last Check</th></tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.key}>
                <td style={{ fontWeight: 600 }}>{s.label}</td>
                <td>
                  {s.health ? (
                    <span className={`cc-chip ${s.health.status === 'ok' ? 'cc-chip-ok' : s.health.status === 'degraded' ? 'cc-chip-warn' : 'cc-chip-err'}`}>
                      {s.health.status}
                    </span>
                  ) : (
                    <span className="cc-chip">checking…</span>
                  )}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {s.health ? `${s.health.responseTime}ms` : '—'}
                </td>
                <td style={{ color: 'var(--cc-text-dim)', fontSize: 12.5 }}>
                  {s.health ? new Date(s.health.lastCheck).toLocaleTimeString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div className="cc-card" style={{ padding: '14px 18px' }}>
          <div className="cc-section-label">Last Check</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginTop: 4 }}>
            {lastRun ? lastRun.toLocaleTimeString() : '—'}
          </div>
        </div>
        <div className="cc-card" style={{ padding: '14px 18px' }}>
          <div className="cc-section-label">Next Scheduled Check</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginTop: 4 }}>
            {nextRun ? nextRun.toLocaleTimeString() : '—'}
          </div>
        </div>
        <div className="cc-card" style={{ padding: '14px 18px' }}>
          <div className="cc-section-label">Guild Context</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', marginTop: 6 }}>
            {selected?.name ?? 'No server selected'}
            <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)', fontWeight: 400, marginTop: 2 }}>
              {token ? 'Auth token active' : 'Not authenticated'}
            </div>
          </div>
        </div>
      </div>

      <div className="cc-card" style={{ padding: '16px 20px', marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="cc-section-label">💓 Keep-Alive Monitor</div>
            <div style={{ fontSize: 13, color: 'var(--cc-text-dim)', marginTop: 4 }}>
              Server-side checks every 10 minutes (Vercel Cron) — runs even with the dashboard closed.
            </div>
          </div>
          {keepalive?.last ? (
            <span className={`cc-status-pill ${keepalive.last.ok ? 'cc-status-online' : 'cc-status-offline'}`}>
              <span className="cc-dot" />
              {keepalive.last.ok ? 'Healthy' : 'Check failed'}
            </span>
          ) : (
            <span className="cc-chip">waiting for first cron run…</span>
          )}
        </div>
        {keepalive?.last && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 14 }}>
            <div>
              <div className="cc-section-label">Last Request</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{new Date(keepalive.last.at).toLocaleTimeString()}</div>
              <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>DB {keepalive.last.dbOk ? '✓' : '✕'} • Bot {keepalive.last.botOk ? '✓' : `✕ ${keepalive.last.botStatus}`}</div>
            </div>
            <div>
              <div className="cc-section-label">Next Scheduled</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>~10 min after last</div>
              <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>{keepalive.schedule}</div>
            </div>
            <div>
              <div className="cc-section-label">Successful / Failed</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{keepalive.totals.ok} / {keepalive.totals.failed}</div>
            </div>
            <div>
              <div className="cc-section-label">Last Failure</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {keepalive.totals.lastFailure ? new Date(keepalive.totals.lastFailure.at).toLocaleString() : 'none 🎉'}
              </div>
              {keepalive.totals.lastFailure?.detail && (
                <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>{String(keepalive.totals.lastFailure.detail).slice(0, 60)}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
