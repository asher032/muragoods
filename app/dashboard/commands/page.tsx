'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useGuild } from '@/app/lib/guild-context';

const MODULE_TABS = [
  'All', 'Music', 'Moderation', 'Security', 'Leveling', 'Economy', 'Fun',
  'Tickets', 'Giveaways', 'Suggestions', 'Reminders', 'Reputation', 'Murastream',
];

interface CommandItem {
  name: string;
  description: string;
  type: 'slash' | 'prefix';
  module: string;
  status: 'working' | 'disabled' | 'error';
  usage?: string;
  requiredPermissions?: string[];
  botPermissions?: string[];
  cooldown?: number;
  id: string;
}

interface Execution {
  commandName: string;
  executedAt: string;
  success: boolean;
}

interface DetailModalProps {
  command: CommandItem;
  executions: Execution[];
  onClose: () => void;
}

export default function CommandsPage() {
  const { token, selected } = useGuild();
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [stats, setStats] = useState({ total: 0, working: 0, disabled: 0, errors: 0 });
  const [allExecutions, setAllExecutions] = useState<Execution[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [selectedCommand, setSelectedCommand] = useState<CommandItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!token || !selected) return;
    setLoading(true);
    fetch(`/api/dashboard/commands?guildId=${encodeURIComponent(selected.id)}`, { headers: { 'x-discord-token': token } })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setCommands(data.commands || []);
          setStats(data.stats || { total: 0, working: 0, disabled: 0, errors: 0 });
          setAllExecutions(data.recentExecutions || []);
          setFetchError('');
        } else {
          setFetchError(data.error || 'Failed to load commands');
        }
      })
      .catch(() => setFetchError('Network error'))
      .finally(() => setLoading(false));
  }, [token, selected]);

  const filteredCommands = useMemo(() => {
    let list = commands;
    if (activeTab !== 'All') {
      list = list.filter((c) => c.module === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [commands, activeTab, search]);

  const commandExecutions = useCallback((cmdName: string) => {
    return allExecutions.filter((e) => e.commandName === cmdName).slice(0, 10);
  }, [allExecutions]);

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to browse commands.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar to view its commands.</p>;
  }

  return (
    <div>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 20px', fontSize: 26, fontWeight: 800, color: '#fff' }}>⌨ Command Center</h1>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20,
      }}>
        {[
          { label: 'Total', value: stats.total, color: '#5865F2' },
          { label: 'Working', value: stats.working, color: '#2ECC40' },
          { label: 'Disabled', value: stats.disabled, color: 'rgba(255,255,255,0.4)' },
          { label: 'Errors', value: stats.errors, color: '#e50914' },
        ].map((s) => (
          <div key={s.label} className="cc-card" style={{ padding: '16px 20px' }}>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--cc-text-faint)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {fetchError && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 16 }}>
          {fetchError}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Search commands by name…"
        className="cc-input"
        style={{ width: '100%', marginBottom: 16 }}
      />

      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 20, paddingBottom: 4,
        scrollbarWidth: 'thin',
      }}>
        {MODULE_TABS.map((tab) => {
          const count = tab === 'All' ? stats.total : commands.filter((c) => c.module === tab).length;
          const active = activeTab === tab;
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              background: active ? 'var(--cc-accent)' : 'rgba(255,255,255,0.06)', color: active ? '#fff' : 'var(--cc-text-dim)',
              border: active ? '1px solid var(--cc-accent)' : '1px solid var(--cc-border)',
              whiteSpace: 'nowrap', transition: 'all .15s',
            }}>
              {tab} <span style={{ opacity: 0.6 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {loading && <p style={{ color: 'var(--cc-text-faint)', textAlign: 'center', padding: 40 }}>Loading commands…</p>}

      {!loading && filteredCommands.length === 0 && (
        <div className="cc-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>No commands found.</p>
        </div>
      )}

      {!loading && filteredCommands.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredCommands.map((cmd) => {
            const statusColor = cmd.status === 'working' ? '#2ECC40' : cmd.status === 'disabled' ? 'rgba(255,255,255,0.4)' : '#e50914';
            const statusBg = cmd.status === 'working' ? 'rgba(46,204,64,0.12)' : cmd.status === 'disabled' ? 'rgba(255,255,255,0.04)' : 'rgba(229,9,20,0.1)';
            return (
              <button key={cmd.id} onClick={() => setSelectedCommand(cmd)} style={{
                display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
                padding: '14px 18px', background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--cc-border)', borderRadius: 12, cursor: 'pointer',
                color: '#f5f5f7', transition: 'all .15s',
              }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: statusBg, color: statusColor, flexShrink: 0, textTransform: 'uppercase',
                }}>{cmd.status}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 14 }}>{cmd.name}</span>
                  <span style={{ color: 'var(--cc-text-faint)', fontSize: 12, marginLeft: 8 }}>{cmd.description}</span>
                </span>
                <span style={{ flexShrink: 0, padding: '3px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: 6, fontSize: 10, color: 'var(--cc-text-faint)' }}>
                  {cmd.type}
                </span>
                <span style={{ flexShrink: 0, padding: '3px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: 6, fontSize: 10, color: 'var(--cc-text-faint)' }}>
                  {cmd.module}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedCommand && (
        <DetailModal
          command={selectedCommand}
          executions={commandExecutions(selectedCommand.name)}
          onClose={() => setSelectedCommand(null)}
        />
      )}
    </div>
  );
}

function DetailModal({ command, executions, onClose }: DetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const statusColor = command.status === 'working' ? '#2ECC40' : command.status === 'disabled' ? 'rgba(255,255,255,0.4)' : '#e50914';
  const statusBg = command.status === 'working' ? 'rgba(46,204,64,0.12)' : command.status === 'disabled' ? 'rgba(255,255,255,0.04)' : 'rgba(229,9,20,0.1)';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div ref={overlayRef} style={{
        background: '#141419', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
        width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', padding: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
            <h2 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{command.name}</h2>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--cc-text-dim)',
            cursor: 'pointer', padding: 8, borderRadius: 8, fontSize: 18,
          }} aria-label="Close">✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <span style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: statusBg, color: statusColor, textTransform: 'uppercase' }}>
            {command.status}
          </span>
          <span style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'var(--cc-text-dim)' }}>
            {command.type}
          </span>
          <span style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'var(--cc-text-dim)' }}>
            {command.module}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14 }}>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Description</p>
            <p style={{ margin: 0, color: '#f5f5f7', fontSize: 14 }}>{command.description}</p>
          </div>

          {command.usage && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Usage</p>
              <p style={{ margin: 0, fontFamily: 'monospace', color: 'var(--cc-accent)', fontSize: 14 }}>{command.usage}</p>
            </div>
          )}

          {command.cooldown != null && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Cooldown</p>
              <p style={{ margin: 0, color: '#f5f5f7', fontSize: 14 }}>{command.cooldown} seconds</p>
            </div>
          )}

          {command.requiredPermissions && command.requiredPermissions.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Required Permissions</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {command.requiredPermissions.map((p) => (
                  <span key={p} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(88,101,242,0.12)', color: '#8b95f6' }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {command.botPermissions && command.botPermissions.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14 }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Bot Permissions</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {command.botPermissions.map((p) => (
                  <span key={p} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(46,204,64,0.12)', color: '#2ECC40' }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14 }}>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--cc-text-faint)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Recent Executions</p>
            {executions.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>No recent executions</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {executions.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                    <span style={{ color: '#f5f5f7', fontSize: 13, fontFamily: 'monospace' }}>{e.commandName}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: e.success ? '#2ECC40' : '#e50914', fontSize: 12, fontWeight: 600 }}>{e.success ? '✓ Success' : '✗ Failed'}</span>
                      <span style={{ color: 'var(--cc-text-faint)', fontSize: 11 }}>{new Date(e.executedAt).toLocaleString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
