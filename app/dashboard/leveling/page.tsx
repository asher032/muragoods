'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { useGuildConfig } from '@/app/lib/use-guild-config';
import { apiFetch } from '../lib/api';
import { statusMessage } from '../components/selectors';
import ModuleSettings from '../components/ModuleSettings';
import LevelBackgroundSelector from '../components/LevelBackgroundSelector';
import ServerCardPreview from '../components/ServerCardPreview';
import LevelBackgroundLink from '../components/LevelBackgroundLink';
import { resolveServerCardBackground } from '@/app/lib/server-card-backgrounds';

interface LevelingOverview {
  users: number;
  top: Array<{ userId: string; displayName?: string; xp: number; level: number }>;
}

export default function LevelingPage() {
  const { token, selected } = useGuild();
  const { config, saveState, error: configError, save, update } = useGuildConfig();
  const [overview, setOverview] = useState<LevelingOverview | null>(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  // Key on the guild ID STRING: the guild context refreshes its selection
  // object on live-detection polls, and depending on the object re-fired this
  // effect (and the overview fetch) on every poll for every mounted page.
  const guildId = selected?.id ?? null;
  const load = useCallback(async () => {
    if (!token || !guildId) return;
    const id = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    setCode('');
    const resp = await apiFetch<{ success: boolean; overview?: LevelingOverview; error?: string; code?: string }>(
      `/api/dashboard/leveling/overview?guildId=${guildId}`, { token, signal: controller.signal });
    if (id !== requestId.current) return;
    if (resp.ok && resp.data.success && resp.data.overview) {
      setOverview(resp.data.overview);
    } else {
      setOverview(null);
      setError(resp.ok ? resp.data.error || 'Could not load leveling' : resp.error);
      setCode(resp.ok ? resp.data.code || '' : (resp as { code?: string }).code || '');
    }
    setLoading(false);
  }, [token, guildId]);

  useEffect(() => {
    setOverview(null);
    setError('');
    setCode('');
    void load();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
    };
  }, [guildId, load]);

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to view leveling.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar.</p>;
  }

  const mapped = error ? statusMessage(code, error) : null;

  // Read the canonical field first, then the legacy alias. Both are written
  // with the same value, but preferring the canonical name here keeps the page
  // showing exactly what the bot's renderer will resolve.
  const storedBackground = (
    (config as Record<string, Record<string, unknown>>)?.leveling?.server_card_background
    ?? (config as Record<string, Record<string, unknown>>)?.leveling?.serverBackground
  );
  const selectedTheme = resolveServerCardBackground(storedBackground as string | undefined);

  return (
    <div style={{ maxWidth: 960 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>📈 Leveling — {selected.name}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        XP formula: next level needs <code>5n² + 50n + 100</code> XP. Same store as Discord — never a parallel history.
      </p>

      <div className="cc-section-label" style={{ marginBottom: 10 }}>Overview</div>
      {mapped && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 12 }}>
          <strong>⚠️ {mapped.title}</strong>
          <div style={{ marginTop: 4 }}>{mapped.hint}</div>
          <button className="cc-btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {loading && !overview && (
        <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading leveling…</p>
      )}
      {!loading && !overview && !mapped && (
        <div className="cc-card" style={{ padding: 24, textAlign: 'center', marginBottom: 22 }}>
          <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>No leveling data yet — XP will appear once members chat.</p>
          <button className="cc-btn" style={{ marginTop: 10, fontSize: 12 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {overview && (
        <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 22 }}>
          <div style={{ fontSize: 13, color: 'var(--cc-text-dim)', marginBottom: 8 }}>
            📊 <strong style={{ color: '#fff' }}>{overview.users}</strong> members earning XP
          </div>
          {overview.top.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>No XP yet — start chatting.</p>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {overview.top.map((t, i) => (
                <div key={t.userId} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                  <strong style={{ color: '#fff' }}>#{i + 1}</strong> <strong style={{ color: '#fff' }}>{t.displayName || 'Unknown User'}</strong>
                  {' '}— Level <strong style={{ color: '#fff' }}>{t.level}</strong> · {t.xp.toLocaleString()} XP
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Level Background</div>
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 6 }}>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
          Pick one of the imported pictures — it renders behind every level card on this server.
        </p>
        <LevelBackgroundSelector
          value={selectedTheme}
          onChange={(id) => update('leveling', 'server_card_background', id)}
        />
        <ServerCardPreview
          themeId={selectedTheme}
          accent={(config as Record<string, Record<string, unknown>>)?.leveling?.cardColor}
        />
        {/* Which side of the chain is broken — the dashboard's record or
            Murabot's. Without this, "saved but the card did not change" has no
            way to tell a UI bug from a database mismatch from a renderer bug. */}
        <LevelBackgroundLink
          guildId={selected.id}
          selectedTheme={selectedTheme}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <button
            onClick={() => { void save(); }}
            disabled={saveState === 'saving'}
            className="cc-btn cc-btn-primary"
          >
            {saveState === 'saving' ? 'Saving…'
              : saveState === 'saved' ? '✓ Saved successfully'
              : saveState === 'error' ? '✕ Save failed'
              : 'Save Background'}
          </button>
          {configError && (
            <span style={{ color: '#ff6b6b', fontSize: 13 }}>{configError}</span>
          )}
        </div>
      </div>

      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Configuration</div>
      <ModuleSettings
        moduleId="leveling"
        title="📈 Leveling"
        description="XP rates, level-up channel and rewards"
      />
    </div>
  );
}
