'use client';

// MuraBot Dashboard — Discord OAuth, per-server config, glassmorphism UI.
// Auth model: the OAuth access token is kept in-memory (sessionStorage for
// tab refreshes) and passed to /api/dashboard/* which re-verifies permissions
// against Discord on EVERY request. No server-trust in the browser.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  members: number | null;
}

interface GuildConfig {
  modules?: Record<string, boolean>;
  music?: { djRoleId?: string; musicChannelId?: string; controlMode?: string; defaultVolume?: number };
  moderation?: {
    modRoleId?: string; logChannelId?: string; automodEnabled?: boolean;
    antiSpam?: boolean; antiInvite?: boolean; antiLink?: boolean; antiCaps?: boolean;
    capsThreshold?: number; mentionThreshold?: number; escalation?: string[];
  };
  welcome?: { enabled?: boolean; channelId?: string; message?: string; autoRoleId?: string };
  tickets?: { categoryId?: string; supportRoleId?: string };
  notifications?: { channelId?: string; newContent?: boolean; requestUpdates?: boolean };
}

const CLIENT_ID = '1549395794853888020';
const REDIRECT_URI = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? `${window.location.origin}/dashboard`
  : 'https://muragoods.vercel.app/dashboard';
const SCOPES = 'identify guilds';

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.10)',
  backdropFilter: 'blur(13px)',
  WebkitBackdropFilter: 'blur(13px)',
  border: '1px solid rgba(255,255,255,0.20)',
  borderRadius: 20,
};

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        width: '100%', padding: '12px 16px', marginBottom: 8, cursor: 'pointer',
        background: value ? 'rgba(229,9,20,0.18)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${value ? 'rgba(229,9,20,0.5)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 12, color: '#f5f5f7', fontSize: 14,
      }}
    >
      <span>{label}</span>
      <span style={{
        width: 40, height: 22, borderRadius: 11, position: 'relative',
        background: value ? '#e50914' : 'rgba(255,255,255,0.15)', transition: 'all .2s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 20 : 2, width: 18, height: 18,
          borderRadius: 9, background: '#fff', transition: 'all .2s',
        }} />
      </span>
    </button>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
          color: '#f5f5f7', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }}
      />
    </label>
  );
}

export default function DashboardPage() {
  const [token, setToken] = useState<string>('');
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selected, setSelected] = useState<Guild | null>(null);
  const [config, setConfig] = useState<GuildConfig>({});
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [audit, setAudit] = useState<Array<{ actor: string; summary: string; at: string }>>([]);
  const [showAudit, setShowAudit] = useState(false);

  // Handle OAuth redirect: exchange the fragment token.
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access = params.get('access_token');
    if (access) {
      sessionStorage.setItem('mb_token', access);
      window.location.hash = '';
      setToken(access);
    } else {
      const saved = sessionStorage.getItem('mb_token');
      if (saved) setToken(saved);
    }
  }, []);

  // Load manageable guilds.
  const loadGuilds = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const resp = await fetch('/api/dashboard/guilds', { headers: { 'x-discord-token': t } });
      const data = await resp.json();
      if (data.success) {
        setGuilds(data.guilds);
      } else {
        setError(data.error || 'Failed to load servers');
        if (resp.status === 401) {
          sessionStorage.removeItem('mb_token');
          setToken('');
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) loadGuilds(token);
  }, [token, loadGuilds]);

  // Load a guild's config.
  const openGuild = useCallback(async (g: Guild) => {
    setSelected(g);
    setSaveState('idle');
    setSearch('');
    const resp = await fetch(`/api/dashboard/config?guildId=${g.id}`, {
      headers: { 'x-discord-token': token },
    });
    const data = await resp.json();
    if (data.success) setConfig(data.config || {});
    else setError(data.error || 'Failed to load config');
  }, [token]);

  const loadAudit = useCallback(async () => {
    if (!selected) return;
    const resp = await fetch(`/api/dashboard/audit?guildId=${selected.id}`, {
      headers: { 'x-discord-token': token },
    });
    const data = await resp.json();
    if (data.success) setAudit(data.audit || []);
  }, [selected, token]);

  const resetDefaults = useCallback(async () => {
    if (!selected || !confirm('Reset ALL settings for this server to defaults?')) return;
    await fetch('/api/dashboard/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-discord-token': token },
      body: JSON.stringify({ guildId: selected.id, action: 'reset' }),
    });
    openGuild(selected); // reload (defaults)
  }, [selected, token, openGuild]);

  const save = useCallback(async () => {
    if (!selected) return;
    setSaveState('saving');
    const resp = await fetch('/api/dashboard/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-discord-token': token },
      body: JSON.stringify({ guildId: selected.id, config }),
    });
    const data = await resp.json();
    setSaveState(data.success ? 'saved' : 'error');
    setTimeout(() => setSaveState('idle'), 2500);
  }, [selected, config, token]);

  const loginUrl = useMemo(() => {
    const p = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'token',
      scope: SCOPES,
    });
    return `https://discord.com/oauth2/authorize?${p.toString()}`;
  }, []);

  const update = (section: string, key: string, value: unknown) => {
    setConfig((c) => ({ ...c, [section]: { ...(c as Record<string, Record<string, unknown>>)[section], [key]: value } }));
  };

  const mod = config.moderation || {};
  const mus = config.music || {};
  const wel = config.welcome || {};
  const sec = ((config as Record<string, unknown>).securitySettings || {}) as Record<string, boolean | number>;

  // Section visibility driven by the search bar.
  const matches = useCallback((...keys: string[]) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return keys.some((k) => k.toLowerCase().includes(q));
  }, [search]);

  return (
    <main style={{
      minHeight: '100vh',
      background: 'radial-gradient(1200px 600px at 70% -10%, rgba(229,9,20,0.15), transparent), #0a0a0c',
      color: '#f5f5f7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '32px 18px 80px',
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
          <div>
            <p style={{ margin: 0, color: '#e50914', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>MURASTREAM</p>
            <h1 style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 800 }}>MuraBot Dashboard</h1>
          </div>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 14 }}>
            ← Site
          </Link>
        </div>

        {/* Login gate */}
        {!token && (
          <div style={{ ...glass, padding: 40, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Configure your server&apos;s bot</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14.5, lineHeight: 1.6 }}>
              Sign in with Discord to manage MuraBot in servers where you have
              <strong> Manage Server</strong> permission.
            </p>
            <a href={loginUrl} style={{
              display: 'inline-block', marginTop: 14, padding: '13px 30px',
              background: '#5865F2', borderRadius: 12, color: '#fff',
              fontWeight: 700, textDecoration: 'none', fontSize: 15,
            }}>
              Continue with Discord
            </a>
            {error && <p style={{ color: '#ff6b6b', fontSize: 13, marginTop: 14 }}>{error}</p>}
          </div>
        )}

        {/* Server selector */}
        {token && !selected && (
          <div style={{ ...glass, padding: 28 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>My Servers</h2>
            <p style={{ margin: '0 0 18px', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              Only servers you can manage are shown.
            </p>
            {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
            {guilds.length === 0 && !loading && (
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                No manageable servers found. Invite MuraBot to a server where you have Manage Server permission.
              </p>
            )}
            {guilds.map((g) => (
              <button
                key={g.id}
                onClick={() => openGuild(g)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  padding: '13px 16px', marginBottom: 10, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 14, color: '#f5f5f7', fontSize: 15, textAlign: 'left',
                }}
              >
                {g.icon
                  ? <img src={g.icon} alt="" width={40} height={40} style={{ borderRadius: 10 }} />
                  : <span style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🏰</span>}
                <span style={{ flex: 1 }}>
                  <strong>{g.name}</strong>
                  {g.members != null && <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12.5, marginLeft: 10 }}>{g.members} members</span>}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Configure →</span>
              </button>
            ))}
          </div>
        )}

        {/* Config editor */}
        {token && selected && (
          <div>
            {/* Server switcher bar */}
            <div style={{ ...glass, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setSelected(null)} style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14,
              }}>← Servers</button>
              <strong style={{ fontSize: 16 }}>{selected.name}</strong>
              <span style={{ flex: 1 }} />
              <button onClick={resetDefaults} style={{
                padding: '9px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 10, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 13,
              }}>Reset to Default</button>
              <button onClick={() => { setShowAudit(!showAudit); if (!showAudit) loadAudit(); }} style={{
                padding: '9px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 10, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 13,
              }}>🕘 Audit</button>
              <button onClick={save} style={{
                padding: '9px 22px', background: saveState === 'saved' ? '#2ECC40' : '#e50914',
                border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
              }}>
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : saveState === 'error' ? 'Error ✗' : 'Save Changes'}
              </button>
            </div>

            {/* Search bar */}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search settings… (music, automod, welcome, security)"
              style={{
                width: '100%', padding: '13px 18px', marginBottom: 18,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 14, color: '#f5f5f7', fontSize: 14, outline: 'none',
                boxSizing: 'border-box', backdropFilter: 'blur(13px)',
              }}
            />

            {/* Audit panel */}
            {showAudit && (
              <div style={{ ...glass, padding: 24, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>🕘 Settings Audit History</h3>
                {audit.length === 0 && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13.5 }}>No changes recorded yet.</p>}
                {audit.map((a, i) => (
                  <div key={i} style={{
                    padding: '10px 14px', marginBottom: 8, borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)', fontSize: 13.5,
                  }}>
                    <strong style={{ color: '#f5f5f7' }}>{a.actor}</strong>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}> — {a.summary}</span>
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginLeft: 8 }}>
                      {a.at ? new Date(a.at).toLocaleString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Modules */}
            {matches('modules', 'toggles', 'features') && (
              <div style={{ ...glass, padding: 24, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>⚙️ Modules</h3>
                {['music', 'moderation', 'security', 'leveling', 'economy', 'fun', 'tickets', 'giveaways', 'suggestions', 'reminders', 'reputation', 'murastream'].map((m) => (
                  <Toggle
                    key={m}
                    label={m.charAt(0).toUpperCase() + m.slice(1)}
                    value={config.modules?.[m] ?? true}
                    onChange={(v) => update('modules', m, v)}
                  />
                ))}
              </div>
            )}

            {/* Music */}
            {matches('music', 'dj', 'volume') && (
              <div style={{ ...glass, padding: 24, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>🎵 Music</h3>
                <Field label="DJ Role ID" value={mus.djRoleId || ''} onChange={(v) => update('music', 'djRoleId', v)} placeholder="Role ID (right-click role → Copy ID)" />
                <Field label="Music Channel ID" value={mus.musicChannelId || ''} onChange={(v) => update('music', 'musicChannelId', v)} placeholder="Channel ID" />
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>Control mode</span>
                  <select
                    value={mus.controlMode || 'everyone'}
                    onChange={(e) => update('music', 'controlMode', e.target.value)}
                    style={{
                      width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                      color: '#f5f5f7', fontSize: 14,
                    }}
                  >
                    <option value="everyone">Everyone can control</option>
                    <option value="dj">DJ role only</option>
                    <option value="moderators">Moderators only</option>
                  </select>
                </label>
                <Field label={`Default volume: ${mus.defaultVolume ?? 50}%`} value={String(mus.defaultVolume ?? 50)} onChange={(v) => update('music', 'defaultVolume', Number(v) || 50)} placeholder="50" />
              </div>
            )}

            {/* Moderation */}
            {matches('moderation', 'automod', 'spam', 'logs') && (
              <div style={{ ...glass, padding: 24, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>🛡️ Moderation & AutoMod</h3>
                <Field label="Moderator Role ID" value={mod.modRoleId || ''} onChange={(v) => update('moderation', 'modRoleId', v)} placeholder="Role ID" />
                <Field label="Log Channel ID" value={mod.logChannelId || ''} onChange={(v) => update('moderation', 'logChannelId', v)} placeholder="Channel ID" />
                <Toggle label="AutoMod enabled" value={mod.automodEnabled ?? true} onChange={(v) => update('moderation', 'automodEnabled', v)} />
                <Toggle label="Anti-spam" value={mod.antiSpam ?? true} onChange={(v) => update('moderation', 'antiSpam', v)} />
                <Toggle label="Anti-caps" value={mod.antiCaps ?? true} onChange={(v) => update('moderation', 'antiCaps', v)} />
                <Toggle label="Anti-invite" value={mod.antiInvite ?? false} onChange={(v) => update('moderation', 'antiInvite', v)} />
                <Toggle label="Anti-link" value={mod.antiLink ?? false} onChange={(v) => update('moderation', 'antiLink', v)} />
                <Field label={`Caps threshold: ${mod.capsThreshold ?? 70}%`} value={String(mod.capsThreshold ?? 70)} onChange={(v) => update('moderation', 'capsThreshold', Number(v) || 70)} placeholder="70" />
                <Field label={`Mention threshold: ${mod.mentionThreshold ?? 8}`} value={String(mod.mentionThreshold ?? 8)} onChange={(v) => update('moderation', 'mentionThreshold', Number(v) || 8)} placeholder="8" />
              </div>
            )}

            {/* Security */}
            {matches('security', 'raid', 'nuke', 'lockdown') && (
              <div style={{ ...glass, padding: 24, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>🔐 Security</h3>
                <Toggle label="Anti-raid (join spike detection)" value={Boolean(sec.antiRaidEnabled ?? true)} onChange={(v) => update('securitySettings', 'antiRaidEnabled', v)} />
                <Field label={`Join spike threshold: ${sec.joinSpikeThreshold ?? 8} joins`} value={String(sec.joinSpikeThreshold ?? 8)} onChange={(v) => update('securitySettings', 'joinSpikeThreshold', Number(v) || 8)} placeholder="8" />
                <Toggle label="Anti-nuke (mass-delete protection)" value={Boolean(sec.antiNukeEnabled ?? true)} onChange={(v) => update('securitySettings', 'antiNukeEnabled', v)} />
                <Field label={`Min account age: ${sec.minAccountAgeHours ?? 24}h (raid screening)`} value={String(sec.minAccountAgeHours ?? 24)} onChange={(v) => update('securitySettings', 'minAccountAgeHours', Number(v) || 24)} placeholder="24" />
              </div>
            )}

            {/* Welcome */}
            {matches('welcome', 'greeting', 'auto-role') && (
              <div style={{ ...glass, padding: 24, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>👋 Welcome</h3>
                <Toggle label="Welcome messages" value={wel.enabled ?? false} onChange={(v) => update('welcome', 'enabled', v)} />
                <Field label="Welcome Channel ID" value={wel.channelId || ''} onChange={(v) => update('welcome', 'channelId', v)} placeholder="Channel ID" />
                <Field label="Auto-role ID" value={wel.autoRoleId || ''} onChange={(v) => update('welcome', 'autoRoleId', v)} placeholder="Role ID" />
                <Field label="Message ({user}, {server}, {membercount})" value={wel.message || ''} onChange={(v) => update('welcome', 'message', v)} placeholder="👋 Welcome {user} to {server}!" />
              </div>
            )}

            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12.5, textAlign: 'center', marginTop: 20 }}>
              Settings save per-server and apply to the bot within ~60 seconds.
              <br />MuraBot • <Link href="/terms" style={{ color: 'inherit' }}>Terms</Link> • <Link href="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
