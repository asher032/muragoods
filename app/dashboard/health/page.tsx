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

const SUBSYSTEM_LABELS: Record<string, string> = {
  discord: 'Discord gateway',
  database: 'Database',
  movies: 'Movie API',
  music: 'Music',
  site_bridge: 'Site bridge',
};

// Only a genuine "online"/"ready" is green. Anything else is surfaced verbatim
// — including states like "starting" or "stale-no-gateway-ack", which is the
// whole point: an unrecognised value must not silently render as healthy.
function chipClass(value: string): string {
  if (value === 'online' || value === 'ready') return 'cc-chip cc-chip-ok';
  if (value === 'offline' || value === 'auth-missing' || value.startsWith('stale')) return 'cc-chip cc-chip-err';
  return 'cc-chip cc-chip-warn';
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const CONNECTION_META: Record<string, { label: string; dot: string; hint: string }> = {
  online_connected: { label: 'Online & Connected', dot: '#3ddc84', hint: 'Gateway authenticated, heartbeats ACKed, Discord API reachable.' },
  connecting: { label: 'Connecting', dot: '#f0b429', hint: 'Socket opening or reconnecting — not yet ready.' },
  offline: { label: 'Offline', dot: '#ff6b6b', hint: 'Bot process closed or never started its gateway session.' },
  invalid_token: { label: 'Invalid Token', dot: '#ff6b6b', hint: 'Discord rejected the token — check DISCORD_TOKEN on the bot host.' },
  gateway_failed: { label: 'Gateway Connection Failed', dot: '#ff6b6b', hint: 'Was connected before; heartbeats stopped while Discord API stays reachable.' },
  api_unavailable: { label: 'Discord API Unavailable', dot: '#ff6b6b', hint: 'Discord itself is not answering — explains a dead gateway.' },
};

function BotIdentity({ username, avatarUrl, applicationId, connectionState }: {
  username: string | null;
  avatarUrl: string | null;
  applicationId: string | number | null;
  connectionState: string | null;
}) {
  const meta = (connectionState && CONNECTION_META[connectionState]) || null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" width={48} height={48} style={{ borderRadius: '50%', display: 'block' }} />
      ) : (
        <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🤖</span>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{username ?? 'Unknown bot'}</div>
        <div style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>
          App ID: <span style={{ fontFamily: 'monospace' }}>{applicationId ?? '—'}</span>
        </div>
      </div>
      <span
        className="cc-status-pill"
        title={meta?.hint || 'No live connection state — the bot is unreachable.'}
        style={{ marginLeft: 'auto' }}
      >
        <span className="cc-dot" style={meta ? { background: meta.dot } : undefined} />
        {meta ? `${meta.dot === '#3ddc84' ? '🟢' : meta.dot === '#f0b429' ? '🟡' : '🔴'} ${meta.label}` : '⚪ Unknown'}
      </span>
    </div>
  );
}

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

      {/* ── Bot runtime — real measurements from the bot's own /health ── */}
      <div className="cc-card" style={{ padding: '16px 20px', marginBottom: 18 }}>
        <div className="cc-section-label">🤖 Bot runtime — measured, not inferred</div>
        {status?.bot && (
          <BotIdentity
            username={status.bot.user?.username ?? null}
            avatarUrl={status.bot.user?.avatarUrl ?? null}
            applicationId={status.bot.user?.applicationId ?? null}
            connectionState={status.bot.connectionState ?? null}
          />
        )}
        {!status ? (
          <p style={{ color: 'var(--cc-text-faint)', fontSize: 13, margin: '10px 0 0' }}>Waiting for the first check…</p>
        ) : !status.bot ? (
          <p style={{ color: '#ff6b6b', fontSize: 13, margin: '10px 0 0' }}>
            The bot's /health could not be read, so no runtime values can be shown. This is a real
            failure to reach the bot, not a missing measurement.
          </p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginTop: 12 }}>
              <div>
                <div className="cc-section-label">Gateway</div>
                <div className="cc-chip" style={{ marginTop: 4 }}>
                  {status.bot.gateway?.alive === null || status.bot.gateway === null
                    ? 'unknown'
                    : status.bot.gateway.alive ? 'alive' : 'NOT alive'}
                </div>
              </div>
              <div>
                <div className="cc-section-label">Heartbeat age</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {status.bot.gateway?.heartbeatAgeSeconds !== null && status.bot.gateway
                    ? `${status.bot.gateway.heartbeatAgeSeconds.toFixed(1)}s`
                    : 'not measured'}
                </div>
                {status.bot.gateway?.staleAfterSeconds != null && (
                  <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                    stale after {status.bot.gateway.staleAfterSeconds}s
                  </div>
                )}
              </div>
              <div>
                <div className="cc-section-label">Last heartbeat</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  {status.bot.lastHeartbeat
                    ? new Date(status.bot.lastHeartbeat).toLocaleTimeString()
                    : 'not measured'}
                </div>
              </div>
              <div>
                <div className="cc-section-label">Reconnects</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {status.bot.reconnectCount ?? '—'}
                </div>
              </div>
              <div>
                <div className="cc-section-label">Uptime</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {formatUptime(status.bot.uptimeSeconds)}
                </div>
              </div>
              <div>
                <div className="cc-section-label">Latency</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {status.bot.latency != null ? `${status.bot.latency}ms` : '—'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                  gateway heartbeat round-trip
                </div>
              </div>
              <div>
                <div className="cc-section-label">Discord API</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {status.bot.lastApiCheck?.reachable === true
                    ? `🟢 Reachable${status.bot.lastApiCheck.latencyMs != null ? ` · ${status.bot.lastApiCheck.latencyMs}ms` : ''}`
                    : status.bot.lastApiCheck?.reachable === false
                      ? '🔴 Unavailable'
                      : '⚪ Not checked'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                  Last successful check:{' '}
                  {status.bot.lastApiCheck?.at
                    ? new Date(status.bot.lastApiCheck.at).toLocaleTimeString()
                    : 'never'}
                </div>
              </div>
              <div>
                <div className="cc-section-label">FFmpeg</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {status.bot.ffmpeg === null ? 'not measured' : status.bot.ffmpeg ? 'available' : 'MISSING'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                  decoder measured on the bot host
                </div>
              </div>
              <div>
                <div className="cc-section-label">Opus codec</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {status.bot.opus == null
                    ? 'not measured'
                    : status.bot.opus.status === 'ready'
                      ? status.bot.opus.loaded ? 'ready (loaded)' : 'ready (loads on connect)'
                      : 'unknown'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                  loads lazily on first voice join — unknown at rest is normal
                </div>
              </div>
              <div>
                <div className="cc-section-label">Voice backend</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {status.bot.voiceBackend == null
                    ? 'not measured'
                    : status.bot.voiceBackend.davey === true
                      ? 'davey installed'
                      : status.bot.voiceBackend.davey === false
                        ? 'MISSING davey'
                        : 'unknown'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                  {status.bot.voiceBackend?.davey === false
                    ? 'no track can play until the bot requirements are reinstalled'
                    : 'discord.py voice protocol support'}
                </div>
              </div>
              <div>
                <div className="cc-section-label">Guilds</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{status.bot.guilds ?? '—'}</div>
              </div>
            </div>

            {Object.keys(status.bot.subsystems).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                {Object.entries(status.bot.subsystems).map(([key, value]) => (
                  <span key={key} className={chipClass(value)}>
                    {SUBSYSTEM_LABELS[key] ?? key}: {value}
                  </span>
                ))}
              </div>
            )}

            {status.bot.databaseDetail && status.bot.subsystems.database !== 'online' && (
              <div className="cc-alert cc-alert-error" style={{ marginTop: 14, fontSize: 13 }}>
                <strong>
                  Database {' '}
                  {status.bot.databaseDetail.configured === false ? 'not configured' : 'unreachable'}
                </strong>
                {status.bot.databaseDetail.errorClass && (
                  <span style={{ color: 'var(--cc-text-faint)' }}> ({status.bot.databaseDetail.errorClass})</span>
                )}
                {status.bot.databaseDetail.hint && <div style={{ marginTop: 4 }}>{status.bot.databaseDetail.hint}</div>}
              </div>
            )}
          </>
        )}
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
