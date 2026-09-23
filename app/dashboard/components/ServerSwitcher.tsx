'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { useGuild } from '@/app/lib/guild-context';

function BotDot({ state }: { state: 'online' | 'offline' | 'unknown' }) {
  const color = state === 'online'
    ? 'var(--cc-ok, #22c55e)'
    : state === 'offline' ? 'rgba(255,255,255,0.25)' : 'var(--cc-warn, #f59e0b)';
  const title = state === 'online'
    ? 'Bot installed'
    : state === 'offline' ? 'Bot not installed' : 'Bot status unknown';
  return (
    <span
      title={title}
      style={{
        width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
      }}
    />
  );
}

export default function ServerSwitcher() {
  const {
    token, guilds, selected, setSelected,
    serversLoading, serversError, serversMeta, refreshServers,
  } = useGuild();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // If the stored guild is no longer manageable (bot kicked, perms revoked),
  // fall back to the command center where the user can reselect.
  useEffect(() => {
    if (selected && guilds.length > 0 && !guilds.some((g) => g.id === selected.id)) {
      setSelected(null);
      router.replace('/dashboard');
    }
  }, [guilds, selected, setSelected, router]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? guilds.filter((g) => g.name.toLowerCase().includes(q) || g.id.includes(q))
    : guilds;

  if (!selected) return null;

  const selectedState = selected.botConnection ?? 'unknown';

  return (
    <div ref={ref} className="cc-server-switch">
      {/* Icons are flex items sized by CSS (20px / 16px, both flex-shrink:0);
          the name takes the flexible middle and truncates with an ellipsis. */}
      <button
        className="cc-btn cc-server-selector"
        onClick={() => { setOpen((o) => !o); setQuery(''); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selectedState === 'offline' ? 'Bot not installed on this server' : selected.name}
      >
        <Server size={20} aria-hidden />
        <span className="cc-server-name">{selected.name}</span>
        <BotDot state={selectedState} />
        <ChevronsUpDown size={16} className="cc-server-chevron" aria-hidden />
      </button>

      {open && (
        <div role="listbox" className="cc-card cc-server-menu">
          <input
            className="cc-input"
            placeholder="Search servers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 6 }}
            autoFocus
          />
          {serversError && (
            <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 6, fontSize: 12 }}>
              {serversError}
            </div>
          )}
          {filtered.length === 0 && (
            <div style={{ padding: '14px 10px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
              No servers match.
            </div>
          )}
          {filtered.map((g) => {
            const conn = g.botConnection ?? 'unknown';
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
                <button
                  role="option"
                  aria-selected={g.id === selected.id}
                  onClick={() => { setSelected(g); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
                    padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: g.id === selected.id ? 'var(--cc-accent-soft)' : 'transparent',
                    color: '#fff', fontSize: 13, textAlign: 'left',
                  }}
                >
                  {g.icon ? (
                    // The session stores a resolved CDN URL, so use it as-is —
                    // concatenating a hash onto the CDN path produced a broken icon.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.icon} alt="" width={24} height={24} style={{ borderRadius: 7 }} />
                  ) : (
                    <div style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--cc-accent-soft)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                      {g.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--cc-text-faint)' }}>
                      {g.botInstalled === true && g.botConnection === 'online' && 'Bot installed'}
                      {g.botInstalled === true && g.botConnection !== 'online' && 'Bot installed · offline'}
                      {g.botInstalled === false && 'Bot not installed'}
                      {g.botInstalled == null && 'Bot status unknown'}
                      {g.missingPermissions ? ' · missing permissions' : ''}
                      {typeof g.memberCount === 'number' ? ` · ${g.memberCount} members` : ''}
                    </span>
                  </span>
                  <BotDot state={conn} />
                  {g.owner ? <ShieldCheck size={14} color="var(--cc-ok)" /> : null}
                </button>
                {g.needsInvite && g.inviteUrl && (
                  <a
                    href={g.inviteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="cc-btn"
                    style={{ padding: '9px 10px', fontSize: 11.5, alignSelf: 'center', whiteSpace: 'nowrap' }}
                    title={`Invite the bot to ${g.name}`}
                    onClick={() => setOpen(false)}
                  >
                    Invite Bot
                  </a>
                )}
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 4px' }}>
            <button
              className="cc-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => void refreshServers(true)}
              disabled={serversLoading}
            >
              <RefreshCw size={13} style={{ animation: serversLoading ? 'spin 1s linear infinite' : undefined }} />
              {serversLoading ? 'Refreshing…' : 'Refresh Servers'}
            </button>
            {serversMeta && (
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--cc-text-faint)' }}>
                {serversMeta.manageableCount} manageable · {serversMeta.botGuildCount ?? '?'} bot servers
              </span>
            )}
          </div>
          <div style={{ padding: '0 10px 4px', fontSize: 10.5, color: 'var(--cc-text-faint)' }}>
            One selection — every page uses this server.
          </div>
        </div>
      )}
    </div>
  );
}
