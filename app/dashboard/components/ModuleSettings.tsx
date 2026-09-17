'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { useGuildConfig, loadGuildResources } from '@/app/lib/use-guild-config';
import { MODULES } from '@/app/lib/discord-modules';

interface Resource {
  id: string;
  name: string;
  type?: number;
}

const SAVE_RESET_MS = 2500;

export default function ModuleSettings({ moduleId, title, description }: {
  moduleId: string;
  title?: string;
  description?: string;
}) {
  const { token, selected } = useGuild();
  const { config, loading, saveState, error, save, update } = useGuildConfig();
  const [resources, setResources] = useState<{ channels?: Resource[]; roles?: Resource[] } | null>(null);

  const mod = useMemo(() => MODULES.find((m) => m.id === moduleId), [moduleId]);
  const resolvedTitle = title ?? mod?.label ?? 'Module';
  const resolvedDescription = description ?? `${mod?.label ?? 'Module'} settings for your server`;

  useEffect(() => {
    if (!token || !selected) return;
    let alive = true;
    loadGuildResources(token, selected.id)
      .then((data) => { if (alive && data?.success) setResources(data); })
      .catch(() => { /* selectors fall back to text inputs */ });
    return () => { alive = false; };
  }, [token, selected]);

  if (!selected) {
    return (
      <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>
        Select a server in the top bar to configure {resolvedTitle}.
      </p>
    );
  }

  const section = (config as Record<string, Record<string, unknown>>)?.[moduleId];
  const enabled = config?.modules?.[moduleId] ?? true;

  const fieldValue = (key: string) => {
    const short = key.startsWith(`${moduleId}.`) ? key.slice(moduleId.length + 1) : key;
    return section?.[short] ?? mod?.fields.find((f) => f.key === key)?.default ?? '';
  };

  const setField = (key: string, value: unknown) => {
    const short = key.startsWith(`${moduleId}.`) ? key.slice(moduleId.length + 1) : key;
    update(moduleId, short, value);
  };

  const resourceOptions = (type: string): Resource[] => {
    if (!resources) return [];
    if (type === 'channel') return (resources.channels || []).filter((c) => c.type !== 4);
    if (type === 'category') return (resources.channels || []).filter((c) => c.type === 4);
    if (type === 'role') return resources.roles || [];
    return [];
  };

  const saveLabel = saveState === 'saving' ? 'Saving…'
    : saveState === 'saved' ? '✓ Saved successfully'
    : saveState === 'error' ? '✕ Save failed'
    : 'Save Changes';

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 6px', fontSize: 26, fontWeight: 800, color: '#fff' }}>{resolvedTitle}</h1>
      <p style={{ margin: '0 0 22px', color: 'var(--cc-text-faint)', fontSize: 13.5 }}>{resolvedDescription} — server: <strong style={{ color: 'var(--cc-text-dim)' }}>{selected.name}</strong></p>

      {loading && <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>Loading configuration…</p>}

      {/* Module enabled toggle */}
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Module enabled</div>
          <div style={{ color: 'var(--cc-text-faint)', fontSize: 12.5 }}>Turns all {resolvedTitle} commands on or off for this server.</div>
        </div>
        <button
          onClick={() => update('modules', moduleId, !enabled)}
          aria-label={`Toggle ${title}`}
          style={{
            width: 46, height: 26, borderRadius: 13, position: 'relative', cursor: 'pointer',
            background: enabled ? 'var(--cc-accent)' : 'rgba(255,255,255,0.14)', border: 'none', transition: 'all .2s',
          }}
        >
          <span style={{ position: 'absolute', top: 3, left: enabled ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'all .2s' }} />
        </button>
      </div>

      {enabled && (
        <div className="cc-card" style={{ padding: '18px 20px', display: 'grid', gap: 16 }}>
          {(mod?.fields || []).map((f) => {
            const value = fieldValue(f.key);
            const options = resourceOptions(f.type);
            return (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
                  {f.icon ? `${f.icon} ` : ''}{f.label}
                  {f.help && <span style={{ color: 'var(--cc-text-faint)', marginLeft: 6 }}>({f.help})</span>}
                </label>
                {f.type === 'toggle' ? (
                  <button
                    onClick={() => setField(f.key, !value)}
                    aria-label={f.label}
                    style={{
                      width: 46, height: 26, borderRadius: 13, position: 'relative', cursor: 'pointer',
                      background: value ? 'var(--cc-accent)' : 'rgba(255,255,255,0.14)', border: 'none', transition: 'all .2s',
                    }}
                  >
                    <span style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'all .2s' }} />
                  </button>
                ) : (f.type === 'channel' || f.type === 'category' || f.type === 'role') && options.length > 0 ? (
                  <select
                    value={String(value || '')}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="cc-input"
                    style={{ width: '100%', appearance: 'none' }}
                  >
                    <option value="">— None selected —</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                ) : f.type === 'select' ? (
                  <select
                    value={String(value || '')}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="cc-input"
                    style={{ width: '100%', appearance: 'none' }}
                  >
                    {(f.options || []).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : f.type === 'number' ? (
                  <input
                    type="number"
                    value={String(value ?? '')}
                    onChange={(e) => setField(f.key, Number(e.target.value))}
                    placeholder={String(f.default ?? '')}
                    className="cc-input"
                    style={{ width: '100%' }}
                  />
                ) : (
                  <input
                    value={String(value ?? '')}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.placeholder || String(f.default ?? '')}
                    className="cc-input"
                    style={{ width: '100%' }}
                  />
                )}
              </div>
            );
          })}
          {!mod && <p style={{ color: 'var(--cc-text-faint)', fontSize: 13 }}>No settings registered for this module.</p>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <button
          onClick={() => { void save(); }}
          disabled={saveState === 'saving'}
          className="cc-btn cc-btn-primary"
        >
          {saveLabel}
        </button>
        {error && <span style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</span>}
      </div>

      <p style={{ color: 'var(--cc-text-faint)', fontSize: 12, marginTop: 14 }}>
        Saved per server (guildId + module). The bot picks up changes within ~60 seconds.
      </p>
    </div>
  );
}
