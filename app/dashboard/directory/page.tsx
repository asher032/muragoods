'use client';

// Server directory — real data from /api/dashboard/resources (Discord API).
// No mock/fallback data is ever shown; fetch failures surface real errors.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Hash, Volume2, Megaphone, MessageSquare, Users as UsersIcon, ListMusic, Shield } from 'lucide-react';
import { useGuild } from '@/app/lib/guild-context';

interface Channel { id: string; name: string; type: number; parentId: string | null; }
interface Role { id: string; name: string; }
interface Member { id: string; name: string; }
interface Resources { channels: Channel[]; roles: Role[]; members: Member[]; }

const TABS = ['members', 'roles', 'channels'] as const;
type Tab = (typeof TABS)[number];

const CHANNEL_ICONS: Record<number, React.ReactNode> = {
  0: <Hash size={14} />,
  5: <Megaphone size={14} />,
  2: <Volume2 size={14} />,
  13: <Volume2 size={14} />,
  15: <MessageSquare size={14} />,
};

function channelTypeLabel(type: number): string {
  const map: Record<number, string> = { 0: 'Text', 5: 'Announcement', 2: 'Voice', 13: 'Stage', 15: 'Forum' };
  return map[type] ?? `Type ${type}`;
}

export default function DirectoryPage() {
  const { token, selected } = useGuild();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(
    initialTab === 'roles' || initialTab === 'channels' ? (initialTab as Tab) : 'members',
  );
  const [resources, setResources] = useState<Resources | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token || !selected) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`/api/dashboard/resources?guildId=${selected.id}`, {
        headers: { 'x-discord-token': token },
        cache: 'no-store',
      });
      const data = await resp.json();
      if (data.success) {
        setResources({ channels: data.channels || [], roles: data.roles || [], members: data.members || [] });
      } else {
        setError(data.error || 'Failed to load server directory');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [token, selected]);

  useEffect(() => { load(); }, [load]);

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTab(t)}
      className={`cc-btn ${tab === t ? 'cc-btn-primary' : ''}`}
      style={{ fontSize: 12.5, padding: '7px 14px' }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff' }}>Discord Directory</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--cc-text-dim)' }}>
            Live members, roles, and channels from <strong style={{ color: '#fff' }}>{selected?.name}</strong>
          </p>
        </div>
        <button className="cc-btn" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {tabBtn('members', 'Members', <UsersIcon size={14} />)}
        {tabBtn('roles', 'Roles', <Shield size={14} />)}
        {tabBtn('channels', 'Channels', <ListMusic size={14} />)}
      </div>

      {error && <div className="cc-alert cc-alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {loading && !resources && <div className="cc-alert">Loading directory…</div>}

      {resources && tab === 'members' && (
        <div className="cc-card" style={{ padding: '6px 0', overflowX: 'auto' }}>
          <table className="cc-table">
            <thead>
              <tr><th>Display Name</th><th>Username</th><th>Details</th></tr>
            </thead>
            <tbody>
              {resources.members.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td style={{ color: 'var(--cc-text-dim)' }}>@{m.name.toLowerCase().replace(/\s+/g, '')}</td>
                  <td>
                    <details style={{ fontSize: 12, color: 'var(--cc-text-dim)' }}>
                      <summary style={{ cursor: 'pointer' }}>Developer details</summary>
                      <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>User ID: {m.id}</span>
                    </details>
                  </td>
                </tr>
              ))}
              {resources.members.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--cc-text-faint)' }}>No members returned by Discord.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {resources && tab === 'roles' && (
        <div className="cc-card" style={{ padding: '6px 0', overflowX: 'auto' }}>
          <table className="cc-table">
            <thead>
              <tr><th>Role</th><th>Details</th></tr>
            </thead>
            <tbody>
              {resources.roles.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    <details style={{ fontSize: 12, color: 'var(--cc-text-dim)' }}>
                      <summary style={{ cursor: 'pointer' }}>Developer details</summary>
                      <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>Role ID: {r.id}</span>
                    </details>
                  </td>
                </tr>
              ))}
              {resources.roles.length === 0 && (
                <tr><td colSpan={2} style={{ color: 'var(--cc-text-faint)' }}>No roles returned by Discord.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {resources && tab === 'channels' && (
        <div className="cc-card" style={{ padding: '6px 0', overflowX: 'auto' }}>
          <table className="cc-table">
            <thead>
              <tr><th>Channel</th><th>Type</th><th>Details</th></tr>
            </thead>
            <tbody>
              {resources.channels.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--cc-text-dim)' }}>
                      {CHANNEL_ICONS[c.type] ?? <Hash size={14} />} {c.name}
                    </span>
                  </td>
                  <td><span className="cc-chip">{channelTypeLabel(c.type)}</span></td>
                  <td>
                    <details style={{ fontSize: 12, color: 'var(--cc-text-dim)' }}>
                      <summary style={{ cursor: 'pointer' }}>Developer details</summary>
                      <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>Channel ID: {c.id}</span>
                    </details>
                  </td>
                </tr>
              ))}
              {resources.channels.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--cc-text-faint)' }}>No channels returned by Discord.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 14, fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
        Data fetched live from the Discord API via the backend. Nothing here is cached beyond the request.
      </p>
    </div>
  );
}
