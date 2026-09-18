'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useGuild } from '@/app/lib/guild-context';
import { useGuildConfig } from '@/app/lib/use-guild-config';
import { MODULES, MODULE_ROUTES } from '@/app/lib/discord-modules';
import { useBotStatus } from './lib/api';

// Command Center.
//
// This page used to render EVERY module's full settings inline in an accordion,
// with its own save path — a second implementation of the same configuration
// the per-module pages already own. That is what the all-in-one
// "Music / Moderation / Security / Welcome / Tickets / Notifications" page was.
// Configuration now lives on exactly one page per module; this one navigates.
export default function DashboardHome() {
  const { token, selected } = useGuild();
  const { config } = useGuildConfig();
  const status = useBotStatus();

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

  const enabledOf = (id: string) => config?.modules?.[id] ?? true;
  const enabledCount = MODULES.filter((m) => enabledOf(m.id)).length;
  const bot = status?.bot ?? null;

  // The pill follows the BOT's own status. `status.status` is an aggregate that
  // also counts the site's backend, Discord's API and the site's database, so
  // using it here labelled the website's health as the bot's.
  const botState = status?.botStatus ?? null;
  const pillClass = botState === 'ok'
    ? 'cc-status-online'
    : botState === 'degraded' ? 'cc-status-degraded' : 'cc-status-offline';
  const pillLabel = botState === 'ok' ? 'Online' : botState === 'degraded' ? 'Degraded' : 'Offline';

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Server header — server identity + bot status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {selected.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.icon} alt="" width={52} height={52} style={{ borderRadius: 14, flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: 'var(--cc-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 22, color: '#fff', flexShrink: 0,
            }}>{selected.name.charAt(0)}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.name}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
              {enabledCount}/{MODULES.length} modules enabled · configure each on its own page
            </p>
          </div>
        </div>
        {status && (
          <span className={`cc-status-pill ${pillClass}`}>
            <span className="cc-dot" />
            Bot {pillLabel}
          </span>
        )}
      </div>

      {/* Real runtime facts, straight from the bot's measured /health */}
      {bot && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 22 }}>
          <div className="cc-card" style={{ padding: '12px 16px' }}>
            <div className="cc-section-label">Gateway heartbeat</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2 }}>
              {bot.gateway?.heartbeatAgeSeconds != null ? `${bot.gateway.heartbeatAgeSeconds.toFixed(1)}s ago` : 'not measured'}
            </div>
          </div>
          <div className="cc-card" style={{ padding: '12px 16px' }}>
            <div className="cc-section-label">Reconnects</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2 }}>{bot.reconnectCount ?? '—'}</div>
          </div>
          <div className="cc-card" style={{ padding: '12px 16px' }}>
            <div className="cc-section-label">Database</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2 }}>
              {bot.subsystems.database ?? 'unknown'}
            </div>
          </div>
          <div className="cc-card" style={{ padding: '12px 16px' }}>
            <div className="cc-section-label">Music decoder</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2 }}>
              {bot.ffmpeg === null ? 'not measured' : bot.ffmpeg ? 'available' : 'MISSING'}
            </div>
          </div>
        </div>
      )}

      {bot && bot.subsystems.database && bot.subsystems.database !== 'online' && bot.databaseDetail?.hint && (
        <div className="cc-alert cc-alert-error" style={{ marginBottom: 18, fontSize: 13 }}>
          <strong>
            Database {bot.databaseDetail.configured === false ? 'not configured' : 'unreachable'}
          </strong>
          {bot.databaseDetail.errorClass && (
            <span style={{ color: 'var(--cc-text-faint)' }}> ({bot.databaseDetail.errorClass})</span>
          )}
          <div style={{ marginTop: 4 }}>{bot.databaseDetail.hint}</div>
        </div>
      )}

      {/* Module navigation — cards only. No settings, no command lists. */}
      <div className="cc-section-label" style={{ marginBottom: 10 }}>Modules</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {MODULES.map((mod) => {
          const isEnabled = enabledOf(mod.id);
          const route = MODULE_ROUTES[mod.id];
          return (
            <Link
              key={mod.id}
              href={route ?? '/dashboard/modules'}
              className="cc-card"
              style={{
                padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
                opacity: isEnabled ? 1 : 0.55, textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>{mod.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: '#fff', fontWeight: 700, fontSize: 14.5 }}>{mod.label}</span>
                <span style={{ display: 'block', color: 'var(--cc-text-faint)', fontSize: 12.5 }}>
                  {isEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </span>
              <ArrowRight size={16} color="var(--cc-text-dim)" style={{ flexShrink: 0 }} />
            </Link>
          );
        })}
      </div>

      <p style={{ color: 'var(--cc-text-faint)', fontSize: 12, marginTop: 18 }}>
        Each module saves per server (guildId + module) with a before/after audit trail on the{' '}
        <Link href="/dashboard/audit" style={{ color: 'var(--cc-accent)' }}>Audit Log</Link>. The bot picks up changes within ~60 seconds.
      </p>
    </div>
  );
}
