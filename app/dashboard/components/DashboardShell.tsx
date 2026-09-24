'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useGuild } from '@/app/lib/guild-context';
import { Bot, Menu, RefreshCw, Search } from 'lucide-react';
import Sidebar from './Sidebar';
import ServerSwitcher from './ServerSwitcher';

// ── Dashboard shell ──────────────────────────────────────────────────────
// Auth is a server-side session (HttpOnly cookie). This shell:
//   • while /me is in flight → "Connecting to Discord…" (never a login flash)
//   • valid session + selected guild → the app
//   • valid session, no selection → the server chooser
//   • no session → login gate
// A stale selected guild (permissions changed server-side) is caught here and
// the chooser reappears — the server, not the browser, decides authenticity.

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    authChecked, authenticated, guilds, selected, botOnline,
    botInSelectedGuild, loginUrl, error, setSelected, logout,
    serversLoading, serversError, serversMeta, refreshServers,
  } = useGuild();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chooserQuery, setChooserQuery] = useState('');

  const chooserGuilds = useMemo(() => {
    const q = chooserQuery.trim().toLowerCase();
    if (!q) return guilds;
    return guilds.filter((g) => g.name.toLowerCase().includes(q) || g.id.includes(q));
  }, [guilds, chooserQuery]);

  // Reset an invalid selection when the guild list arrives without it.
  useEffect(() => {
    if (authenticated && selected && guilds.length > 0 && !guilds.some((g) => g.id === selected.id)) {
      setSelected(null);
    }
  }, [authenticated, selected, guilds, setSelected]);

  // While the session check is still running — never flash the login gate.
  if (!authChecked) {
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: 'var(--cc-bg, #0a0a0e)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, margin: '0 auto 18px', borderRadius: 18,
            display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg, rgba(88,101,242,0.9), rgba(88,101,242,0.55))',
            boxShadow: '0 12px 40px rgba(88,101,242,0.35)',
          }}>
            <Bot size={32} color="#fff" />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, margin: 0 }}>
            Connecting to Discord…
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated — the only place the login button appears.
  if (!authenticated) {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const authError = params?.get('auth_error');
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24,
        background: 'radial-gradient(1200px 700px at 15% -10%, rgba(88,101,242,0.16), transparent 60%), radial-gradient(1000px 600px at 110% 110%, rgba(229,9,20,0.12), transparent 60%), #0a0a0e',
      }}>
        <div className="cc-card" style={{ maxWidth: 460, width: '100%', padding: '40px 36px', textAlign: 'center' }}>
          <div style={{
            width: 76, height: 76, margin: '0 auto 20px', borderRadius: 22,
            display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg, rgba(88,101,242,0.9), rgba(88,101,242,0.55))',
            boxShadow: '0 12px 40px rgba(88,101,242,0.35)',
          }}>
            <Bot size={40} color="#fff" />
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            MURAGOODS
          </h1>
          <p style={{ margin: '6px 0 4px', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
            Discord Bot Control Center
          </p>
          <p style={{ margin: '0 0 26px', fontSize: 12.5, color: 'rgba(255,255,255,0.4)' }}>
            One secure server-side session. No repeated logins — sign in once and
            the dashboard stays authenticated for 30 days of activity.
          </p>
          {(authError || error) && (
            <div className="cc-alert cc-alert-error" role="alert" style={{ textAlign: 'left', marginBottom: 16 }}>
              {authError || error}
            </div>
          )}
          <a href={loginUrl} className="cc-btn cc-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            Connect with Discord
          </a>
          <p style={{ marginTop: 18, fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>
            Requires <strong>Manage Server</strong> permission. Tokens never touch the
            browser — the OAuth code is exchanged on the server.
          </p>
        </div>
      </div>
    );
  }

  // Authenticated but no server chosen yet (or the choice was revoked
  // server-side) — show the chooser, not a fake dashboard.
  if (!selected) {
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24,
        background: 'var(--cc-bg)',
      }}>
        <div className="cc-card" style={{ maxWidth: 480, width: '100%', padding: '32px 32px' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#fff' }}>
            Choose a server
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
            Servers where you have <strong>Manage Server</strong> permission. Your
            selection is remembered across visits.
          </p>
          {error && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
          {serversError && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 14 }}>{serversError}</div>}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--cc-text-faint)' }} />
              <input
                className="cc-input"
                placeholder="Search servers…"
                value={chooserQuery}
                onChange={(e) => setChooserQuery(e.target.value)}
                style={{ paddingLeft: 30 }}
              />
            </div>
            <button
              className="cc-btn"
              onClick={() => void refreshServers(true)}
              disabled={serversLoading}
              title="Re-detect servers from Discord and the bot"
              style={{ whiteSpace: 'nowrap' }}
            >
              <RefreshCw size={14} />
              {serversLoading ? 'Refreshing…' : 'Refresh Servers'}
            </button>
          </div>
          {serversMeta && (
            <p style={{ margin: '0 0 12px', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
              {serversMeta.manageableCount} manageable · {serversMeta.botGuildCount ?? '?'} bot servers
              {serversMeta.cached ? ' · cached' : ' · live'}
            </p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {guilds.length === 0 && !serversLoading && (
              <p style={{ color: 'var(--cc-text-faint)', fontSize: 13, margin: 0 }}>
                You don&apos;t manage any servers yet. Add the MuraGoods bot to one of your
                servers first, then hit Refresh Servers.
              </p>
            )}
            {chooserGuilds.length === 0 && guilds.length > 0 && (
              <p style={{ color: 'var(--cc-text-faint)', fontSize: 13, margin: 0 }}>
                No servers match your search.
              </p>
            )}
            {chooserGuilds.map((g) => (
              <div key={g.id} className="cc-card" style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {g.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.icon} alt="" width={28} height={28} style={{ borderRadius: 8 }} />
                  ) : (
                    <span style={{
                      width: 28, height: 28, borderRadius: 8, background: 'rgba(88,101,242,0.35)',
                      display: 'grid', placeItems: 'center', fontSize: 13, color: '#fff',
                    }}>
                      {g.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--cc-text-faint)' }}>
                      {g.owner ? 'Owner' : 'Manager'}
                      {typeof g.memberCount === 'number' ? ` · ${g.memberCount} members` : ''}
                      {typeof g.channelCount === 'number' ? ` · ${g.channelCount} channels` : ''}
                      {typeof g.roleCount === 'number' ? ` · ${g.roleCount} roles` : ''}
                    </span>
                  </span>
                  {g.botInstalled === true && g.botConnection === 'online' && (
                    <span className="cc-status-pill cc-status-online" style={{ fontSize: 10.5 }}>
                      <span className="cc-dot" /> Bot installed
                    </span>
                  )}
                  {g.botInstalled === true && g.botConnection !== 'online' && (
                    <span className="cc-status-pill cc-status-degraded" style={{ fontSize: 10.5 }}>
                      <span className="cc-dot" /> Bot offline
                    </span>
                  )}
                  {g.botInstalled === false && (
                    <span className="cc-status-pill cc-status-offline" style={{ fontSize: 10.5 }}>
                      <span className="cc-dot" /> Bot not installed
                    </span>
                  )}
                  {g.botInstalled == null && (
                    <span className="cc-status-pill" style={{ fontSize: 10.5 }}>
                      <span className="cc-dot" /> Bot unknown
                    </span>
                  )}
                </div>
                {g.missingPermissions && (
                  <div className="cc-alert cc-alert-error" style={{ marginTop: 8, fontSize: 12 }}>
                    Missing permissions — the bot is installed but holds no useful grant. Re-invite it or fix its role.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="cc-btn cc-btn-primary"
                    style={{ flex: 1, justifyContent: 'center', fontSize: 12.5 }}
                    onClick={() => setSelected(g)}
                    disabled={g.botInstalled === false}
                    title={g.botInstalled === false ? 'Invite the bot first' : `Manage ${g.name}`}
                  >
                    Manage server
                  </button>
                  {g.needsInvite && g.inviteUrl && (
                    <a
                      href={g.inviteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="cc-btn"
                      style={{ flex: 1, justifyContent: 'center', fontSize: 12.5 }}
                    >
                      Invite Bot
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => void logout()} className="cc-link" style={{ marginTop: 18, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5 }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ─── Authenticated app shell ───
  return (
    <div style={{ minHeight: '100vh', background: 'var(--cc-bg)' }}>
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} status={botOnline ? 'online' : 'offline'} />
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }}
          aria-hidden
        />
      )}
      <div className="cc-shell-main">
        {/* Two explicit rows: selector (row 1) then nav + bot status (row 2).
            Styling lives in cc.css with real breakpoints — no inline layout,
            so nothing depends on accidental flex wrapping. */}
        <header className="cc-topbar">
          <div className="cc-topbar-selector">
            <button
              className="cc-icon-btn cc-drawer-btn"
              aria-label="Open navigation"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={18} />
            </button>
            <ServerSwitcher />
          </div>
          <div className="cc-topbar-nav">
            <a href="/murastream" className="cc-link" style={{ color: 'rgba(255,255,255,0.55)' }}>MuraStream</a>
            <span className={`cc-status-pill ${botOnline ? 'cc-status-online' : 'cc-status-offline'}`}>
              <span className="cc-dot" />
              {botOnline ? 'Bot Online' : 'Bot Offline'}
            </span>
          </div>
        </header>
        <main style={{ padding: '28px 28px 60px', maxWidth: 1360, margin: '0 auto' }}>
          {/* Per-server bot state, verified server-side. Never assume the bot
              is installed just because the user manages the server. */}
          {selected && botInSelectedGuild === false && (
            <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 16, fontSize: 13 }}>
              <strong>Bot not installed on {selected.name}.</strong>{' '}
              Invite it before changing settings — nothing here can apply until the bot joins.
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {selected.inviteUrl ? (
                  <a href={selected.inviteUrl} target="_blank" rel="noreferrer" className="cc-btn cc-btn-primary" style={{ fontSize: 12.5 }}>
                    Invite Bot to {selected.name}
                  </a>
                ) : (
                  <a href="/api/auth/discord/install" className="cc-btn cc-btn-primary" style={{ fontSize: 12.5 }}>
                    Invite Bot
                  </a>
                )}
                <button className="cc-btn" style={{ fontSize: 12.5 }} onClick={() => void refreshServers(true)} disabled={serversLoading}>
                  <RefreshCw size={13} /> {serversLoading ? 'Checking…' : 'Recheck'}
                </button>
              </div>
            </div>
          )}
          {selected?.missingPermissions && botInSelectedGuild !== false && (
            <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 16, fontSize: 13 }}>
              <strong>Missing permissions on {selected.name}.</strong>{' '}
              The bot is installed but holds no useful grant. Re-invite it or fix its role.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
