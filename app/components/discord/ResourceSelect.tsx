// Universal visual selector for Discord resources (channels, roles, members,
// categories). Fetches the server's real resources once per guild; the user
// sees names, the parent receives the Discord ID.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DiscordChannel, DiscordGuild, DiscordMember, DiscordRole, ResourceKind,
} from './types';

interface ResourceSelectProps {
  guildId: string;
  kind: ResourceKind;
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}

interface ResolvedMember {
  id: string;
  name: string;
  bot?: boolean;
  icon?: string;
}

const EMOJI: Record<string, string> = {
  text: '#', voice: '🔊', category: '📁', news: '📰', stage: '🎤', store: '🛒',
};

export function ResourceSelect({
  guildId, kind, value, onChange, placeholder, disabled, label,
}: ResourceSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [guild, setGuild] = useState<DiscordGuild | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [members, setMembers] = useState<ResolvedMember[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch resources + guild meta when guildId changes
  useEffect(() => {
    if (!guildId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [gRes, cRes, rRes, mRes] = await Promise.all([
          fetch(`/api/admin/modules?action=guilds`),
          fetch(`/api/admin/modules?action=channels&guildId=${encodeURIComponent(guildId)}`),
          fetch(`/api/admin/modules?action=roles&guildId=${encodeURIComponent(guildId)}`),
          fetch(`/api/admin/modules?action=members&guildId=${encodeURIComponent(guildId)}`),
        ]);
        if (gRes.ok) setGuild(await gRes.json().then((d) => d.data?.[0] ?? null));
        if (cRes.ok) {
          const grouped = (await cRes.json()).data as Record<string, DiscordChannel[]>;
          setChannels(Object.values(grouped).flat());
        }
        if (rRes.ok) setRoles((await rRes.json()).data ?? []);
        if (mRes.ok) {
          const raw = (await mRes.json()).data as DiscordMember[];
          setMembers(raw.map((m) => ({
            id: m.id,
            name: m.nick ?? m.user?.username ?? 'Unknown',
            bot: m.user?.bot,
            icon: m.user?.bot ? '🤖' : '👤',
          })));
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [guildId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = useMemo(() => {
    if (!value) return null;
    if (kind === 'channel' || kind === 'category') return channels.find((c) => c.id === value) ?? null;
    if (kind === 'role') return roles.find((r) => r.id === value) ?? null;
    if (kind === 'member') return members.find((m) => m.id === value) ?? null;
    return null;
  }, [value, channels, roles, members, kind]);

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (kind === 'role') {
      return roles
        .filter((r) => !q || r.name.toLowerCase().includes(q))
        .map((r) => ({ group: 'Roles', value: r.id, label: r.name, icon: `●`, iconColor: r.color }));
    }
    if (kind === 'member') {
      return members
        .filter((m) => !q || m.name.toLowerCase().includes(q))
        .slice(0, 50)
        .map((m) => ({ group: 'Members', value: m.id, label: m.name, icon: m.icon ?? '👤' }));
    }
    // channel or category
    const all = kind === 'category' ? channels.filter((c) => c.type === 'category') : channels;
    const grouped: Record<string, typeof all> = {};
    for (const c of all) {
      if (q && !c.name.toLowerCase().includes(q)) continue;
      const g = c.type === 'category' ? 'Categories' : c.type === 'voice' ? 'Voice Channels' : 'Text Channels';
      (grouped[g] = grouped[g] ?? []).push(c);
    }
    return Object.entries(grouped).flatMap(([g, items]) =>
      items.map((c) => ({
        group: g, value: c.id, label: c.name, icon: EMOJI[c.type] ?? '#',
      }))
    );
  }, [kind, channels, roles, members, search]);

  const groups = useMemo(() => {
    const out: { name: string; items: typeof options }[] = [];
    for (const opt of options) {
      let g = out.find((o) => o.name === opt.group);
      if (!g) { g = { name: opt.group, items: [] }; out.push(g); }
      g.items.push(opt);
    }
    return out;
  }, [options]);

  const display = useMemo(() => {
    if (!selected) return null;
    if (kind === 'role') {
      const r = selected as DiscordRole;
      return (
        <span className="select-value">
          {r.icon && <span className="select-icon">{r.icon}</span>}
          <span className="role-dot" style={{ background: r.color }} />
          {r.name}
        </span>
      );
    }
    if (kind === 'channel' || kind === 'category') {
      const c = selected as DiscordChannel;
      return (
        <span className="select-value">
          <span className="select-icon">{EMOJI[c.type] ?? '#'}</span>
          {c.name}
        </span>
      );
    }
    const m = selected as ResolvedMember;
    return (
      <span className="select-value">
        {m.icon && <span className="select-icon">{m.icon}</span>}
        {m.name}
      </span>
    );
  }, [selected, kind]);

  return (
    <div className={`resource-select ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`} ref={ref}>
      {label && <div className="select-label">{label}</div>}
      <button
        type="button"
        className="select-trigger"
        disabled={disabled || loading}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {display ?? <span className="select-placeholder">{placeholder ?? `Select ${kind}…`}</span>}
        <span className="select-caret">▾</span>
      </button>
      {open && (
        <div className="select-panel" role="listbox">
          <input
            autoFocus
            type="text"
            className="select-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="select-list">
            {loading && <div className="select-empty">Loading…</div>}
            {!loading && groups.length === 0 && (
              <div className="select-empty">{search ? 'No matches' : 'No resources found'}</div>
            )}
            {groups.map((g) => (
              <div key={g.name}>
                <div className="select-group">{g.name}</div>
                {g.items.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`select-option ${value === item.value ? 'selected' : ''}`}
                    onClick={() => { onChange(item.value); setOpen(false); setSearch(''); }}
                    role="option"
                    aria-selected={value === item.value}
                  >
                    <span className="select-icon">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
