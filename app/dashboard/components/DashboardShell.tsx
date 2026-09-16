'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useGuild } from '@/app/lib/guild-context';
import { Bot, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import ServerSwitcher from './ServerSwitcher';
import { dashboardApi, type BotStatusResponse } from '../lib/api';

const CLIENT_ID = '1549395794853888020';
const SCOPES = 'identify guilds';
const REDIRECT =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? `${window.location.origin}/dashboard`
    : 'https://muragoods.vercel.app/dashboard';
const LOGIN_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=token&scope=${encodeURIComponent(SCOPES)}`;

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, setToken, guilds, setGuilds, selected, setSelected, loading, setLoading, error, setError } = useGuild();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [status, setStatus] = useState<BotStatusResponse | null>(null);

  // OAuth fragment capture → token. Every /api/dashboard/* call re-verifies the
  // token against Discord server-side; the browser never holds elevated trust.
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access = params.get('access_token');
    if (access) {
      setToken(access);
      window.location.hash = '';
    }
    router.replace(pathname); // strip the OAuth fragment from the visible URL
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load manageable guilds (server-side filtered to MANAGE_GUILD/ADMIN).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const resp = await dashboardApi.guilds(token);
        if (cancelled) return;
        if (!resp.ok) {
          if (resp.status === 401) {
            sessionStorage.removeItem('mb_token');
            setToken('');
          }
          setError(resp.error || 'Failed to load servers');
          return;
        }
        setGuilds(resp.data.guilds);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load servers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live bot status for the sidebar footer + topbar pill.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const resp = await fetch('/api/dashboard/status', { cache: 'no-store' });
        const data = await resp.json();
        if (alive) setStatus(data);
      } catch { /* status stays stale until next poll */ }
    };
    load();
    const t = setInterval(load, 45_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const logout = useCallback(() => {
    setSelected(null);
    setToken('');
    setGuilds([]);
    sessionStorage.removeItem('mb_token');
    sessionStorage.removeItem('mb_guild_selected');
    router.replace('/dashboard');
  }, [setSelected, setToken, setGuilds, router]);

  // ─── Login gate (no token or no server selected) ───
  if (!token || !selected) {
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
            Sign in with Discord to manage your servers. Every request is verified server-side
            against your Discord permissions.
          </p>
          {error && (
            <div className="cc-alert cc-alert-error" role="alert" style={{ textAlign: 'left', marginBottom: 16 }}>
              {error}
            </div>
          )}
          {loading && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading your servers…</p>}
          <a href={LOGIN_URL} className="cc-btn cc-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            Connect with Discord
          </a>
          <p style={{ marginTop: 18, fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>
            Requires <strong>Manage Server</strong> permission. Tokens stay in sessionStorage and are
            never stored server-side.
          </p>
        </div>
      </div>
    );
  }

  // ─── Authenticated app shell ───
  const botOnline = status?.services.botGateway.status === 'ok';

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
      <div style={{ marginLeft: 264 }}>
        <header className="cc-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="cc-icon-btn cc-drawer-btn"
              aria-label="Open navigation"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={18} />
            </button>
            <ServerSwitcher />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
