'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useGuild } from '@/app/lib/guild-context';
import { useGuildConfig } from '@/app/lib/use-guild-config';
import { MODULES, MODULE_ROUTES } from '@/app/lib/discord-modules';

export default function ModulesPage() {
  const { token, selected } = useGuild();
  const { config, loading, saveState, error, save, update } = useGuildConfig();
  const [search, setSearch] = useState('');

  const filteredModules = useMemo(() =>
    MODULES.filter((m) =>
      !search ||
      m.label.toLowerCase().includes(search.toLowerCase()) ||
      m.fields.some((f) => f.label.toLowerCase().includes(search.toLowerCase()))
    ), [search]);

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to manage modules.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar to manage its modules.</p>;
  }

  const enabledOf = (id: string) => config?.modules?.[id] ?? true;
  const dirty = saveState === 'saving' || saveState === 'saved' || saveState === 'error';

  return (
    <div>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 6px', fontSize: 26, fontWeight: 800, color: '#fff' }}>⚙️ Module Setup — {selected.name}</h1>
      <p style={{ margin: '0 0 20px', color: 'var(--cc-text-faint)', fontSize: 13.5 }}>
        Enable or disable bot modules and open their full configuration.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search modules…"
        className="cc-input"
        style={{ width: '100%', marginBottom: 16 }}
      />

      {loading && <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading configuration…</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {filteredModules.map((mod) => {
          const isEnabled = enabledOf(mod.id);
          const route = MODULE_ROUTES[mod.id];
          return (
            <div key={mod.id} className="cc-card" style={{
              padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
              opacity: isEnabled ? 1 : 0.55,
            }}>
              <span style={{ fontSize: 22 }}>{mod.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 14.5 }}>{mod.label}</div>
                <div style={{ color: 'var(--cc-text-faint)', fontSize: 12.5 }}>
                  {mod.fields.length} settings
                </div>
              </div>
              <button
                onClick={() => update('modules', mod.id, !isEnabled)}
                aria-label={`Toggle ${mod.label}`}
                style={{
                  width: 46, height: 26, borderRadius: 13, position: 'relative', cursor: 'pointer', flexShrink: 0,
                  background: isEnabled ? 'var(--cc-accent)' : 'rgba(255,255,255,0.14)', border: 'none', transition: 'all .2s',
                }}
              >
                <span style={{ position: 'absolute', top: 3, left: isEnabled ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'all .2s' }} />
              </button>
              {route && (
                <Link href={route} className="cc-btn cc-btn-ghost" style={{ flexShrink: 0, fontSize: 12.5 }}>
                  Configure
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <button
          onClick={() => { void save(); }}
          disabled={saveState === 'saving'}
          className="cc-btn cc-btn-primary"
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? '✕ Save failed — retry' : 'Save Changes'}
        </button>
        {error && dirty && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</span>}
      </div>

      <p style={{ color: 'var(--cc-text-faint)', fontSize: 12, marginTop: 14 }}>
        Saved per server. The bot picks up module changes within ~60 seconds.
      </p>
    </div>
  );
}
