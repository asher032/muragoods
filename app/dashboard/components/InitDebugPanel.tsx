'use client';

import { useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';

// ── Dashboard init debug panel (?debug=1) ──────────────────────────────
// Self-contained drill-down of the initialization chain: session → selected
// guild → servers → bot status → resources → overview. Each step shows its
// HTTP status, latency and error code so a stuck "Loading…" names the exact
// failing request instead of guessing. Rendered only with ?debug=1.

interface Step {
  label: string;
  state: 'pending' | 'ok' | 'fail';
  detail: string;
}

async function probe(
  label: string,
  url: string,
  init?: RequestInit,
): Promise<Step> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let resp: Response;
    try {
      resp = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const ms = Date.now() - started;
    const body = (await resp.json().catch(() => null)) as {
      success?: boolean; code?: string; error?: string;
    } | null;
    if (resp.ok && body?.success !== false) {
      return { label, state: 'ok', detail: `HTTP ${resp.status} · ${ms}ms` };
    }
    return {
      label, state: 'fail',
      detail: `HTTP ${resp.status} · ${body?.code || 'no-code'} · ${(body?.error || '').slice(0, 90)} · ${ms}ms`,
    };
  } catch (err) {
    const ms = Date.now() - started;
    return {
      label, state: 'fail',
      detail: `${err instanceof DOMException && err.name === 'AbortError' ? 'timeout' : 'network'} · ${ms}ms`,
    };
  }
}

export default function InitDebugPanel() {
  const { selected } = useGuild();
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const gid = selected?.id ?? null;
    const results: Step[] = [];
    results.push(await probe('OAuth session', '/api/auth/discord/me'));
    results.push(await probe('Server list', '/api/dashboard/servers'));
    if (gid) {
      results.push(await probe('Single-server verify', `/api/dashboard/servers?guildId=${gid}`));
      results.push(await probe('Bot status', `/api/discord/guilds/${gid}/status`));
      results.push(await probe('Resources', `/api/dashboard/resources?guildId=${gid}`));
      results.push(await probe('Overview', `/api/dashboard/guilds/${gid}/overview`));
      results.push(await probe('Diagnostics', `/api/dashboard/guilds/${gid}/diagnostics`));
    } else {
      results.push({ label: 'Guild-scoped checks', state: 'fail', detail: 'no server selected' });
    }
    setSteps(results);
    setRunning(false);
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const okCount = steps.filter((s) => s.state === 'ok').length;
  return (
    <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 16, borderColor: 'rgba(240,180,41,0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ color: '#fff', fontSize: 13 }}>
          Dashboard Initialization {steps.length > 0 && `(${okCount}/${steps.length} ok)`}
        </strong>
        <span style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
          guild: {selected ? `${selected.name} (${selected.id})` : '(none selected)'}
        </span>
        <button className="cc-btn" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => void run()} disabled={running}>
          {running ? 'Probing…' : 'Re-run'}
        </button>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: 12.5, fontFamily: 'monospace' }}>
        {steps.length === 0 && <div style={{ color: 'var(--cc-text-faint)' }}>probing…</div>}
        {steps.map((s) => (
          <div key={s.label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span>{s.state === 'ok' ? '✓' : s.state === 'fail' ? '✕' : '…'}</span>
            <span style={{ color: '#fff', minWidth: 170 }}>{s.label}</span>
            <span style={{ color: s.state === 'ok' ? 'var(--cc-ok)' : '#ff8a8a', overflowWrap: 'anywhere' }}>{s.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
