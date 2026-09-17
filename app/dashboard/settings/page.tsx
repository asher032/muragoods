'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bot, Check, ExternalLink, Link2, LogOut, RefreshCw, Server, ShieldAlert, Terminal, User, X,
} from 'lucide-react';
import { useGuild } from '@/app/lib/guild-context';
import ServerSwitcher from '../components/ServerSwitcher';

// ── Settings → Discord ───────────────────────────────────────────────────
// Everything here is read from the REAL session (/api/auth/session, which is
// the same handler as /api/auth/discord/me) and the live bot service. Nothing
// is guessed: when the bot service is unreachable we say "Unknown" instead of
// inventing a status, and bot installation is detected per selected guild.

interface InstallState {
  checking: boolean;
  installed: boolean | null;
  inviteUrl: string | null;
  error: string;
}

const MODULE_LINKS: { label: string; href: string; hint: string }[] = [
  { label: 'Module Setup', href: '/dashboard/modules', hint: 'All module settings for this server' },
  { label: 'Commands', href: '/dashboard/commands', hint: 'Per-command config, cooldowns, permissions' },
  { label: 'Music', href: '/dashboard/music', hint: 'DJ role, volume, live player' },
  { label: 'Moderation', href: '/dashboard/moderation', hint: 'Log channel, roles, member actions' },
  { label: 'Security', href: '/dashboard/security', hint: 'Anti-raid, anti-nuke, lockdown' },
  { label: 'Tickets', href: '/dashboard/tickets/center', hint: 'Categories, staff roles, transcripts' },
  { label: 'Leveling', href: '/dashboard/leveling', hint: 'XP, level-up channel, rewards' },
  { label: 'Economy', href: '/dashboard/economy', hint: 'Currency, daily, shop' },
  { label: 'Giveaways', href: '/dashboard/giveaways', hint: 'Duration, winners, requirements' },
  { label: 'Directory', href: '/dashboard/directory', hint: 'Real members, roles and channels' },
  { label: 'Automations', href: '/dashboard/automations', hint: 'Scheduled messages and jobs' },
  { label: 'Audit Log', href: '/dashboard/audit', hint: 'Every dashboard config change' },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--cc-border)' }}>
      <span style={{ fontSize: 12, color: 'var(--cc-text-faint)', minWidth: 132 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</span>
    </div>
  );
}

export default function SettingsPage() {
  const {
    authChecked, authenticated, me, user, guilds, selected,
    botOnline, botLatency, loginUrl, logout, setSelected,
  } = useGuild();

  const [install, setInstall] = useState<InstallState>({ checking: false, installed: null, inviteUrl: null, error: '' });

  // ── Per-guild command prefix ──
  const DEFAULT_PREFIX = 'mg!';
  const [prefix, setPrefix] = useState('');
  const [savedPrefix, setSavedPrefix] = useState('');
  const [prefixState, setPrefixState] = useState<'idle' | 'loading' | 'saving'>('loading');
  const [prefixMsg, setPrefixMsg] = useState('');
  const [prefixErr, setPrefixErr] = useState('');

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setPrefixState('loading');
    setPrefixErr('');
    setPrefixMsg('');
    fetch(`/api/dashboard/prefix?guildId=${encodeURIComponent(selected.id)}`, { cache: 'no-store' })
      .then(async (resp) => {
        const data = (await resp.json().catch(() => null)) as { success?: boolean; prefix?: string; error?: string } | null;
        if (!alive) return;
        if (!resp.ok || !data?.success) {
          setPrefixErr(data?.error || `Could not load the prefix (HTTP ${resp.status})`);
          setPrefixState('idle');
          return;
        }
        setPrefix(data.prefix || DEFAULT_PREFIX);
        setSavedPrefix(data.prefix || DEFAULT_PREFIX);
        setPrefixState('idle');
      })
      .catch(() => {
        if (alive) { setPrefixErr('Network error loading the prefix'); setPrefixState('idle'); }
      });
    return () => { alive = false; };
  }, [selected]);

  async function savePrefix(next: string) {
    if (!selected) return;
    setPrefixState('saving');
    setPrefixErr('');
    setPrefixMsg('');
    try {
      const resp = await fetch('/api/dashboard/prefix', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selected.id, prefix: next }),
      });
      const data = (await resp.json().catch(() => null)) as { success?: boolean; prefix?: string; error?: string; botNotified?: boolean } | null;
      if (!resp.ok || !data?.success) {
        setPrefixErr(data?.error || `Save failed (HTTP ${resp.status})`);
        setPrefixState('idle');
        return;
      }
      const applied = data.prefix || next;
      setPrefix(applied);
      setSavedPrefix(applied);
      setPrefixMsg(
        data.botNotified
          ? `✓ Saved — \`${applied}\` is live in Discord now.`
          : `✓ Saved. The bot will pick it up within ~30s (it did not acknowledge the refresh).`,
      );
    } catch {
      setPrefixErr('Network error while saving — your change was NOT saved.');
    } finally {
      setPrefixState('idle');
    }
  }

  // Live per-guild bot installation check — server verifies we manage the guild.
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setInstall({ checking: true, installed: null, inviteUrl: null, error: '' });
    fetch(`/api/auth/discord/install?guildId=${encodeURIComponent(selected.id)}`, { cache: 'no-store' })
      .then(async (resp) => {
        const data = (await resp.json().catch(() => null)) as
          | { success: boolean; inviteUrl?: string; botInstalled?: boolean | null; error?: string }
          | null;
        if (!alive) return;
        if (!resp.ok || !data?.success) {
          setInstall({ checking: false, installed: null, inviteUrl: null, error: data?.error || `HTTP ${resp.status}` });
          return;
        }
        setInstall({
          checking: false,
          installed: data.botInstalled ?? null,
          inviteUrl: data.inviteUrl ?? null,
          error: '',
        });
      })
      .catch(() => {
        if (alive) setInstall({ checking: false, installed: null, inviteUrl: null, error: 'Could not reach the bot service' });
      });
    return () => { alive = false; };
  }, [selected]);

  if (!authChecked) {
    return <p style={{ color: 'var(--cc-text-dim)', fontSize: 13 }}>Checking your session…</p>;
  }

  if (!authenticated) {
    return (
      <div className="cc-card" style={{ padding: 28, maxWidth: 520 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#fff' }}>Not signed in</h1>
        <p style={{ margin: '8px 0 18px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
          Settings read your real Discord session, so sign in first.
        </p>
        <a href={loginUrl} className="cc-btn cc-btn-primary" style={{ textDecoration: 'none' }}>
          <Link2 size={15} /> Connect with Discord
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Settings</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--cc-text-dim)' }}>
          Your Discord connection, the selected server, and every configuration surface for it.
        </p>
      </header>

      {/* ── Discord account ── */}
      <section className="cc-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={15} /> Discord Account
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" width={48} height={48} style={{ borderRadius: 24 }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 24, background: 'var(--cc-accent-soft)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700 }}>
              {(user?.globalName || user?.username || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{user?.globalName || user?.username}</div>
            <div style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>@{user?.username}</div>
          </div>
        </div>
        <Row label="Discord ID"><code style={{ fontSize: 12.5 }}>{user?.discordId}</code></Row>
        <Row label="Connection status">
          <span className="cc-status-pill cc-status-online"><span className="cc-dot" /> Connected</span>
        </Row>
        <Row label="Last authentication">
          {me?.lastAuthAt ? new Date(me.lastAuthAt).toLocaleString() : '—'}
        </Row>
        <Row label="Session expires">
          {me?.sessionExpiresAt ? new Date(me.sessionExpiresAt).toLocaleDateString() : '—'}
          <span style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
            (30 days of activity; refreshed on use)
          </span>
        </Row>
      </section>

      {/* ── Command prefix (per server) ── */}
      <section className="cc-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={15} /> Command Prefix
        </h2>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
          The prefix for <strong style={{ color: '#fff' }}>{selected?.name || 'this server'}</strong>. Stored per
          server, so changing it here never affects any other server. Default is <code>{DEFAULT_PREFIX}</code>.
        </p>

        {prefixState === 'loading' ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cc-text-faint)' }}>Loading prefix…</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="cc-input"
                value={prefix}
                maxLength={10}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder={DEFAULT_PREFIX}
                aria-label="Command prefix"
                style={{ maxWidth: 180 }}
              />
              <button
                className="cc-btn cc-btn-primary"
                disabled={prefixState === 'saving' || !prefix.trim() || prefix === savedPrefix}
                onClick={() => void savePrefix(prefix.trim())}
              >
                {prefixState === 'saving' ? 'Saving…' : 'Save prefix'}
              </button>
              <button
                className="cc-btn"
                disabled={prefixState === 'saving' || savedPrefix === DEFAULT_PREFIX}
                onClick={() => { setPrefix(DEFAULT_PREFIX); void savePrefix(DEFAULT_PREFIX); }}
              >
                <RefreshCw size={14} /> Reset to {DEFAULT_PREFIX}
              </button>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--cc-text-faint)' }}>
              1–10 characters. Example: <code>{prefix || DEFAULT_PREFIX}play</code>
            </p>
          </>
        )}

        {prefixMsg && <div className="cc-alert" role="status" style={{ marginTop: 10, fontSize: 12.5 }}>{prefixMsg}</div>}
        {prefixErr && <div className="cc-alert cc-alert-error" role="alert" style={{ marginTop: 10, fontSize: 12.5 }}>{prefixErr}</div>}
      </section>

      {/* ── Server ── */}
      <section className="cc-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Server size={15} /> Discord Server
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {selected?.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.icon} alt="" width={36} height={36} style={{ borderRadius: 10 }} />
          ) : null}
          <div style={{ color: '#fff', fontWeight: 700 }}>{selected?.name || 'No server selected'}</div>
          <ServerSwitcher />
        </div>
        <Row label="Servers you manage">{guilds.length}</Row>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {guilds.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelected(g)}
              className="cc-btn"
              style={{ justifyContent: 'flex-start', gap: 10, padding: '8px 12px' }}
            >
              {g.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.icon} alt="" width={22} height={22} style={{ borderRadius: 6 }} />
              ) : (
                <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--cc-accent-soft)', display: 'grid', placeItems: 'center', fontSize: 11 }}>
                  {g.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{g.name}</span>
              {g.id === selected?.id && <Check size={14} color="var(--cc-ok)" style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      </section>

      {/* ── Bot ── */}
      <section className="cc-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={15} /> MuraGoods Bot
        </h2>
        <Row label="Bot service">
          {botOnline ? (
            <span className="cc-status-pill cc-status-online"><span className="cc-dot" /> Online</span>
          ) : (
            <span className="cc-status-pill cc-status-offline"><span className="cc-dot" /> Offline</span>
          )}
          {botLatency != null && <span style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>{botLatency}ms</span>}
        </Row>
        <Row label="Installed here">
          {install.checking ? (
            <span style={{ color: 'var(--cc-text-faint)' }}>Checking…</span>
          ) : install.installed === true ? (
            <span style={{ color: 'var(--cc-ok)', display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14} /> Installed</span>
          ) : install.installed === false ? (
            <span style={{ color: 'var(--cc-warn)', display: 'flex', alignItems: 'center', gap: 6 }}><X size={14} /> Not installed in {selected?.name}</span>
          ) : (
            <span style={{ color: 'var(--cc-text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={14} /> Unknown — {install.error || 'bot service did not report its servers'}
            </span>
          )}
        </Row>
        {install.installed === false && install.inviteUrl && (
          <a href={install.inviteUrl} className="cc-btn cc-btn-primary" style={{ textDecoration: 'none', marginTop: 12, display: 'inline-flex' }}>
            <ExternalLink size={14} /> Add MuraGoods Bot to {selected?.name}
          </a>
        )}
      </section>

      {/* ── Authentication ── */}
      <section className="cc-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={15} /> Authentication
        </h2>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
          Your Discord access token lives only in the server-side session. The browser holds an
          HttpOnly cookie and nothing else.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={loginUrl} className="cc-btn" style={{ textDecoration: 'none' }}>
            <RefreshCw size={14} /> Reconnect Discord
          </a>
          <button onClick={() => void logout()} className="cc-btn">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </section>

      {/* ── Configuration for the selected server ── */}
      <section className="cc-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#fff' }}>Server configuration</h2>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
          Every page below is scoped to <strong style={{ color: '#fff' }}>{selected?.name || 'the selected server'}</strong>.
        </p>
        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {MODULE_LINKS.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="cc-card"
              style={{ padding: '11px 13px', textDecoration: 'none', display: 'block' }}
            >
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 650 }}>{m.label}</div>
              <div style={{ color: 'var(--cc-text-faint)', fontSize: 11.5, marginTop: 3 }}>{m.hint}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
