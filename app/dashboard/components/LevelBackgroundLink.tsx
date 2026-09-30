'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Which side of the level-card chain is broken? ───────────────────────
//
// The Leveling page is where this setting is chosen, so it is where the
// answer belongs. Before this existed, the only feedback was "save said
// success" and "the Discord card did not change", with nothing in between to
// distinguish a dashboard bug from a database mismatch from a renderer bug.
//
// It asks the API, which compares the dashboard's stored value against the
// value the BOT reports for the same guild, and renders the verdict plus the
// two values side by side. A green verdict here means the Discord card will
// use the selection on the next /level, with no restart.

type Verdict = 'MATCH' | 'BOT_AHEAD' | 'DASHBOARD_AHEAD' | 'NO_DOCUMENT' | 'UNVERIFIED';

interface Probe {
  dashboard: string | null;
  dashboardDatabase: string | null;
  dashboardUriSource: string | null;
  bot: {
    documentFound: boolean;
    database: string | null;
    databaseSource: string | null;
    raw: string | null;
    field: string | null;
    resolved: string | null;
    asset: string | null;
    assetPresent: boolean;
  } | null;
  botError: { code: string; message: string } | null;
  verdict: Verdict;
  explanation: string;
}

const TONE: Record<Verdict, { color: string; icon: string; label: string }> = {
  MATCH: { color: 'var(--cc-ok)', icon: '✓', label: 'Connected' },
  BOT_AHEAD: { color: '#e0a34a', icon: '⚠', label: 'Out of sync' },
  DASHBOARD_AHEAD: { color: '#ff8a8a', icon: '✕', label: 'Disconnected' },
  NO_DOCUMENT: { color: 'var(--cc-text-faint)', icon: '○', label: 'Not set yet' },
  UNVERIFIED: { color: '#e0a34a', icon: '?', label: 'Could not verify' },
};

export default function LevelBackgroundLink({ guildId, selectedTheme }: {
  guildId: string;
  /** What the form is currently showing, so a divergence is visible. */
  selectedTheme: string | null;
}) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!guildId) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const resp = await fetch(`/api/dashboard/leveling/background?guildId=${guildId}`, {
        cache: 'no-store',
      });
      if (!resp.ok) {
        if (mine === seq.current) {
          setProbe({
            dashboard: selectedTheme, dashboardDatabase: null, dashboardUriSource: null,
            bot: null,
            botError: { code: `HTTP_${resp.status}`, message: 'The diagnostic could not be read.' },
            verdict: 'UNVERIFIED',
            explanation: 'The diagnostic could not be read, so what the Discord card is using is unknown.',
          });
        }
        return;
      }
      const body = (await resp.json()) as Probe;
      if (mine === seq.current) setProbe(body);
    } catch {
      if (mine === seq.current) {
        setProbe({
          dashboard: selectedTheme, dashboardDatabase: null, dashboardUriSource: null,
          bot: null,
          botError: { code: 'NETWORK', message: 'The dashboard could not reach the diagnostic.' },
          verdict: 'UNVERIFIED',
          explanation: 'The diagnostic could not be reached.',
        });
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [guildId, selectedTheme]);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [guildId]);

  const tone = TONE[probe?.verdict ?? 'UNVERIFIED'];
  const row = (label: string, value: string | null | undefined) => (
    <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--cc-text-faint)', minWidth: 148 }}>{label}</span>
      <code style={{ color: 'var(--cc-text-dim)' }}>{value || '—'}</code>
    </div>
  );

  return (
    <div
      style={{
        marginTop: 10, padding: '10px 12px', borderRadius: 8,
        border: '1px solid var(--cc-border, #1e1e2a)',
        borderLeft: `3px solid ${tone.color}`,
        fontSize: 12.5,
      }}
      role="status"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ color: tone.color }}>
          {tone.icon} Level card → Discord: {tone.label}
        </strong>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="cc-btn"
          style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
        >
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </div>
      <div style={{ marginTop: 6, color: 'var(--cc-text-dim)', lineHeight: 1.5 }}>
        {probe?.explanation ?? 'Checking which background Murabot will actually render…'}
      </div>
      {probe && (
        <div style={{ marginTop: 8, display: 'grid', gap: 3, color: 'var(--cc-text-faint)' }}>
          {row('This page shows', selectedTheme)}
          {row('Dashboard database', probe.dashboardDatabase
            ? `${probe.dashboardDatabase} (${probe.dashboardUriSource ?? 'default'})` : null)}
          {row('Murabot database', probe.bot?.database
            ? `${probe.bot.database} (${probe.bot?.databaseSource ?? 'default'})` : null)}
          {row('Murabot has stored', probe.bot?.raw ?? null)}
          {row('Murabot will render', probe.bot?.resolved ?? null)}
          {probe.bot && !probe.bot.assetPresent && (
            <div style={{ color: '#ff8a8a' }}>
              ⚠ Murabot is missing its copy of <code>{probe.bot.asset}</code>. Cards will fall back to a
              plain background.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
