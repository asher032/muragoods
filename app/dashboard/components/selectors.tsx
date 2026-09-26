'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Hash, Megaphone, MessagesSquare, Mic, Mic2, FolderInput, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';

// ── Reusable Discord selector system ───────────────────────────────────────
// Every module uses these components — no module implements its own ID logic.
// Discord IDs stay internal (option values); the admin only sees friendly
// names, icons and permission states.
//
//   <DiscordChannelSelect />  text/voice/category/forum pickers
//   <DiscordRoleSelect />     roles with counts + hierarchy warnings
//   <DiscordMemberSelect />   searchable members, never pasted IDs
//   <DiscordMultiSelect />    chips + add-channel/add-role multi pickers
//   <DiscordPermissionStatus /> pre-save checklist from the validate endpoint
//
// Data comes from GET /api/dashboard/resources (bot-token reads, user-manage
// verified server-side). Validation via POST .../resources/validate.

export interface GuildChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  parentName: string | null;
}

export interface GuildRole {
  id: string;
  name: string;
  position: number;
  color: number;
  memberCount: number;
}

export interface GuildMember {
  id: string;
  name: string;
  username?: string;
  avatar?: string | null;
  bot?: boolean;
  roleIds?: string[];
}

export interface GuildBotInfo {
  id: string;
  roleIds: string[];
  topRolePosition: number | null;
  guildPermissions: string | null;
}

export interface GuildResources {
  guild: { id: string; name: string; memberCount: number | null } | null;
  channels: GuildChannel[];
  roles: GuildRole[];
  members: GuildMember[];
  bot: GuildBotInfo | null;
}

export type ChannelKinds = 'text' | 'voice' | 'category' | 'all';

export const TEXT_TYPES = [0, 5, 15];
export const VOICE_TYPES = [2, 13];
export const CATEGORY_TYPES = [4];

export function kindsForKey(key: string): ChannelKinds {
  const k = key.toLowerCase();
  if (k.includes('categor')) return 'category';
  if (k.includes('voice') || k.includes('stage')) return 'voice';
  return 'text';
}

export function channelTypeLabel(type: number): string {
  switch (type) {
    case 0: return 'Text';
    case 2: return 'Voice';
    case 4: return 'Category';
    case 5: return 'Announcement';
    case 13: return 'Stage';
    case 15: return 'Forum';
    default: return 'Channel';
  }
}

export function ChannelIcon({ type, size = 14 }: { type: number; size?: number }) {
  switch (type) {
    case 2: return <Mic size={size} aria-hidden />;
    case 4: return <FolderInput size={size} aria-hidden />;
    case 5: return <Megaphone size={size} aria-hidden />;
    case 13: return <Mic2 size={size} aria-hidden />;
    case 15: return <MessagesSquare size={size} aria-hidden />;
    default: return <Hash size={size} aria-hidden />;
  }
}

function kindsToTypes(kinds: ChannelKinds): number[] {
  if (kinds === 'text') return TEXT_TYPES;
  if (kinds === 'voice') return VOICE_TYPES;
  if (kinds === 'category') return CATEGORY_TYPES;
  return [...TEXT_TYPES, ...VOICE_TYPES, ...CATEGORY_TYPES];
}

function roleColorStyle(color: number): { background: string } {
  if (!color) return { background: 'rgba(255,255,255,0.18)' };
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  return { background: hex };
}

// ── Data hook ──────────────────────────────────────────────────────────────
// Guild-scoped bulk load for every selector on the page. Race-safe:
//   - an AbortController cancels the in-flight request on guild switch /
//     unmount / manual refresh, so Server A's response can never overwrite
//     Server B (stale-response guard via monotonically increasing request id)
//   - state is cleared synchronously on guild change before the new load
// Errors carry the backend `code` so the UI maps each failure to its real
// message (permission vs Discord outage vs bot offline) instead of one
// generic "no permission" banner.
export function useGuildResources(guildId: string | null) {
  const [resources, setResources] = useState<GuildResources | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [retryable, setRetryable] = useState(false);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!guildId) return;
    const id = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    setCode('');
    setRetryable(false);
    try {
      const resp = await fetch(`/api/dashboard/resources?guildId=${encodeURIComponent(guildId)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (id !== requestId.current) return; // stale: a newer load superseded us
      const data = (await resp.json().catch(() => null)) as
        | (Partial<GuildResources> & { success?: boolean; error?: string; code?: string; retryable?: boolean })
        | null;
      if (!resp.ok || !data?.success) {
        setError(data?.error || `Couldn't load server data (HTTP ${resp.status}).`);
        setCode(typeof data?.code === 'string' ? data.code : '');
        setRetryable(Boolean(data?.retryable) || resp.status === 429 || resp.status >= 500);
        return;
      }
      setResources({
        guild: data.guild ?? null,
        channels: data.channels ?? [],
        roles: data.roles ?? [],
        members: data.members ?? [],
        bot: data.bot ?? null,
      });
    } catch (err) {
      if (id !== requestId.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError("Couldn't reach the server. Check your connection and retry.");
      setCode('NETWORK_ERROR');
      setRetryable(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    setResources(null);
    setError('');
    setCode('');
    setRetryable(false);
    requestId.current += 1; // invalidate any in-flight load for the old guild
    controllerRef.current?.abort();
    void load();
    return () => { controllerRef.current?.abort(); };
  }, [load]);

  return { resources, loading, error, code, retryable, refresh: load };
}

export function channelName(channels: GuildChannel[], id: string): string | null {
  return channels.find((c) => c.id === id)?.name ?? null;
}

export function roleName(roles: GuildRole[], id: string): string | null {
  return roles.find((r) => r.id === id)?.name ?? null;
}

export function memberName(members: GuildMember[], id: string): string | null {
  return members.find((m) => m.id === id)?.name ?? null;
}

export interface SearchedMember {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bot: boolean;
}

// ── Backend member search ────────────────────────────────────────────────
// Guild-scoped, debounced internally (300ms), bounded server-side.
// AbortController + request id: a guild switch or a newer keystroke cancels
// the stale request so old results never overwrite the new server's list.
// Query identity is (guildId, query) — never shared across guilds.
export function useGuildMemberSearch(guildId: string | null, query: string, limit = 25) {
  const [results, setResults] = useState<SearchedMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!guildId || q.length < 2) {
      requestId.current += 1;
      setResults([]);
      setSearching(false);
      setSearchError('');
      setSearchCode('');
      return;
    }
    const id = ++requestId.current;
    const controller = new AbortController();
    setSearching(true);
    setSearchError('');
    setSearchCode('');
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const resp = await fetch(
            `/api/discord/guilds/${encodeURIComponent(guildId)}/members?search=${encodeURIComponent(q)}&limit=${limit}`,
            { cache: 'no-store', signal: controller.signal },
          );
          if (id !== requestId.current) return;
          const data = (await resp.json().catch(() => null)) as {
            success?: boolean; members?: SearchedMember[]; error?: string; code?: string;
          } | null;
          if (!resp.ok || !data?.success) {
            setResults([]);
            setSearchError(data?.error || `Member search failed (HTTP ${resp.status}).`);
            setSearchCode(typeof data?.code === 'string' ? data.code : '');
          } else {
            setResults(Array.isArray(data.members) ? data.members : []);
          }
        } catch (err) {
          if (id !== requestId.current) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setResults([]);
          setSearchError("Couldn't reach member search. Retry.");
          setSearchCode('NETWORK_ERROR');
        } finally {
          if (id === requestId.current) setSearching(false);
        }
      })();
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [guildId, query, limit]);

  return { results, searching, searchError, searchCode };
}

// ── Shared dropdown shell ──────────────────────────────────────────────────
function DropShell({
  open, onToggle, buttonLabel, buttonIcon, disabled, loading, placeholder, children, onClear, canClear,
}: {
  open: boolean;
  onToggle: () => void;
  buttonLabel: React.ReactNode;
  buttonIcon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  children: React.ReactNode;
  onClear?: () => void;
  canClear?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggle(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="cc-input"
          onClick={onToggle}
          disabled={disabled || loading}
          aria-haspopup="listbox"
          aria-expanded={open}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer',
            textAlign: 'left', opacity: disabled ? 0.6 : 1, minWidth: 0,
          }}
        >
          {buttonIcon}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: buttonLabel ? '#fff' : 'var(--cc-text-faint)' }}>
            {loading ? 'Loading…' : buttonLabel || placeholder || 'Select…'}
          </span>
          <ChevronDown size={15} style={{ flexShrink: 0, color: 'var(--cc-text-faint)' }} aria-hidden />
        </button>
        {canClear && onClear && (
          <button type="button" className="cc-btn" onClick={onClear} aria-label="Clear selection" title="Clear selection">
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <div
          role="listbox"
          className="cc-card"
          style={{
            position: 'absolute', zIndex: 120, top: 'calc(100% + 6px)', left: 0, right: 0,
            maxHeight: 300, overflowY: 'auto', padding: 8, background: '#15151d',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: 'relative', marginBottom: 6 }}>
      <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--cc-text-faint)' }} />
      <input
        className="cc-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ paddingLeft: 28, fontSize: 12.5 }}
        autoFocus
      />
    </div>
  );
}

function optionStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
    padding: '8px 9px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: active ? 'var(--cc-accent-soft)' : 'transparent',
    color: '#fff', fontSize: 13, textAlign: 'left',
  };
}

// ── Channel selector ───────────────────────────────────────────────────────
export function DiscordChannelSelect({
  channels, value, onChange, kinds = 'text', disabled, loading, allowClear = true,
}: {
  channels: GuildChannel[];
  value: string;
  onChange: (id: string) => void;
  kinds?: ChannelKinds;
  disabled?: boolean;
  loading?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const types = useMemo(() => kindsToTypes(kinds), [kinds]);

  const filtered = useMemo(() => {
    const list = channels.filter((c) => types.includes(c.type));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [channels, types, query]);

  const grouped = useMemo(() => {
    const cats = filtered.filter((c) => c.type === 4);
    const rest = filtered.filter((c) => c.type !== 4);
    // Group text-like channels under their category parent name.
    const byParent = new Map<string, GuildChannel[]>();
    const ungrouped: GuildChannel[] = [];
    for (const c of rest) {
      if (c.parentName) {
        const arr = byParent.get(c.parentName) ?? [];
        arr.push(c);
        byParent.set(c.parentName, arr);
      } else ungrouped.push(c);
    }
    return { cats, byParent, ungrouped };
  }, [filtered]);

  const current = channels.find((c) => c.id === value) || null;
  const stale = value !== '' && !current;

  const renderRow = (c: GuildChannel) => (
    <button
      key={c.id}
      role="option"
      aria-selected={c.id === value}
      onClick={() => { onChange(c.id); setOpen(false); }}
      style={optionStyle(c.id === value)}
    >
      <span style={{ color: 'var(--cc-text-dim)', display: 'inline-flex' }}><ChannelIcon type={c.type} /></span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.type === 4 ? c.name.toUpperCase() : c.name}
      </span>
      <span style={{ fontSize: 10, color: 'var(--cc-text-faint)', flexShrink: 0 }}>{channelTypeLabel(c.type)}</span>
      {c.id === value && <Check size={13} color="var(--cc-ok)" />}
    </button>
  );

  return (
    <div>
      <DropShell
        open={open}
        onToggle={() => { setOpen((o) => !o); setQuery(''); }}
        disabled={disabled}
        loading={loading}
        placeholder={kinds === 'category' ? 'Choose a category…' : 'Choose a channel…'}
        buttonLabel={current ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <ChannelIcon type={current.type} /> {current.name}
          </span>
        ) : stale ? 'Previously selected channel is unavailable' : null}
        buttonIcon={undefined}
        onClear={() => onChange('')}
        canClear={allowClear && value !== ''}
      >
        <SearchBox value={query} onChange={setQuery} placeholder={kinds === 'category' ? 'Search categories…' : 'Search channels…'} />
        {filtered.length === 0 && (
          <div style={{ padding: '12px 8px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
            {channels.length === 0 ? 'No channels returned by Discord.' : 'No channels match.'}
          </div>
        )}
        {kinds !== 'category' && grouped.ungrouped.map(renderRow)}
        {[...grouped.byParent.entries()].map(([parent, list]) => (
          <div key={parent}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--cc-text-faint)', padding: '8px 9px 3px' }}>
              {parent.toUpperCase()}
            </div>
            {list.map(renderRow)}
          </div>
        ))}
        {grouped.cats.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--cc-text-faint)', padding: '8px 9px 3px' }}>
              CATEGORIES
            </div>
            {grouped.cats.map(renderRow)}
          </div>
        )}
      </DropShell>
      {stale && (
        <div className="cc-alert cc-alert-error" style={{ marginTop: 6, fontSize: 12 }}>
          ⚠️ Previously selected channel is unavailable (deleted or bot lost access). Choose another channel.
        </div>
      )}
    </div>
  );
}

// ── Role selector ──────────────────────────────────────────────────────────
export function DiscordRoleSelect({
  roles, value, onChange, disabled, loading, allowClear = true,
  botTopRolePosition = null, botIsAdmin = false, requireManageable = false,
}: {
  roles: GuildRole[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  allowClear?: boolean;
  botTopRolePosition?: number | null;
  botIsAdmin?: boolean;
  requireManageable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(q));
  }, [roles, query]);

  const current = roles.find((r) => r.id === value) || null;
  const stale = value !== '' && !current;
  const hierarchyBlocked = Boolean(
    requireManageable && current && !botIsAdmin
    && botTopRolePosition !== null && current.position >= botTopRolePosition,
  );

  return (
    <div>
      <DropShell
        open={open}
        onToggle={() => { setOpen((o) => !o); setQuery(''); }}
        disabled={disabled}
        loading={loading}
        placeholder="Choose a role…"
        buttonLabel={current ? `@${current.name}` : stale ? 'Previously selected role is unavailable' : null}
        buttonIcon={current ? <span style={{ width: 10, height: 10, borderRadius: 5, ...roleColorStyle(current.color) }} /> : undefined}
        onClear={() => onChange('')}
        canClear={allowClear && value !== ''}
      >
        <SearchBox value={query} onChange={setQuery} placeholder="Search roles…" />
        {filtered.length === 0 && (
          <div style={{ padding: '12px 8px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
            {roles.length === 0 ? 'No roles returned by Discord.' : 'No roles match.'}
          </div>
        )}
        {filtered.map((r) => (
          <button
            key={r.id}
            role="option"
            aria-selected={r.id === value}
            onClick={() => { onChange(r.id); setOpen(false); }}
            style={optionStyle(r.id === value)}
          >
            <span style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, ...roleColorStyle(r.color) }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{r.name}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--cc-text-faint)' }}>
                {r.memberCount} member{r.memberCount === 1 ? '' : 's'} · position {r.position}
              </span>
            </span>
            {r.id === value && <Check size={13} color="var(--cc-ok)" />}
          </button>
        ))}
      </DropShell>
      {stale && (
        <div className="cc-alert cc-alert-error" style={{ marginTop: 6, fontSize: 12 }}>
          ⚠️ Previously selected role is unavailable. Choose another role.
        </div>
      )}
      {hierarchyBlocked && current && (
        <div className="cc-alert cc-alert-error" style={{ marginTop: 6, fontSize: 12 }}>
          <ShieldAlert size={13} style={{ verticalAlign: -2 }} /> @{current.name} sits above the bot&apos;s highest role.
          Move the bot&apos;s role above it in Discord → Server Settings → Roles before using this role.
        </div>
      )}
    </div>
  );
}

// ── Member selector ────────────────────────────────────────────────────────
export function DiscordMemberSelect({
  members, value, onChange, disabled, loading, allowClear = true, excludeBots = false,
}: {
  members: GuildMember[];
  value: string;
  onChange: (id: string, member?: GuildMember) => void;
  disabled?: boolean;
  loading?: boolean;
  allowClear?: boolean;
  excludeBots?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const pool = excludeBots ? members.filter((m) => !m.bot) : members;
    const q = query.trim().toLowerCase();
    if (!q) return pool.slice(0, 100);
    return pool.filter(
      (m) => m.name.toLowerCase().includes(q) || (m.username ?? '').toLowerCase().includes(q) || m.id.includes(q),
    ).slice(0, 100);
  }, [members, query, excludeBots]);

  const current = members.find((m) => m.id === value) || null;
  const stale = value !== '' && !current;

  return (
    <div>
      <DropShell
        open={open}
        onToggle={() => { setOpen((o) => !o); setQuery(''); }}
        disabled={disabled}
        loading={loading}
        placeholder="Search members…"
        buttonLabel={current ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {current.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.avatar} alt="" width={18} height={18} style={{ borderRadius: 9 }} />
            )}
            {current.name}
            <span style={{ color: 'var(--cc-text-faint)', fontSize: 11.5 }}>@{current.username ?? current.name}</span>
          </span>
        ) : stale ? 'Previously selected member is unavailable' : null}
        onClear={() => onChange('')}
        canClear={allowClear && value !== ''}
      >
        <SearchBox value={query} onChange={setQuery} placeholder="Search by name, username or ID…" />
        {filtered.length === 0 && (
          <div style={{ padding: '12px 8px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
            {members.length === 0 ? 'No members returned by Discord.' : query ? 'No members match.' : 'Type to search members.'}
          </div>
        )}
        {filtered.map((m) => (
          <button
            key={m.id}
            role="option"
            aria-selected={m.id === value}
            onClick={() => { onChange(m.id, m); setOpen(false); }}
            style={optionStyle(m.id === value)}
          >
            {m.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatar} alt="" width={24} height={24} style={{ borderRadius: 12, flexShrink: 0 }} />
            ) : (
              <span style={{
                width: 24, height: 24, borderRadius: 12, background: 'var(--cc-accent-soft)', flexShrink: 0,
                display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
              }}>
                {m.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name}
                {m.bot && <span style={{ marginLeft: 6, fontSize: 9, background: 'rgba(88,101,242,0.4)', borderRadius: 4, padding: '1px 5px' }}>BOT</span>}
              </span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--cc-text-faint)' }}>@{m.username ?? m.name}</span>
            </span>
            {m.id === value && <Check size={13} color="var(--cc-ok)" />}
          </button>
        ))}
      </DropShell>
      {stale && (
        <div className="cc-alert cc-alert-error" style={{ marginTop: 6, fontSize: 12 }}>
          ⚠️ Previously selected member is unavailable (left the server or ID changed). Choose another member.
        </div>
      )}
    </div>
  );
}

// ── Multi-select (chips + add) ─────────────────────────────────────────────
export function DiscordMultiSelect({
  options, value, onChange, disabled, label,
}: {
  options: Array<{ id: string; label: string; sub?: string; icon?: React.ReactNode }>;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !value.includes(o.id))
      .filter((o) => !q || o.label.toLowerCase().includes(q))
      .slice(0, 50);
  }, [options, value, query]);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: value.length ? 8 : 0 }}>
        {value.map((id) => {
          const o = byId.get(id);
          return (
            <span
              key={id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                background: 'var(--cc-accent-soft)', borderRadius: 8, padding: '5px 6px 5px 10px', color: '#fff',
              }}
            >
              {o?.icon}
              {o?.label ?? 'Unavailable — remove it'}
              <button
                type="button"
                aria-label={`Remove ${o?.label ?? id}`}
                onClick={() => onChange(value.filter((v) => v !== id))}
                disabled={disabled}
                style={{ background: 'none', border: 'none', color: 'var(--cc-text-dim)', cursor: 'pointer', display: 'inline-flex' }}
              >
                <X size={13} />
              </button>
            </span>
          );
        })}
      </div>
      {!adding ? (
        <button type="button" className="cc-btn" onClick={() => { setAdding(true); setQuery(''); }} disabled={disabled} style={{ fontSize: 12.5 }}>
          + Add {label}
        </button>
      ) : (
        <div className="cc-card" style={{ padding: 8, background: '#15151d' }}>
          <SearchBox value={query} onChange={setQuery} placeholder={`Search ${label}…`} />
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {candidates.length === 0 && (
              <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>Nothing left to add.</div>
            )}
            {candidates.map((o) => (
              <button key={o.id} onClick={() => { onChange([...value, o.id]); setAdding(false); }} style={optionStyle(false)}>
                {o.icon}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                {o.sub && <span style={{ fontSize: 10.5, color: 'var(--cc-text-faint)' }}>{o.sub}</span>}
              </button>
            ))}
          </div>
          <button type="button" className="cc-link" onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, marginTop: 6 }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ── Permission status checklist ────────────────────────────────────────────
export interface ValidateCheck {
  key: string;
  label: string;
  ok: boolean;
}

export async function validateSelection(
  guildId: string,
  kind: 'channel' | 'category' | 'role' | 'member',
  id: string,
  require: string[] = [],
): Promise<{ valid: boolean; objectName: string | null; checks: ValidateCheck[]; message: string }> {
  const resp = await fetch('/api/dashboard/resources/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId, kind, id, require }),
  });
  const data = (await resp.json().catch(() => null)) as {
    valid?: boolean; objectName?: string | null; checks?: ValidateCheck[]; message?: string; error?: string;
  } | null;
  if (!resp.ok || !data) {
    return { valid: false, objectName: null, checks: [], message: data && 'error' in data && typeof data.error === 'string' ? data.error : `Validation failed (HTTP ${resp.status}).` };
  }
  return {
    valid: Boolean(data.valid),
    objectName: data.objectName ?? null,
    checks: data.checks ?? [],
    message: data.message || '',
  };
}

export function DiscordPermissionStatus({
  checks, message, valid, checking,
}: {
  checks: ValidateCheck[];
  message: string;
  valid: boolean;
  checking: boolean;
}) {
  if (checking) {
    return <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--cc-text-faint)' }}>Checking bot permissions…</p>;
  }
  if (checks.length === 0) return null;
  return (
    <div
      className={valid ? 'cc-alert cc-alert-ok' : 'cc-alert cc-alert-error'}
      style={{ marginTop: 8, fontSize: 12 }}
      role="status"
    >
      <div style={{ display: 'grid', gap: 3, marginBottom: message ? 6 : 0 }}>
        {checks.map((c) => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ color: c.ok ? 'var(--cc-ok)' : '#ff8a8a', fontWeight: 700 }}>{c.ok ? '✓' : '✕'}</span>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
      {message && <div>{message}</div>}
    </div>
  );
}

// ── Friendly error + refresh bar ───────────────────────────────────────────
// The headline ALWAYS matches the backend `code` — a Discord outage, an
// offline bot, a database failure and a genuine permission gap each get
// their own message. Nothing here ever claims "no permission" unless the
// backend actually returned NOT_GUILD_MEMBER / INSUFFICIENT_GUILD_PERMISSION.
export function statusMessage(code: string, detail: string): { title: string; hint: string } {
  switch (code) {
    case 'AUTH_REQUIRED':
      return {
        title: 'Your Discord sign-in expired.',
        hint: detail || 'Sign in with Discord again, then retry.',
      };
    case 'NOT_GUILD_MEMBER':
      return {
        title: "You're not a member of this server.",
        hint: detail || 'Join the server in Discord, then refresh the server list.',
      };
    case 'INSUFFICIENT_GUILD_PERMISSION':
      return {
        title: "You don't have permission to manage this server.",
        hint: detail || 'Ask a server admin for Manage Server permission.',
      };
    case 'BOT_NOT_INSTALLED':
      return {
        title: 'MuraBot is not installed on this server.',
        hint: detail || 'Invite the bot first — pick the server in the top bar.',
      };
    case 'BOT_OFFLINE':
      return {
        title: 'Muragoods is currently offline.',
        hint: detail || 'Your server configuration can still be viewed, but live bot actions may be unavailable. Retry in a moment.',
      };
    case 'DISCORD_API_ERROR':
    case 'MEMBER_FETCH_FAILED':
    case 'ROLE_FETCH_FAILED':
    case 'CHANNEL_FETCH_FAILED':
      return {
        title: "Discord server data couldn't be loaded.",
        hint: detail || 'Discord is temporarily unavailable. Try again.',
      };
    case 'MODERATION_DATA_FAILED':
    case 'DATABASE_ERROR':
      return {
        title: "Moderation data couldn't be loaded.",
        hint: detail || 'The Discord server is available, but the moderation database could not be reached.',
      };
    default:
      return {
        title: "Couldn't load server data.",
        hint: detail || 'Retry — if this persists, check the diagnostics endpoint output.',
      };
  }
}

export function ResourceStatusBar({
  loading, error, onRefresh, lastLabel, code = '', retryable = true,
}: {
  loading: boolean;
  error: string;
  onRefresh: () => void;
  lastLabel?: string;
  code?: string;
  retryable?: boolean;
}) {
  if (loading) {
    return <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>Loading server data…</p>;
  }
  if (error) {
    const mapped = statusMessage(code, error);
    return (
      <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 12, fontSize: 12.5 }}>
        <strong>⚠️ {mapped.title}</strong>
        <div style={{ marginTop: 4 }}>{mapped.hint}</div>
        {retryable && (
          <button className="cc-btn" style={{ marginTop: 8, fontSize: 12 }} onClick={onRefresh}>
            <RefreshCw size={13} /> Retry
          </button>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      {lastLabel && <span style={{ fontSize: 11, color: 'var(--cc-text-faint)' }}>{lastLabel}</span>}
      <button
        className="cc-link"
        onClick={onRefresh}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}
      >
        <RefreshCw size={12} /> Refresh
      </button>
    </div>
  );
}
