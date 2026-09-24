'use client';

import { useCallback, useEffect, useDeferredValue, useMemo, useState, type CSSProperties } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { DiscordChannelSelect, DiscordMemberSelect } from '../../components/selectors';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  FolderOpen,
  LockKeyhole,
  Pencil,
  RefreshCw,
  Search,
  Unlock,
  UserCheck,
  UserMinus,
  UserPlus,
} from 'lucide-react';

type StatusFilter = 'all' | 'open' | 'closed';
type ActionName = 'assign' | 'unassign' | 'claim' | 'close' | 'reopen' | 'lock' | 'unlock' | 'rename' | 'move';

interface DashboardGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  members: number | null;
}

interface Ticket {
  id: string;
  channelId: string;
  channelName: string;
  subject: string;
  creatorId: string;
  creatorName: string;
  assignedStaff: Array<{ id: string; name: string }>;
  assigneeId: string;
  createdAt: string;
  lastActivity: string;
  closedAt?: string;
  categoryId: string;
  status: 'open' | 'closed';
  locked: boolean;
}

interface TicketStats {
  open: number;
  closed: number;
  avgResolutionMs: number;
  staffActivity: Array<{ userId: string; ticketsHandled: number }>;
  ticketsPerDay: Array<{ date: string; count: number }>;
}

interface ResourceData {
  channels: Array<{ id: string; name: string; type: number; parentId: string | null }>;
  roles: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string; username?: string }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ListResponse {
  success: boolean;
  tickets: Ticket[];
  pagination: Pagination;
  error?: string;
}

interface StatsResponse {
  success: boolean;
  open: number;
  closed: number;
  avgResolutionMs: number;
  staffActivity: Array<{ userId: string; ticketsHandled: number }>;
  ticketsPerDay: Array<{ date: string; count: number }>;
  error?: string;
}

interface PatchResponse {
  success: boolean;
  ticket?: Ticket;
  error?: string;
}

interface ApiError extends Error {
  status: number;
}

interface ModalState {
  kind: 'assign' | 'unassign' | 'rename' | 'move';
  ticket: Ticket;
  value: string;
}

const glass: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
};

const muted: CSSProperties = {
  color: 'rgba(255,255,255,0.5)',
  fontSize: 12,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  color: '#f5f5f7',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 12px',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9,
  background: 'rgba(255,255,255,0.06)',
  color: '#f5f5f7',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const actionStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 7px',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 7,
  background: 'rgba(255,255,255,0.045)',
  color: 'rgba(255,255,255,0.72)',
  fontSize: 10.5,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as { error?: string; success?: boolean } & T;
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as ApiError;
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(milliseconds: number): string {
  if (!milliseconds || milliseconds < 0) return '—';
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function shortId(value: string): string {
  return value ? `#${value.slice(-6)}` : '—';
}

function statusColor(status: Ticket['status'], locked: boolean): string {
  if (locked) return '#f6c453';
  return status === 'open' ? '#2ECC40' : '#ff6b6b';
}

function ActionButton({ label, icon, onClick, disabled, title }: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title} style={actionStyle}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function TicketCenterPage() {
  const { token, setToken, selected, setSelected, guilds, setGuilds, loginUrl } = useGuild();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats>({
    open: 0,
    closed: 0,
    avgResolutionMs: 0,
    staffActivity: [],
    ticketsPerDay: [],
  });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [resources, setResources] = useState<ResourceData | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyAction, setBusyAction] = useState<ActionName | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  const clearAuthentication = useCallback(() => {
    setToken('');
    setSelected(null);
    setGuilds([]);
    setError('Your Discord session expired. Please connect again.');
  }, [setGuilds, setSelected, setToken]);

  const loadData = useCallback(async () => {
    if (!token || !selected) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        guildId: selected.id,
        status: statusFilter,
        page: String(page),
        limit: '50',
      });
      if (deferredSearch.trim()) params.set('search', deferredSearch.trim());

      const [listResponse, statsResponse] = await Promise.all([
        requestJson<ListResponse>(`/api/dashboard/tickets-center?${params.toString()}`, {
          headers: { 'x-discord-token': token },
        }),
        requestJson<StatsResponse>(`/api/dashboard/tickets-center/stats?guildId=${encodeURIComponent(selected.id)}`, {
          headers: { 'x-discord-token': token },
        }),
      ]);

      setTickets(listResponse.tickets || []);
      setPagination(listResponse.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      setStats({
        open: statsResponse.open || 0,
        closed: statsResponse.closed || 0,
        avgResolutionMs: statsResponse.avgResolutionMs || 0,
        staffActivity: statsResponse.staffActivity || [],
        ticketsPerDay: statsResponse.ticketsPerDay || [],
      });

      try {
        const resourceResponse = await requestJson<{ success: boolean; channels?: ResourceData['channels']; roles?: ResourceData['roles']; members?: ResourceData['members']; error?: string }>(
          `/api/dashboard/resources?guildId=${encodeURIComponent(selected.id)}`,
          { headers: { 'x-discord-token': token } },
        );
        if (resourceResponse.success) {
          setResources({
            channels: resourceResponse.channels || [],
            roles: resourceResponse.roles || [],
            members: resourceResponse.members || [],
          });
        }
      } catch {
        setResources(null);
      }
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.status === 401 || apiError.status === 403) clearAuthentication();
      else setError(apiError.message || 'Unable to load tickets');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clearAuthentication, deferredSearch, page, selected, statusFilter, token]);

  useEffect(() => {
    if (!token) {
      setGuilds([]);
      return;
    }
    requestJson<{ success: boolean; guilds?: DashboardGuild[]; error?: string }>('/api/dashboard/guilds', {
      headers: { 'x-discord-token': token },
    }).then((data) => {
      if (data.success) setGuilds(data.guilds || []);
      else setError((data as { error?: string }).error || 'Unable to load servers');
    }).catch(() => setError('Unable to load servers'));
  }, [setGuilds, token]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, deferredSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!token || !selected) return;
    const interval = window.setInterval(() => loadData(), 15000);
    return () => window.clearInterval(interval);
  }, [loadData, selected, token]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ticketsToday = useMemo(() => stats.ticketsPerDay.find((entry) => entry.date === today)?.count || 0, [stats.ticketsPerDay, today]);
  const members = useMemo(() => (resources?.members || []).filter((member) => member.id).sort((a, b) => a.name.localeCompare(b.name)), [resources]);
  const assignedLabel = (ticket: Ticket) => ticket.assignedStaff.length
    ? ticket.assignedStaff.map((staff) => staff.name).join(', ')
    : 'Unassigned';
  const totalPages = pagination.totalPages || 0;

  const runAction = async (ticket: Ticket, action: ActionName, payload: Record<string, string | undefined> = {}) => {
    if (!token || !selected) return;
    setBusyAction(action);
    setError('');
    setSuccess('');
    try {
      await requestJson<PatchResponse>(`/api/dashboard/tickets-center`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-discord-token': token },
        body: JSON.stringify({
          guildId: selected.id,
          channelId: ticket.channelId,
          action,
          ...payload,
        }),
      });
      setSuccess(`${action[0].toUpperCase()}${action.slice(1)} completed`);
      await loadData();
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.status === 401 || apiError.status === 403) clearAuthentication();
      else setError(apiError.message || 'Unable to update ticket');
    } finally {
      setBusyAction(null);
    }
  };

  const openAssign = (ticket: Ticket) => setModal({ kind: 'assign', ticket, value: '' });
  const openUnassign = (ticket: Ticket) => setModal({ kind: 'unassign', ticket, value: ticket.assigneeId || ticket.assignedStaff[0]?.id || '' });
  const openRename = (ticket: Ticket) => setModal({ kind: 'rename', ticket, value: ticket.channelName });
  const openMove = (ticket: Ticket) => setModal({ kind: 'move', ticket, value: ticket.categoryId || '' });

  const submitModal = async () => {
    if (!modal) return;
    const value = modal.value.trim();
    if ((modal.kind === 'assign' || modal.kind === 'unassign') && !value) {
      setError('Select a staff member');
      return;
    }
    if (modal.kind === 'rename' && !value) {
      setError('Enter a channel name');
      return;
    }
    if (modal.kind === 'move' && !value) {
      setError('Select a category');
      return;
    }
    const payload = modal.kind === 'rename'
      ? { newName: value }
      : modal.kind === 'move'
        ? { newCategoryId: value }
        : { assigneeId: value };
    const action = modal.kind === 'assign' ? 'assign' : modal.kind === 'unassign' ? 'unassign' : modal.kind;
    await runAction(modal.ticket, action, payload);
    setModal(null);
  };

  const openGuild = (guild: DashboardGuild) => {
    setSelected(guild);
    setError('');
    setSuccess('');
  };

  const card = (label: string, value: string, color: string, icon: React.ReactNode) => (
    <div style={{ ...glass, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}1f`, color }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...muted, marginBottom: 2 }}>{label}</div>
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{value}</div>
      </div>
    </div>
  );

  const actionDisabled = (ticket: Ticket, action: ActionName) => busyAction !== null && busyAction !== action;

  if (!token) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <p style={{ color: 'var(--cc-text-faint)', fontSize: 14, marginBottom: 18 }}>Sign in with Discord to manage tickets.</p>
        <a href={loginUrl} className="cc-btn cc-btn-primary">Continue with Discord</a>
      </div>
    );
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar to manage its tickets.</p>;
  }

  return (
    <div>
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
              <div>
                <p style={{ margin: '0 0 4px', color: 'var(--cc-accent)', fontWeight: 800, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff' }}>Ticket Management Center</h1>
                <p style={{ margin: '6px 0 0', ...muted }}>{selected.name}</p>
              </div>
              <button type="button" onClick={() => { setRefreshing(true); loadData(); }} disabled={refreshing} style={buttonStyle}>
                <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> Refresh
              </button>
            </div>

            {(error || success) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 16, borderRadius: 10, fontSize: 13,
                background: error ? 'rgba(229,9,20,0.1)' : 'rgba(46,204,64,0.1)', border: `1px solid ${error ? 'rgba(229,9,20,0.3)' : 'rgba(46,204,64,0.3)'}`,
                color: error ? '#ff8585' : '#6ee7a0',
              }}>
                {error ? <CircleX size={15} /> : <CheckCircle2 size={15} />}
                <span style={{ flex: 1 }}>{error || success}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
              {card('Open tickets', String(stats.open), '#2ECC40', <CheckCircle2 size={19} />)}
              {card('Closed tickets', String(stats.closed), '#ff6b6b', <CircleX size={19} />)}
              {card('Avg resolution', formatDuration(stats.avgResolutionMs), '#5865F2', <RefreshCw size={19} />)}
              {card('Tickets today', String(ticketsToday), '#f6c453', <FolderOpen size={19} />)}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {([
                ['all', 'All'],
                ['open', 'Open'],
                ['closed', 'Closed'],
              ] as Array<[StatusFilter, string]>).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setStatusFilter(value)} style={{
                  ...buttonStyle,
                  padding: '7px 15px',
                  background: statusFilter === value ? '#5865F2' : 'rgba(255,255,255,0.06)',
                  border: statusFilter === value ? '1px solid #5865F2' : '1px solid rgba(255,255,255,0.12)',
                  color: statusFilter === value ? '#fff' : 'rgba(255,255,255,0.65)',
                }}>{label}</button>
              ))}
              <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200 }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'rgba(255,255,255,0.4)' }} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search channel name or creator…" aria-label="Search tickets" style={{ ...inputStyle, paddingLeft: 36 }} />
              </div>
            </div>

            {loading ? (
              <div style={{ ...glass, padding: 60, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>Loading tickets…</div>
            ) : tickets.length === 0 ? (
              <div style={{ ...glass, padding: 50, textAlign: 'center' }}>
                <FolderOpen size={28} style={{ color: 'rgba(255,255,255,0.3)', marginBottom: 10 }} />
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>No tickets match this view.</p>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto', ...glass }}>
                  <table style={{ width: '100%', minWidth: 1080, borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>ID</th>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Channel</th>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Creator</th>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Assigned staff</th>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Created</th>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Last activity</th>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Status</th>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((ticket) => {
                        const statusTone = statusColor(ticket.status, ticket.locked);
                        return (
                          <tr key={`${ticket.channelId}-${ticket.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.75)' }}>{shortId(ticket.id)}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.channelName}</div>
                              <div style={{ ...muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject}</div>
                            </td>
                            <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.75)' }}>{ticket.creatorName}</td>
                            <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.75)', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignedLabel(ticket)}</td>
                            <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>{formatDate(ticket.createdAt)}</td>
                            <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>{formatDate(ticket.lastActivity)}</td>
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{ padding: '4px 8px', borderRadius: 20, background: `${statusTone}1a`, color: statusTone, fontWeight: 700, fontSize: 10.5 }}>
                                {ticket.status === 'open' ? 'Open' : 'Closed'}{ticket.locked ? ' · Locked' : ''}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                <ActionButton label="Assign" icon={<UserPlus size={12} />} title="Assign staff" disabled={actionDisabled(ticket, 'assign') || ticket.status === 'closed'} onClick={() => openAssign(ticket)} />
                                <ActionButton label="Unassign" icon={<UserMinus size={12} />} title="Unassign staff" disabled={actionDisabled(ticket, 'unassign') || ticket.assignedStaff.length === 0} onClick={() => openUnassign(ticket)} />
                                <ActionButton label="Claim" icon={<UserCheck size={12} />} title="Claim ticket" disabled={actionDisabled(ticket, 'claim') || ticket.status === 'closed'} onClick={() => runAction(ticket, 'claim')} />
                                <ActionButton label="Close" icon={<CircleX size={12} />} title="Close ticket" disabled={actionDisabled(ticket, 'close') || ticket.status === 'closed'} onClick={() => runAction(ticket, 'close')} />
                                <ActionButton label="Reopen" icon={<CheckCircle2 size={12} />} title="Reopen ticket" disabled={actionDisabled(ticket, 'reopen') || ticket.status !== 'closed'} onClick={() => runAction(ticket, 'reopen')} />
                                <ActionButton label={ticket.locked ? 'Unlock' : 'Lock'} icon={ticket.locked ? <Unlock size={12} /> : <LockKeyhole size={12} />} title={ticket.locked ? 'Unlock ticket' : 'Lock ticket'} disabled={actionDisabled(ticket, ticket.locked ? 'unlock' : 'lock') || ticket.status === 'closed'} onClick={() => runAction(ticket, ticket.locked ? 'unlock' : 'lock')} />
                                <ActionButton label="Rename" icon={<Pencil size={12} />} title="Rename channel" disabled={actionDisabled(ticket, 'rename')} onClick={() => openRename(ticket)} />
                                <ActionButton label="Move" icon={<FolderOpen size={12} />} title="Move category" disabled={actionDisabled(ticket, 'move')} onClick={() => openMove(ticket)} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                  <span style={{ ...muted }}>Showing {pagination.total === 0 ? 0 : (page - 1) * pagination.limit + 1}–{Math.min(page * pagination.limit, pagination.total)} of {pagination.total}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} style={{ ...buttonStyle, opacity: page <= 1 ? 0.4 : 1 }} aria-label="Previous page"><ChevronLeft size={14} /></button>
                    <span style={{ ...buttonStyle, cursor: 'default', minWidth: 72 }}>Page {page} of {totalPages || 1}</span>
                    <button type="button" onClick={() => setPage((current) => Math.min(totalPages || 1, current + 1))} disabled={page >= totalPages} style={{ ...buttonStyle, opacity: page >= totalPages ? 0.4 : 1 }} aria-label="Next page"><ChevronRight size={14} /></button>
                  </div>
                </div>
              </>
            )}
          </>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          <div role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 430, background: '#15151d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: '#e50914', fontWeight: 800, letterSpacing: 1.5 }}>TICKET ACTION</p>
                <h2 style={{ margin: 0, color: '#fff', fontSize: 19 }}>{modal.kind === 'assign' ? 'Assign staff' : modal.kind === 'unassign' ? 'Unassign staff' : modal.kind === 'rename' ? 'Rename ticket' : 'Move ticket'}</h2>
                <p style={{ margin: '6px 0 0', ...muted }}>{modal.ticket.channelName}</p>
              </div>
              <button type="button" onClick={() => setModal(null)} aria-label="Close dialog" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}><CircleX size={18} /></button>
            </div>

            {modal.kind === 'assign' || modal.kind === 'unassign' ? (
              <div style={{ marginBottom: 16 }}>
                <span style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 7 }}>{modal.kind === 'assign' ? 'Staff member' : 'Assigned staff member'}</span>
                <DiscordMemberSelect
                  members={members}
                  value={modal.value}
                  onChange={(id) => setModal({ ...modal, value: id })}
                />
              </div>
            ) : modal.kind === 'rename' ? (
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 7 }}>Channel name</span>
                <input value={modal.value} onChange={(event) => setModal({ ...modal, value: event.target.value })} maxLength={100} style={inputStyle} />
              </label>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <span style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 7 }}>New category</span>
                <DiscordChannelSelect
                  channels={(resources?.channels ?? []).map((c) => ({ ...c, parentName: null }))}
                  value={modal.value}
                  onChange={(id) => setModal({ ...modal, value: id })}
                  kinds="category"
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setModal(null)} style={buttonStyle}>Cancel</button>
              <button type="button" onClick={submitModal} disabled={busyAction !== null} style={{ ...buttonStyle, background: '#5865F2', border: 'none' }}>
                {busyAction ? 'Working…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
