'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useGuild } from '@/app/lib/guild-context';
import { Bot, Menu } from 'lucide-react';
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
    loginUrl, error, setSelected, logout,
  } = useGuild();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
          <div style={{ display: 'grid', gap: 8 }}>
            {guilds.length === 0 && (
              <p style={{ color: 'var(--cc-text-faint)', fontSize: 13, margin: 0 }}>
                You don&apos;t manage any servers yet. Add the MuraGoods bot to one of your
                servers first, then sign out and back in to refresh this list.
              </p>
            )}
            {guilds.map((g) => (
              <button
                key={g.id}
                className="cc-btn"
                style={{ justifyContent: 'flex-start', gap: 12, padding: '10px 14px' }}
                onClick={() => setSelected(g)}
              >
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
                <span style={{ color: '#fff', fontWeight: 600 }}>{g.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--cc-text-faint)' }}>
                  {g.owner ? 'Owner' : 'Manager'}
                </span>
              </button>
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
          {children}
        </main>
      </div>
    </div>
  );
}
