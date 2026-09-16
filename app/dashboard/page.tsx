'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowRight, BarChart3, Bot, Coins, Film, Gamepad2, Gift,
  ListMusic, Shield, Ticket, Users, Zap,
} from 'lucide-react';
import { useGuild } from '@/app/lib/guild-context';
import { dashboardApi, type ActivityEntry, type BotStatusResponse, type GuildConfigDoc } from './lib/api';

interface Resources {
  channels: Array<{ id: string; name: string; type: number }>;
  roles: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
}

interface Stats {
  commands: number;
  members: number;
  channels: number;
  roles: number;
}

const MODULE_LINKS = [
  { label: 'Moderation', href: '/dashboard/moderation', icon: <Shield size={16} /> },
  { label: 'Music', href: '/dashboard/music', icon: <ListMusic size={16} /> },
  { label: 'Leveling', href: '/dashboard/leveling', icon: <BarChart3 size={16} /> },
  { label: 'Economy', href: '/dashboard/economy', icon: <Coins size={16} /> },
  { label: 'Fun', href: '/dashboard/fun', icon: <Gamepad2 size={16} /> },
  { label: 'Giveaways', href: '/dashboard/giveaways', icon: <Gift size={16} /> },
  { label: 'Suggestions', href: '/dashboard/suggestions', icon: <Zap size={16} /> },
  { label: 'Murastream', href: '/dashboard/murastream', icon: <Film size={16} /> },
];

export default function CommandCenterPage() {
  const { token, selected } = useGuild();
  const [config, setConfig] = useState<GuildConfigDoc | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<BotStatusResponse | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  const loadAll = useCallback(async () => {
    if (!token || !selected) return;
    setLoading(true);
    setError('');
    const [configRes, statusRes, auditRes, resRes] = await Promise.all([
      dashboardApi.config(token, selected.id),
      dashboardApi.status(),
      dashboardApi.audit(token, selected.id),
      fetch(`/api/dashboard/resources?guildId=${selected.id}`, { headers: { 'x-discord-token': token }, cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => null),
    ]);

    if (!configRes.ok) {
      setError(configRes.error);
    } else {
      setConfig(configRes.data.config);
    }

    if (statusRes.ok) setStatus(statusRes.data);

    if (auditRes.ok) {
      setActivity(auditRes.data.audit.slice(0, 8));
    } else {
      setActivity([]);
    }

    if (resRes?.success) {
      const resources = resRes as Resources;
      setStats({
        members: resources.members?.length ?? 0,
        channels: resources.channels?.length ?? 0,
        roles: resources.roles?.length ?? 0,
        commands: Array.isArray(config?.modules) ? Object.keys(config.modules).length : 0,
      });
    } else {
      setStats(null);
      setBanner('Server resources could not be loaded — counts hidden rather than estimated.');
    }
    setLoading(false);
  }, [token, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const overall = status?.status ?? null;
  const statusPill =
    overall === 'ok' ? 'cc-status-online' : overall === 'degraded' ? 'cc-status-degraded' : overall === 'offline' ? 'cc-status-offline' : '';

  const statCards: Array<{ label: string; value: string | number; href?: string; icon: React.ReactNode }> = [
    { label: 'Bot Status', value: overall === 'ok' ? 'Online' : overall === 'degraded' ? 'Degraded' : 'Offline', href: '/dashboard/health', icon: <Bot size={16} /> },
    { label: 'Members', value: stats?.members ?? '—', href: '/dashboard/directory/members', icon: <Users size={16} /> },
    { label: 'Channels', value: stats?.channels ?? '—', href: '/dashboard/directory/channels', icon: <Activity size={16} /> },
    { label: 'Roles', value: stats?.roles ?? '—', href: '/dashboard/directory/roles', icon: <Shield size={16} /> },
    { label: 'Tickets', value: (config?.tickets as Record<string, unknown> | undefined)?.enabled ? 'Configured' : 'Setup needed', href: '/dashboard/tickets/center', icon: <Ticket size={16} /> },
    { label: 'Analytics', value: 'View', href: '/dashboard/analytics', icon: <BarChart3 size={16} /> },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      {/* Greeting */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
          {greeting}, operator
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--cc-text-dim)' }}>
          Manage the Muragoods bot for <strong style={{ color: '#fff' }}>{selected?.name}</strong> from one place.
        </p>
      </div>

      {/* Status strip */}
      {status && (
        <div className="cc-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', padding: '14px 18px', marginBottom: 22 }}>
          <span className={`cc-status-pill ${statusPill}`}>
            <span className="cc-dot" />
            {overall === 'ok' ? 'All systems operational' : overall === 'degraded' ? 'Degraded' : 'Service issues'}
          </span>
          {(['database', 'botGateway', 'discordApi', 'dashboardBackend'] as const).map((svc) => (
            <span key={svc} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
              {svc === 'database' ? 'Database' : svc === 'botGateway' ? 'Bot Gateway' : svc === 'discordApi' ? 'Discord API' : 'Dashboard'}{' '}
              <strong style={{ color: status.services[svc].status === 'ok' ? 'var(--cc-ok)' : status.services[svc].status === 'degraded' ? 'var(--cc-warn)' : 'var(--cc-err)' }}>
                {status.services[svc].status}
              </strong>
              {' · '}{status.services[svc].responseTime}ms
            </span>
          ))}
          <Link href="/dashboard/health" className="cc-link" style={{ marginLeft: 'auto', color: 'var(--cc-accent)' }}>
            Details <ArrowRight size={12} style={{ display: 'inline', verticalAlign: '-2px' }} />
          </Link>
        </div>
      )}

      {/* Error / banner states */}
      {error && <div className="cc-alert cc-alert-error" style={{ marginBottom: 18 }}>{error}</div>}
      {banner && <div className="cc-alert cc-alert-warning" style={{ marginBottom: 18 }}>{banner}</div>}
      {loading && <div className="cc-alert" style={{ marginBottom: 18 }}>Loading command center data…</div>}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        {statCards.map((card) => {
          const inner = (
            <div className="cc-card" style={{ padding: '16px 18px', height: '100%', boxSizing: 'border-box', transition: 'border-color .15s ease, transform .15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--cc-text-faint)' }}>
                {card.icon}
                <span className="cc-section-label">{card.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 750, color: '#fff' }}>{card.value}</div>
            </div>
          );
          return card.href ? (
            <Link key={card.label} href={card.href} style={{ textDecoration: 'none' }}>{inner}</Link>
          ) : (
            <div key={card.label}>{inner}</div>
          );
        })}
      </div>

      {/* Activity + modules */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Activity feed */}
        <div className="cc-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="cc-card-title">Recent Activity</h2>
            <Link href="/dashboard/audit" className="cc-link" style={{ color: 'var(--cc-accent)' }}>All activity</Link>
          </div>
          {activity.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--cc-text-faint)', margin: '10px 0' }}>
              No configuration changes recorded yet. Saves from settings pages appear here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activity.map((entry, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                  <span className="cc-chip cc-chip-accent" style={{ flexShrink: 0 }}>{entry.type ?? 'config'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#fff' }}>{entry.summary ?? 'Configuration updated'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
                      {entry.actor ?? 'unknown'} · {new Date(entry.at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Module quick access */}
        <div className="cc-card" style={{ padding: '18px 20px' }}>
          <h2 className="cc-card-title" style={{ marginBottom: 12 }}>Modules</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {MODULE_LINKS.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                  borderRadius: 10, textDecoration: 'none', fontSize: 13, color: 'var(--cc-text-dim)',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--cc-border)',
                  transition: 'all .15s ease',
                }}
              >
                {m.icon}
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
