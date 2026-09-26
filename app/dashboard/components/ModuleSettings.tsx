'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { useGuildConfig } from '@/app/lib/use-guild-config';
import { MODULES } from '@/app/lib/discord-modules';
import {
  DiscordChannelSelect,
  DiscordMemberSelect,
  DiscordPermissionStatus,
  DiscordRoleSelect,
  ResourceStatusBar,
  kindsForKey,
  useGuildResources,
  validateSelection,
  type ValidateCheck,
} from './selectors';

export default function ModuleSettings({ moduleId, title, description }: {
  moduleId: string;
  title?: string;
  description?: string;
}) {
  const { selected } = useGuild();
  const { config, loading, saveState, error, save, update } = useGuildConfig();
  const { resources, loading: resLoading, error: resError, code: resCode, retryable: resRetryable, refresh: resRefresh } = useGuildResources(selected?.id ?? null);
  // Per-field pre-save validation: { [fieldKey]: { checking, valid, checks, message } }
  const [validation, setValidation] = useState<Record<string, { checking: boolean; valid: boolean; checks: ValidateCheck[]; message: string }>>({});
  const [validateError, setValidateError] = useState('');

  const mod = useMemo(() => MODULES.find((m) => m.id === moduleId), [moduleId]);
  const resolvedTitle = title ?? mod?.label ?? 'Module';
  const resolvedDescription = description ?? `${mod?.label ?? 'Module'} settings for your server`;

  // Re-validate a resource field whenever its value (or the server data) changes.
  const runValidation = async (fieldKey: string, kind: 'channel' | 'category' | 'role' | 'member', id: string) => {
    if (!selected || !id) {
      setValidation((v) => {
        const next = { ...v };
        delete next[fieldKey];
        return next;
      });
      return;
    }
    setValidation((v) => ({ ...v, [fieldKey]: { checking: true, valid: false, checks: [], message: '' } }));
    const require = kind === 'channel' ? ['view', 'send'] : [];
    const result = await validateSelection(selected.id, kind, id, require);
    setValidation((v) => ({ ...v, [fieldKey]: { checking: false, ...result } }));
  };

  useEffect(() => {
    if (!selected || !resources) return;
    // Re-run validation when the server data refreshes (rename/delete safety).
    for (const f of mod?.fields ?? []) {
      if (f.type !== 'channel' && f.type !== 'category' && f.type !== 'role' && f.type !== 'member') continue;
      const short = f.key.startsWith(`${moduleId}.`) ? f.key.slice(moduleId.length + 1) : f.key;
      const val = String((config as Record<string, Record<string, unknown>>)?.[moduleId]?.[short] ?? '');
      if (val) void runValidation(f.key, f.type, val);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, selected?.id]);

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

  const setField = (key: string, value: unknown, kind?: 'channel' | 'category' | 'role' | 'member') => {
    const short = key.startsWith(`${moduleId}.`) ? key.slice(moduleId.length + 1) : key;
    update(moduleId, short, value);
    setValidateError('');
    if (kind && typeof value === 'string') void runValidation(key, kind, value);
  };

  // Roles that grant power need hierarchy enforcement (bot must manage them).
  const roleNeedsHierarchy = (key: string) =>
    /mod|admin|support|manager|staff|dj|verified|auto|reward/i.test(key);

  // Save only after every selected channel/role/member re-validates live:
  // existence + bot permissions are checked, never trusted from the UI.
  const saveWithValidation = async () => {
    setValidateError('');
    const checks: Array<{ key: string; kind: 'channel' | 'category' | 'role' | 'member'; id: string }> = [];
    for (const f of mod?.fields ?? []) {
      if (f.type !== 'channel' && f.type !== 'category' && f.type !== 'role' && f.type !== 'member') continue;
      const short = f.key.startsWith(`${moduleId}.`) ? f.key.slice(moduleId.length + 1) : f.key;
      const id = String(section?.[short] ?? '');
      if (id) checks.push({ key: f.key, kind: f.type, id });
    }
    if (selected && checks.length > 0) {
      const results = await Promise.all(
        checks.map(async (c) => ({
          key: c.key,
          result: await validateSelection(
            selected.id, c.kind, c.id, c.kind === 'channel' ? ['view', 'send'] : [],
          ),
        })),
      );
      setValidation((v) => {
        const next = { ...v };
        for (const r of results) next[r.key] = { checking: false, ...r.result };
        return next;
      });
      const failed = results.filter((r) => !r.result.valid);
      if (failed.length > 0) {
        setValidateError(
          `Not saved — ${failed.length} setting${failed.length === 1 ? '' : 's'} failed validation. ` +
          'Fix the failed checks above (usually bot permissions or a deleted channel/role), then save again.',
        );
        return;
      }
    }
    void save();
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
          <ResourceStatusBar loading={resLoading} error={resError} code={resCode} retryable={resRetryable} onRefresh={resRefresh} />
          {(mod?.fields || []).map((f) => {
            const value = fieldValue(f.key);
            const val = validation[f.key];
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
                ) : f.type === 'channel' || f.type === 'category' ? (
                  <>
                    <DiscordChannelSelect
                      channels={resources?.channels ?? []}
                      value={String(value || '')}
                      onChange={(id) => setField(f.key, id, f.type === 'category' ? 'category' : 'channel')}
                      kinds={kindsForKey(f.key)}
                      loading={resLoading}
                      disabled={resLoading || (!resError && (resources?.channels.length ?? 0) === 0 && !value)}
                    />
                    {val && (
                      <DiscordPermissionStatus checks={val.checks} message={val.message} valid={val.valid} checking={val.checking} />
                    )}
                  </>
                ) : f.type === 'role' ? (
                  <>
                    <DiscordRoleSelect
                      roles={resources?.roles ?? []}
                      value={String(value || '')}
                      onChange={(id) => setField(f.key, id, 'role')}
                      loading={resLoading}
                      disabled={resLoading}
                      botTopRolePosition={resources?.bot?.topRolePosition ?? null}
                      botIsAdmin={Boolean(
                        resources?.bot?.guildPermissions &&
                        (BigInt(resources.bot.guildPermissions) & BigInt(8)) !== BigInt(0),
                      )}
                      requireManageable={roleNeedsHierarchy(f.key)}
                    />
                    {val && (
                      <DiscordPermissionStatus checks={val.checks} message={val.message} valid={val.valid} checking={val.checking} />
                    )}
                  </>
                ) : f.type === 'member' ? (
                  <>
                    <DiscordMemberSelect
                      members={resources?.members ?? []}
                      value={String(value || '')}
                      onChange={(id) => setField(f.key, id, 'member')}
                      loading={resLoading}
                      disabled={resLoading}
                    />
                    {val && (
                      <DiscordPermissionStatus checks={val.checks} message={val.message} valid={val.valid} checking={val.checking} />
                    )}
                  </>
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
          onClick={() => { void saveWithValidation(); }}
          disabled={saveState === 'saving'}
          className="cc-btn cc-btn-primary"
        >
          {saveLabel}
        </button>
        {(error || validateError) && (
          <span style={{ color: '#ff6b6b', fontSize: 13 }}>{validateError || error}</span>
        )}
      </div>

      <p style={{ color: 'var(--cc-text-faint)', fontSize: 12, marginTop: 14 }}>
        Saved for <strong style={{ color: 'var(--cc-text-dim)' }}>{selected.name}</strong> — every channel,
        role and member above is re-verified with the bot before saving. The bot picks up changes within ~60 seconds.
      </p>
    </div>
  );
}
