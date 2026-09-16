'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useGuild } from '@/app/lib/guild-context';
import { useGuildConfig, loadGuildResources } from '@/app/lib/use-guild-config';
import { MODULES, type FieldDef } from '@/app/lib/discord-modules';
import { dashboardApi, type BotStatusResponse } from './lib/api';

interface Resource {
  id: string;
  name: string;
  type?: number;
}

export default function DashboardHome() {
  const { token, selected } = useGuild();
  const { config, saveState, error, save, update } = useGuildConfig();
  const [resources, setResources] = useState<{ channels?: Resource[]; roles?: Resource[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token || !selected) return;
    let alive = true;
    loadGuildResources(token, selected.id)
      .then((data) => { if (alive && data?.success) setResources(data); })
      .catch(() => { /* text-input fallback */ });
    return () => { alive = false; };
  }, [token, selected]);

  // Track which sections have unsaved edits (dirty tracking drives inline Save).
  const markDirty = (section: string, key: string, value: unknown) => {
    update(section, key, value);
    setDirty((prev) => new Set(prev).add(section));
  };

  const saveSection = async (section: string) => {
    const ok = await save();
    if (ok) {
      setDirty((prev) => {
        const next = new Set(prev);
        next.delete(section);
        return next;
      });
    }
  };

  const resourceOptions = (type: string): Resource[] => {
    if (!resources) return [];
    if (type === 'channel' || type === 'category') return (resources.channels || []);
    if (type === 'role') return (resources.roles || []);
    return [];
  };

  const sectionValue = (moduleDef: { id: string }, field: FieldDef): unknown => {
    const sectionKey = field.key.split('.')[0];
    const shortKey = field.key.includes('.') ? field.key.split('.').slice(1).join('.') : field.key;
    const section = (config as Record<string, Record<string, unknown>>)?.[sectionKey];
    return section?.[shortKey] ?? field.default ?? '';
  };

  const status = useBotStatus();
  const enabledCount = useMemo(
    () => MODULES.filter((m) => config?.modules?.[m.id] ?? true).length,
    [config],
  );

  if (!token) {
    return (
      <div className="cc-card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--cc-text-faint)' }}>Sign in with Discord to manage your server.</p>
      </div>
    );
  }
  if (!selected) {
    return (
      <div className="cc-card" style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--cc-text-faint)' }}>Select a server in the top bar to configure it.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Server header — Carl-style: big server identity + bot status chip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {selected.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.icon} alt="" width={52} height={52} style={{ borderRadius: 14 }} />
          ) : (
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: 'var(--cc-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 22, color: '#fff',
            }}>{selected.name.charAt(0)}</div>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff' }}>{selected.name}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
              {enabledCount}/{MODULES.length} modules enabled · changes save per section
            </p>
          </div>
        </div>
        {status && (
          <span className={`cc-status-pill ${status.status === 'ok' ? 'cc-status-online' : status.status === 'degraded' ? 'cc-status-degraded' : 'cc-status-offline'}`}>
            <span className="cc-dot" />
            Bot {status.status === 'ok' ? 'Online' : status.status === 'degraded' ? 'Degraded' : 'Offline'}
          </span>
        )}
      </div>

      {error && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Accordion modules — click to expand, inline Save inside each */}
      <div style={{ display: 'grid', gap: 10 }}>
        {MODULES.map((mod) => {
          const isOpen = open === mod.id;
          const enabled = config?.modules?.[mod.id] ?? true;
          const isDirty = dirty.has(mod.id);
          const configuredCount = mod.fields.filter((f) => {
            const v = sectionValue(mod, f);
            return v !== '' && v !== null && v !== undefined && v !== f.default;
          }).length;

          return (
            <div key={mod.id} className="cc-card" style={{ overflow: 'hidden' }}>
              <button
                onClick={() => setOpen(isOpen ? null : mod.id)}
                aria-expanded={isOpen}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 18px', background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20 }}>{mod.icon}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', color: '#fff', fontWeight: 700, fontSize: 14.5 }}>{mod.label}</span>
                  <span style={{ display: 'block', color: 'var(--cc-text-faint)', fontSize: 12 }}>
                    {mod.fields.length} settings{configuredCount > 0 ? ` · ${configuredCount} customized` : ''}
                  </span>
                </span>
                {isDirty && <span className="cc-chip cc-chip-warn">unsaved</span>}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${mod.label}`}
                  onClick={(e) => { e.stopPropagation(); markDirty('modules', mod.id, !enabled); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); markDirty('modules', mod.id, !enabled); } }}
                  style={{
                    width: 40, height: 22, borderRadius: 11, position: 'relative', cursor: 'pointer',
                    flexShrink: 0, background: enabled ? 'var(--cc-accent)' : 'rgba(255,255,255,0.14)',
                    border: 'none', transition: 'all .2s', display: 'inline-block',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: enabled ? 21 : 3, width: 16, height: 16,
                    borderRadius: 8, background: '#fff', transition: 'all .2s',
                  }} />
                </span>
                <ChevronDown size={16} color="var(--cc-text-dim)" style={{
                  transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0,
                }} />
              </button>

              {isOpen && enabled && (
                <div style={{ borderTop: '1px solid var(--cc-border)', padding: '16px 18px', display: 'grid', gap: 14 }}>
                  {mod.fields.map((f) => {
                    const value = sectionValue(mod, f);
                    const sectionKey = f.key.split('.')[0];
                    const shortKey = f.key.includes('.') ? f.key.split('.').slice(1).join('.') : f.key;
                    const options = resourceOptions(f.type);
                    return (
                      <div key={f.key}>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 5 }}>
                          {f.icon ? `${f.icon} ` : ''}{f.label}
                          {f.help && <span style={{ color: 'var(--cc-text-faint)', marginLeft: 6 }}>({f.help})</span>}
                        </label>
                        {f.type === 'toggle' ? (
                          <button
                            onClick={() => markDirty(sectionKey, shortKey, !value)}
                            aria-label={f.label}
                            style={{
                              width: 40, height: 22, borderRadius: 11, position: 'relative', cursor: 'pointer',
                              background: value ? 'var(--cc-accent)' : 'rgba(255,255,255,0.14)', border: 'none', transition: 'all .2s',
                            }}
                          >
                            <span style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'all .2s' }} />
                          </button>
                        ) : (f.type === 'channel' || f.type === 'category' || f.type === 'role') && options.length > 0 ? (
                          <select
                            value={String(value || '')}
                            onChange={(e) => markDirty(sectionKey, shortKey, e.target.value)}
                            className="cc-input"
                            style={{ width: '100%', appearance: 'none' }}
                          >
                            <option value="">— None selected —</option>
                            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        ) : f.type === 'select' ? (
                          <select
                            value={String(value || '')}
                            onChange={(e) => markDirty(sectionKey, shortKey, e.target.value)}
                            className="cc-input"
                            style={{ width: '100%', appearance: 'none' }}
                          >
                            {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : f.type === 'number' ? (
                          <input
                            type="number"
                            value={String(value ?? '')}
                            onChange={(e) => markDirty(sectionKey, shortKey, Number(e.target.value))}
                            placeholder={String(f.default ?? '')}
                            className="cc-input"
                            style={{ width: '100%' }}
                          />
                        ) : (
                          <input
                            value={String(value ?? '')}
                            onChange={(e) => markDirty(sectionKey, shortKey, e.target.value)}
                            placeholder={f.placeholder || String(f.default ?? '')}
                            className="cc-input"
                            style={{ width: '100%' }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Inline save row — per section, real state */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
                    <button
                      onClick={() => { void saveSection(mod.id); }}
                      disabled={saveState === 'saving' || !isDirty}
                      className="cc-btn cc-btn-primary"
                    >
                      {saveState === 'saving' ? 'Saving…'
                        : saveState === 'saved' && !isDirty ? '✓ Saved'
                        : saveState === 'error' ? '✕ Failed — retry'
                        : 'Save Changes'}
                    </button>
                    {!isDirty && saveState !== 'saving' && (
                      <span style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>No changes</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ color: 'var(--cc-text-faint)', fontSize: 12, marginTop: 16 }}>
        Saved per server (guildId + module) with a full before/after audit trail on the{' '}
        <Link href="/dashboard/audit" style={{ color: 'var(--cc-accent)' }}>Audit Log</Link>. The bot picks up changes within ~60 seconds.
      </p>
    </div>
  );
}

function useBotStatus(): BotStatusResponse | null {
  const [status, setStatus] = useState<BotStatusResponse | null>(null);
  useEffect(() => {
    let alive = true;
    dashboardApi.status().then((r) => { if (alive && r.ok) setStatus(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return status;
}
