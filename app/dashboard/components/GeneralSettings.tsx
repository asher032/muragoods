'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bot, Check, ExternalLink, Hash, RefreshCw, Save, Server, ShieldAlert, Sparkles,
} from 'lucide-react';
import { useGuild } from '@/app/lib/guild-context';
import {
  DEFAULT_LANGUAGE,
  GENERAL_FIELD_LABELS,
  MESSAGE_MAX_LENGTH,
  MESSAGE_PLACEHOLDERS,
  defaultMessagePreview,
  type GeneralFieldError,
  type GeneralSettings,
  type LanguageOption,
} from '@/app/lib/general-settings';

// ── Server Profile + Bot Settings ────────────────────────────────────────
//
// Two panels, deliberately kept apart, because they have two different owners:
//
//   Server Profile   Discord owns this. Name, icon, member/channel/role counts
//                    and the bot's install state are READ from Discord on every
//                    load and are not editable here. Editing them in a Murabot
//                    dashboard would be Murabot inventing facts it does not own.
//
//   Bot Settings     Murabot owns this. Language and the welcome/leave notices
//                    are stored canonically and pushed to the bot, and the
//                    panel distinguishes "saved and read back by Murabot" from
//                    "stored, not confirmed yet" instead of showing one green
//                    tick for both.
//
// Every state is real: loading, empty (no channels the bot can post in), error
// (with the server's own code and message), saving, and saved.

interface SettingsPayload {
  success: boolean;
  settings?: GeneralSettings;
  discord?: { id: string; name: string; icon: string | null; owner: boolean };
  bot?: { installed: boolean | null; online: boolean; readBack: Record<string, unknown> | null; readBackReason: string | null };
  languages?: LanguageOption[];
  defaultPrefix?: string;
  limits?: { message: number };
  error?: string;
  code?: string;
}

interface DiscChannel { id: string; name: string; type: number; parentId: string | null; parentName: string | null }
interface ResourcesPayload {
  success: boolean;
  guild?: { id: string; name: string; memberCount: number | null } | null;
  channels?: DiscChannel[];
  roles?: unknown[];
  error?: string;
  code?: string;
}

type LoadState = 'loading' | 'ready' | 'error';

function Card({ title, subtitle, icon, children, aside }: {
  title: string; subtitle?: string; icon: React.ReactNode;
  children: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <section className="cc-card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <span style={{ color: 'var(--cc-accent)', display: 'grid', placeItems: 'center', marginTop: 1 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="cc-card-title">{title}</h2>
          {subtitle && (
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>{subtitle}</p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--cc-border)' }}>
      <span style={{ fontSize: 12, color: 'var(--cc-text-faint)', minWidth: 140 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        {children}
      </span>
    </div>
  );
}

export default function GeneralSettingsPanel() {
  const { authenticated, authChecked, selected, guilds, setSelected, serversLoading } = useGuild();

  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<{ code: string; message: string; retryable: boolean } | null>(null);
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [resources, setResources] = useState<ResourcesPayload | null>(null);

  const [form, setForm] = useState({
    language: DEFAULT_LANGUAGE,
    welcomeChannelId: '',
    welcomeMessage: '',
    leaveChannelId: '',
    leaveMessage: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<GeneralFieldError[]>([]);

  const languages = payload?.languages ?? [];
  const messageLimit = payload?.limits?.message ?? MESSAGE_MAX_LENGTH;

  const load = useCallback(async () => {
    if (!selected) return;
    setState('loading');
    setError(null);
    setSaveMessage(null);
    setFieldErrors([]);
    const guildId = selected.id;
    try {
      const [settingsRes, resourcesRes] = await Promise.all([
        fetch(`/api/dashboard/settings?guildId=${encodeURIComponent(guildId)}`, { cache: 'no-store' }),
        // Discord-owned facts come from Discord, through the existing resource
        // reader — not from a copy Murabot keeps.
        fetch(`/api/dashboard/resources?guildId=${encodeURIComponent(guildId)}`, { cache: 'no-store' }),
      ]);
      const settings = (await settingsRes.json().catch(() => null)) as SettingsPayload | null;
      const res = (await resourcesRes.json().catch(() => null)) as ResourcesPayload | null;
      if (!settingsRes.ok || !settings?.success || !settings.settings) {
        setError({
          code: settings?.code ?? 'LOAD_FAILED',
          message: settings?.error ?? `Settings could not be loaded (HTTP ${settingsRes.status}).`,
          retryable: true,
        });
        setState('error');
        return;
      }
      setPayload(settings);
      setResources(res);
      setForm({
        language: settings.settings.language,
        welcomeChannelId: settings.settings.welcomeChannelId,
        welcomeMessage: settings.settings.welcomeMessage,
        leaveChannelId: settings.settings.leaveChannelId,
        leaveMessage: settings.settings.leaveMessage,
      });
      setState('ready');
    } catch {
      setError({
        code: 'NETWORK',
        message: 'Could not reach the dashboard — check your connection and retry. Nothing was changed.',
        retryable: true,
      });
      setState('error');
    }
  }, [selected]);

  useEffect(() => { void load(); }, [load]);

  const channels = useMemo(
    () => (resources?.channels ?? []).filter((c) => c.type === 0 || c.type === 5),
    [resources],
  );

  const dirty = Boolean(payload?.settings) && (
    payload!.settings!.language !== form.language
    || payload!.settings!.welcomeChannelId !== form.welcomeChannelId
    || payload!.settings!.welcomeMessage !== form.welcomeMessage
    || payload!.settings!.leaveChannelId !== form.leaveChannelId
    || payload!.settings!.leaveMessage !== form.leaveMessage
  );

  async function save() {
    if (!selected) return;
    setSaving(true);
    setSaveMessage(null);
    setFieldErrors([]);
    try {
      const resp = await fetch('/api/dashboard/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selected.id, settings: { ...form, prefix: payload?.settings?.prefix } }),
      });
      const data = (await resp.json().catch(() => null)) as
        (SettingsPayload & {
          saved?: boolean; propagation?: 'applied' | 'pending';
          appliedInDiscord?: boolean; message?: string;
          errors?: GeneralFieldError[];
        }) | null;

      if (!resp.ok || !data?.success) {
        if (Array.isArray(data?.errors) && data.errors.length > 0) {
          setFieldErrors(data.errors);
          setSaveMessage({ kind: 'err', text: data.message ?? 'Nothing was saved.' });
        } else {
          setSaveMessage({ kind: 'err', text: data?.error ?? data?.message ?? `Save failed (HTTP ${resp.status}). Nothing was changed.` });
        }
        // A refused save leaves the stored settings untouched; re-read so the
        // panel never shows a value the server did not accept.
        if (resp.status === 401 || resp.status === 403) void load();
        return;
      }

      if (data.settings) {
        setPayload((p) => (p ? { ...p, settings: data.settings! } : p));
        setForm({
          language: data.settings.language,
          welcomeChannelId: data.settings.welcomeChannelId,
          welcomeMessage: data.settings.welcomeMessage,
          leaveChannelId: data.settings.leaveChannelId,
          leaveMessage: data.settings.leaveMessage,
        });
      }
      if (data.saved === false) {
        setSaveMessage({ kind: 'ok', text: data.message ?? 'Nothing to save.' });
      } else if (data.propagation === 'applied') {
        setSaveMessage({ kind: 'ok', text: '✓ Saved — Murabot read the new settings back, so they are live.' });
      } else {
        setSaveMessage({
          kind: 'warn',
          text: `⚠ ${data.message ?? 'Saved, but Murabot has not confirmed yet. It is not applied in Discord until it does — it is picked up automatically within about a minute.'}`,
        });
      }
    } catch {
      setSaveMessage({
        kind: 'err',
        text: 'The save request did not complete. We cannot confirm whether anything changed — retry, then check the values shown here.',
      });
    } finally {
      setSaving(false);
    }
  }

  if (!authChecked) return <p style={{ fontSize: 13, color: 'var(--cc-text-dim)' }}>Checking your session…</p>;
  if (!authenticated) return null; // the dashboard shell owns the sign-in gate

  // ── Server Profile ──────────────────────────────────────────────────────
  const profile = (
    <Card
      icon={<Server size={15} />}
      title="Server Profile"
      subtitle="Read from Discord on every load. Murabot does not own these values, so it does not edit them — change them in Discord."
      aside={selected ? (
        <button className="cc-btn" onClick={() => void load()} disabled={state === 'loading'} style={{ fontSize: 12.5 }}>
          <RefreshCw size={13} /> {state === 'loading' ? 'Refreshing…' : 'Refresh'}
        </button>
      ) : undefined}
    >
      {!selected ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cc-text-dim)' }}>
          No server selected. Choose one to see its profile.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            {selected.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.icon} alt="" width={48} height={48} style={{ borderRadius: 12 }} />
            ) : (
              <span style={{
                width: 48, height: 48, borderRadius: 12, background: 'var(--cc-accent-soft)',
                display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700,
              }}>
                {selected.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {resources?.guild?.name || selected.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>
                {payload?.discord?.owner || selected.owner ? 'You own this server' : 'You manage this server'}
              </div>
            </div>
          </div>

          <Fact label="Server ID"><code style={{ fontSize: 12.5 }}>{selected.id}</code></Fact>
          <Fact label="Members">
            {resources?.guild?.memberCount ?? selected.memberCount ?? (
              <span style={{ color: 'var(--cc-text-faint)' }}>Unknown — Discord did not report a count</span>
            )}
          </Fact>
          <Fact label="Channels">
            {typeof selected.channelCount === 'number' ? selected.channelCount : (
              <span style={{ color: 'var(--cc-text-faint)' }}>Unknown</span>
            )}
          </Fact>
          <Fact label="Roles">
            {typeof selected.roleCount === 'number' ? selected.roleCount : (
              <span style={{ color: 'var(--cc-text-faint)' }}>Unknown</span>
            )}
          </Fact>
          <Fact label="Murabot">
            {selected.botInstalled === true && (
              <span className={`cc-status-pill ${selected.botConnection === 'online' ? 'cc-status-online' : 'cc-status-degraded'}`}>
                <span className="cc-dot" /> Installed{selected.botConnection === 'online' ? ' · online' : ' · gateway not reporting'}
              </span>
            )}
            {selected.botInstalled === false && (
              <span className="cc-status-pill cc-status-offline"><span className="cc-dot" /> Not installed</span>
            )}
            {selected.botInstalled == null && (
              <span className="cc-status-pill"><span className="cc-dot" /> Unknown — could not be verified</span>
            )}
            {selected.botInstalled === false && selected.inviteUrl && (
              <a href={selected.inviteUrl} target="_blank" rel="noreferrer" className="cc-btn cc-btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>
                <ExternalLink size={12} /> Invite Murabot
              </a>
            )}
          </Fact>

          {guilds.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <div className="cc-section-label" style={{ marginBottom: 6 }}>Switch server</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {guilds.filter((g) => g.id !== selected.id).map((g) => (
                  <button key={g.id} className="cc-btn" style={{ fontSize: 12.5, padding: '7px 11px' }} onClick={() => setSelected(g)}>
                    {g.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.icon} alt="" width={18} height={18} style={{ borderRadius: 5 }} />
                    ) : null}
                    {g.name}
                  </button>
                ))}
              </div>
              {serversLoading && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>Refreshing server list…</p>}
            </div>
          )}
        </>
      )}
    </Card>
  );

  // ── Bot Settings ────────────────────────────────────────────────────────
  const botCard = (
    <Card
      icon={<Sparkles size={15} />}
      title="Bot Settings"
      subtitle={`Murabot settings for ${selected?.name ?? 'this server'}. Stored per server — nothing here affects any other server.`}
    >
      {state === 'loading' && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cc-text-faint)' }}>Loading this server&apos;s settings…</p>
      )}

      {state === 'error' && error && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ fontSize: 12.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <AlertTriangle size={14} /> Could not load settings ({error.code})
          </div>
          <p style={{ margin: '6px 0 0' }}>{error.message}</p>
          <button className="cc-btn" style={{ marginTop: 10, fontSize: 12.5 }} onClick={() => void load()}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {state === 'ready' && payload?.bot?.installed === false && (
        <div className="cc-alert cc-alert-warning" style={{ fontSize: 12.5, marginBottom: 12 }}>
          <strong>Murabot is not installed on this server.</strong>{' '}
          You can still choose settings — they are stored and will apply once the bot joins. Channel
          settings cannot be verified until it does.
        </div>
      )}

      {state === 'ready' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {/* Language */}
          <div>
            <label className="cc-label" htmlFor="gs-language">Language</label>
            <select
              id="gs-language"
              className="cc-select"
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              style={{ maxWidth: 260 }}
            >
              {(languages.length ? languages : [{ code: DEFAULT_LANGUAGE, label: 'English' }]).map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
              The language Murabot speaks in its own messages. Messages you write are always sent exactly as written.
            </p>
          </div>

          {!channels.length && (
            <div className="cc-alert cc-alert-warning" style={{ fontSize: 12.5 }}>
              <Hash size={13} /> No text channels are available for the welcome or leave notice
              {resources?.error ? ` — ${resources.error}` : '. Murabot may not be installed, or it cannot see any text channel yet.'}
            </div>
          )}

          {/* Welcome + leave */}
          {(['welcome', 'leave'] as const).map((kind) => {
            const channelKey = kind === 'welcome' ? 'welcomeChannelId' : 'leaveChannelId';
            const messageKey = kind === 'welcome' ? 'welcomeMessage' : 'leaveMessage';
            const channelValue = form[channelKey as 'welcomeChannelId' | 'leaveChannelId'];
            const messageValue = form[messageKey as 'welcomeMessage' | 'leaveMessage'];
            return (
              <div key={kind} style={{ borderTop: '1px solid var(--cc-border)', paddingTop: 12 }}>
                <div className="cc-section-label" style={{ marginBottom: 8 }}>
                  {kind === 'welcome' ? 'Welcome notice' : 'Leave notice'}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 220px', minWidth: 200 }}>
                    <label className="cc-label" htmlFor={`gs-${kind}-channel`}>{GENERAL_FIELD_LABELS[channelKey as 'welcomeChannelId']}</label>
                    <select
                      id={`gs-${kind}-channel`}
                      className="cc-select"
                      value={channelValue}
                      onChange={(e) => setForm((f) => ({ ...f, [channelKey]: e.target.value }))}
                      disabled={channels.length === 0}
                    >
                      <option value="">Off — do not post this notice</option>
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parentName ? `${c.parentName} / #${c.name}` : `#${c.name}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label className="cc-label" htmlFor={`gs-${kind}-message`}>{GENERAL_FIELD_LABELS[messageKey as 'welcomeMessage']}</label>
                  <textarea
                    id={`gs-${kind}-message`}
                    className="cc-input"
                    rows={2}
                    maxLength={messageLimit + 200}
                    value={messageValue}
                    placeholder={defaultMessagePreview(form.language, kind)}
                    onChange={(e) => setForm((f) => ({ ...f, [messageKey]: e.target.value }))}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-sans)' }}
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                    Leave empty to use Murabot&apos;s default in {languages.find((l) => l.code === form.language)?.label ?? form.language}:{' '}
                    <em>{defaultMessagePreview(form.language, kind)}</em>
                    {' '}({messageValue.length}/{messageLimit} characters)
                  </p>
                </div>
              </div>
            );
          })}

          <div>
            <div className="cc-section-label" style={{ marginBottom: 6 }}>Available placeholders</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {MESSAGE_PLACEHOLDERS.map((p) => (
                <span key={p.token} className="cc-chip" title={p.describe} style={{ fontSize: 11 }}>
                  <code>{p.token}</code> {p.describe}
                </span>
              ))}
            </div>
          </div>

          {fieldErrors.length > 0 && (
            <div className="cc-alert cc-alert-error" role="alert" style={{ fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} /> Nothing was saved
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {fieldErrors.map((e) => (
                  <li key={`${e.field}-${e.code}`}><strong>{e.label}:</strong> {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {saveMessage && (
            <div
              className={saveMessage.kind === 'ok' ? 'cc-alert cc-alert-success'
                : saveMessage.kind === 'warn' ? 'cc-alert cc-alert-warning' : 'cc-alert cc-alert-error'}
              role={saveMessage.kind === 'ok' ? 'status' : 'alert'}
              style={{ fontSize: 12.5 }}
            >
              {saveMessage.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="cc-btn cc-btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save settings'}
            </button>
            <button
              className="cc-btn"
              disabled={saving || !dirty || !payload?.settings}
              onClick={() => {
                if (!payload?.settings) return;
                setForm({
                  language: payload.settings.language,
                  welcomeChannelId: payload.settings.welcomeChannelId,
                  welcomeMessage: payload.settings.welcomeMessage,
                  leaveChannelId: payload.settings.leaveChannelId,
                  leaveMessage: payload.settings.leaveMessage,
                });
                setFieldErrors([]);
                setSaveMessage(null);
              }}
            >
              Discard changes
            </button>
            {!dirty && <span style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>No unsaved changes</span>}
          </div>

          {/* Real bot state, never an assumption. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
            <Bot size={13} />
            {payload?.bot?.installed === true && payload?.bot?.online
              ? 'Murabot answered and read these settings back.'
              : payload?.bot?.installed === true
                ? `Murabot is installed but did not answer${payload?.bot?.readBackReason ? ` (${payload.bot.readBackReason})` : ''} — saved values are stored and will apply on its next read.`
                : payload?.bot?.installed === false
                  ? 'Murabot is not installed on this server.'
                  : 'Murabot installation status could not be verified.'}
            {payload?.bot?.readBack && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ShieldAlert size={13} />
                Murabot holds: {String(payload.bot.readBack.language ?? '—')}
                {typeof payload.bot.readBack.welcomeChannelId === 'string' && payload.bot.readBack.welcomeChannelId
                  ? ' · welcome channel set'
                  : ' · no welcome channel'}
                {typeof payload.bot.readBack.leaveChannelId === 'string' && payload.bot.readBack.leaveChannelId
                  ? ' · leave channel set'
                  : ' · no leave channel'}
              </span>
            )}
          </div>

          {payload?.bot?.installed === true && !payload?.bot?.online && (
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
              <Check size={12} /> The command prefix for this server is in the Command Prefix card above.
            </p>
          )}
        </div>
      )}
    </Card>
  );

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {profile}
      {botCard}
    </div>
  );
}
