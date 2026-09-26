'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { useGuildConfig } from '@/app/lib/use-guild-config';
import { apiFetch } from '../lib/api';
import {
  DiscordChannelSelect, DiscordMemberSelect, DiscordRoleSelect,
  ResourceStatusBar, kindsForKey, statusMessage, useGuildMemberSearch,
  useGuildResources, type GuildMember, type SearchedMember,
} from '../components/selectors';

interface MemberInfo {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  roles: { id: string; name: string; color: string }[];
  joinedAt: string | null;
  accountCreated: string;
  timedOutUntil: string | null;
  topRole: string;
}

interface WarningEntry { reason: string; moderatorId: string; at: string }
interface CaseEntry { caseId: number; action: string; reason: string; moderatorId: string; createdAt: string }

interface LookupResult {
  member: MemberInfo;
  warnings: WarningEntry[];
  cases: CaseEntry[];
}

interface OverviewStats {
  memberCount: number | null;
  warnings: number;
  activeTimeouts: number | null;
  bans: number | null;
  today: number;
  week: number;
  openCases: number;
  unknown: { bans: boolean; timeouts: boolean };
}

interface BanEntry { id: string; username: string; displayName: string; avatar: string | null; reason: string }

const TIMEOUT_PRESETS = [
  { label: '60 seconds', minutes: 1 },
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '6 hours', minutes: 360 },
  { label: '12 hours', minutes: 720 },
  { label: '1 day', minutes: 1440 },
  { label: '7 days', minutes: 10080 },
  { label: 'Custom…', minutes: -1 },
];

const ACTIONS = [
  { key: 'warn', label: '⚠️ Warn', primary: false },
  { key: 'mute', label: '🔇 Mute', primary: false },
  { key: 'hardmute', label: '⛓️ Hard Mute', primary: false },
  { key: 'unmute', label: '🔊 Unmute', primary: false },
  { key: 'timeout', label: '⏳ Timeout', primary: false },
  { key: 'removetimeout', label: '⏲️ Remove Timeout', primary: false },
  { key: 'kick', label: '👢 Kick', primary: false },
  { key: 'softban', label: '🧹 Softban', primary: false },
  { key: 'tempban', label: '⏳ Tempban', primary: false },
  { key: 'ban', label: '🔨 Ban', primary: true },
  { key: 'unban', label: '🔓 Unban', primary: false },
] as const;

const ACTION_BLURBS: Record<string, string> = {
  warn: 'Record a warning (DM sent, best-effort).',
  mute: 'Apply the configured Muterole. Empty duration = indefinite.',
  hardmute: 'Apply Muterole AND strip other roles (restored on unmute).',
  unmute: 'Remove the Muterole and restore stripped roles.',
  timeout: 'Discord-native timeout.',
  removetimeout: 'Lift an active timeout.',
  kick: 'Remove the member (can rejoin).',
  softban: 'Ban + instant unban to clear message history.',
  tempban: 'Ban with automatic unban when the duration expires.',
  ban: 'Ban the member. Works even if they already left.',
};

// ── Backend member finder ──────────────────────────────────────────────
// Shows the whole guild roster immediately (bulk-loaded with the page — no
// typing needed), and switches to guild-scoped server search once you type
// 2+ characters (debounced 300ms, bounded, abort-safe). Either way only the
// selected guild is ever queried and the Discord user ID stays internal.
// Three states stay distinct: loading… / no results / failed + retry.
function MemberFinder({
  guildId, value, onChange, disabled, bulk = [], bulkLoading = false,
}: {
  guildId: string;
  value: string;
  onChange: (id: string, member?: SearchedMember) => void;
  disabled?: boolean;
  bulk?: GuildMember[];
  bulkLoading?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<SearchedMember | null>(null);
  const q = query.trim();
  const useServerSearch = q.length >= 2;
  const { results, searching, searchError, searchCode } = useGuildMemberSearch(guildId, open && useServerSearch ? q : '');

  // Local view of the bulk roster (first 100, filtered as you type).
  const bulkShown: SearchedMember[] = (() => {
    const needle = q.toLowerCase();
    const pool = needle
      ? bulk.filter((m) =>
          m.name.toLowerCase().includes(needle) ||
          (m.username ?? '').toLowerCase().includes(needle) ||
          m.id.includes(q))
      : bulk;
    return pool.slice(0, 100).map((m) => ({
      id: m.id, username: m.username ?? m.name, displayName: m.name,
      avatar: m.avatar ?? null, bot: Boolean(m.bot),
    }));
  })();

  const shown = useServerSearch ? results : bulkShown;

  useEffect(() => {
    if (!value) setPicked(null);
  }, [value, guildId]);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            className="cc-input"
            value={picked ? `${picked.displayName} (@${picked.username})` : query}
            onChange={(e) => { setQuery(e.target.value); setPicked(null); onChange(''); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search members…"
            disabled={disabled}
            style={{ width: '100%' }}
            aria-label="Search members"
          />
        </div>
        {picked && (
          <button type="button" className="cc-btn" onClick={() => { setPicked(null); setQuery(''); onChange(''); }} aria-label="Clear member">
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="cc-card" style={{ position: 'absolute', zIndex: 120, top: 'calc(100% + 6px)', left: 0, right: 0, maxHeight: 280, overflowY: 'auto', padding: 8, background: '#15151d' }}>
          {(searching || (!useServerSearch && bulkLoading)) && <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>Loading members…</div>}
          {!searching && searchError && (
            <div style={{ padding: '10px 8px', fontSize: 12.5, color: '#ff8a8a' }}>
              <div><strong>⚠️ {statusMessage(searchCode, searchError).title}</strong></div>
              <div style={{ color: 'var(--cc-text-dim)', marginTop: 2 }}>{statusMessage(searchCode, searchError).hint}</div>
            </div>
          )}
          {!searching && !searchError && !bulkLoading && shown.length === 0 && (
            <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>
              {bulk.length === 0 && !useServerSearch
                ? 'No members loaded yet — wait a moment or use Refresh above.'
                : 'No members found.'}
            </div>
          )}
          {shown.map((m) => (
            <button
              key={m.id}
              onClick={() => { setPicked(m); setOpen(false); onChange(m.id, m); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: '8px 9px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: m.id === value ? 'var(--cc-accent-soft)' : 'transparent',
                color: '#fff', fontSize: 13, textAlign: 'left',
              }}
            >
              {m.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatar} alt="" width={24} height={24} style={{ borderRadius: 12, flexShrink: 0 }} />
              ) : (
                <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--cc-accent-soft)', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                  {m.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.displayName}
                  {m.bot && <span style={{ marginLeft: 6, fontSize: 9, background: 'rgba(88,101,242,0.4)', borderRadius: 4, padding: '1px 5px' }}>BOT</span>}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--cc-text-faint)' }}>@{m.username}</span>
              </span>
            </button>
          ))}
          {shown.length > 0 && (
            <button type="button" className="cc-link" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, marginTop: 6 }}>
              Done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ModerationPage() {
  const { token, selected } = useGuild();
  const { config, save, saveState, update } = useGuildConfig();
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [timeoutMinutes, setTimeoutMinutes] = useState(10);
  const [customMinutes, setCustomMinutes] = useState('30');
  const [banDeleteDays, setBanDeleteDays] = useState(0);
  const [unbanId, setUnbanId] = useState('');
  const [bans, setBans] = useState<BanEntry[]>([]);
  // Duration text for mute/hardmute/tempban (empty = indefinite for mutes).
  const [durationText, setDurationText] = useState('10m');
  const [roleUserId, setRoleUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  // ── User notes ──
  const [noteMemberId, setNoteMemberId] = useState('');
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState<Array<{ noteId: number; text: string; moderatorId: string; createdAt: string }>>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  // ── Lockdown ──
  const [lockScope, setLockScope] = useState<'channel' | 'server'>('channel');
  const [lockChannelId, setLockChannelId] = useState('');
  const [lockDuration, setLockDuration] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [locking, setLocking] = useState(false);
  // ── Purge ──
  const [purgeChannelId, setPurgeChannelId] = useState('');
  const [purgeKind, setPurgeKind] = useState('all');
  const [purgeCount, setPurgeCount] = useState(20);
  const [purgeUserId, setPurgeUserId] = useState('');
  const [purgeText, setPurgeText] = useState('');
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [overviewError, setOverviewError] = useState('');
  const [overviewCode, setOverviewCode] = useState('');
  const { resources, loading: resLoading, error: resError, code: resCode, retryable: resRetryable, refresh: resRefresh } = useGuildResources(selected?.id ?? null);

  const lookupFor = useCallback(async (id: string) => {
    if (!token || !selected || !/^\d{5,25}$/.test(id)) {
      setError('Pick a member from the list — IDs are handled automatically.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setResult(null);
    const resp = await apiFetch<{ success: boolean; member: MemberInfo; warnings: WarningEntry[]; cases: CaseEntry[] }>(
      `/api/dashboard/moderation?guildId=${selected.id}&userId=${id}`,
      { token },
    );
    if (resp.ok && resp.data.success) {
      setResult({ member: resp.data.member, warnings: resp.data.warnings, cases: resp.data.cases });
    } else {
      setError(resp.ok ? (resp.data as unknown as { error?: string }).error || 'Lookup failed' : resp.error);
    }
    setBusy(false);
  }, [token, selected]);

  const loadOverview = useCallback(async () => {
    if (!token || !selected) return;
    setOverviewError('');
    setOverviewCode('');
    const resp = await apiFetch<{
      success: boolean; error?: string; code?: string;
      guild?: { memberCount?: number | null };
      moderation?: {
        warnings?: number; activeTimeouts?: number | null; bans?: number | null;
        actionsToday?: number; actionsThisWeek?: number; openCases?: number;
      };
      unknown?: { bans?: boolean; timeouts?: boolean };
    }>(`/api/dashboard/guilds/${selected.id}/overview`, { token });
    if (resp.ok && resp.data.success) {
      const m = resp.data.moderation ?? {};
      setOverview({
        memberCount: typeof resp.data.guild?.memberCount === 'number' ? resp.data.guild.memberCount : null,
        warnings: typeof m.warnings === 'number' ? m.warnings : 0,
        activeTimeouts: typeof m.activeTimeouts === 'number' ? m.activeTimeouts : null,
        bans: typeof m.bans === 'number' ? m.bans : null,
        today: typeof m.actionsToday === 'number' ? m.actionsToday : 0,
        week: typeof m.actionsThisWeek === 'number' ? m.actionsThisWeek : 0,
        openCases: typeof m.openCases === 'number' ? m.openCases : 0,
        unknown: {
          bans: resp.data.unknown?.bans ?? m.bans == null,
          timeouts: resp.data.unknown?.timeouts ?? m.activeTimeouts == null,
        },
      });
    } else {
      setOverview(null);
      setOverviewError(resp.ok ? resp.data.error || 'Could not load overview' : resp.error);
      setOverviewCode(resp.ok ? resp.data.code || '' : (resp as { code?: string }).code || '');
    }
  }, [token, selected]);

  const loadBans = useCallback(async () => {
    if (!token || !selected) return;
    const resp = await apiFetch<{ success: boolean; bans: BanEntry[]; error?: string }>(
      `/api/dashboard/moderation/tools?op=bans&guildId=${selected.id}`, { token });
    if (resp.ok && resp.data.success) setBans(resp.data.bans);
  }, [token, selected]);

  useEffect(() => {
    setResult(null);
    setUserId('');
    setOverview(null);
    setOverviewError('');
    setOverviewCode('');
    setError('');
    setNotice('');
    setBans([]);
    setRoleUserId('');
    setRoleId('');
    setUnbanId('');
    setConfirming(null);
    setReason('');
    setDurationText('10m');
    setNoteMemberId('');
    setNoteText('');
    setNotes([]);
    setLockChannelId('');
    setLockDuration('');
    setLockReason('');
    setPurgeChannelId('');
    setPurgeUserId('');
    setPurgeText('');
    setPurgeConfirm(false);
    void loadOverview();
    void loadBans();
  }, [selected?.id, loadOverview, loadBans]);

  const lookup = () => void lookupFor(userId);
  const effectiveMinutes = timeoutMinutes === -1 ? Math.max(1, Math.min(40320, Number(customMinutes) || 30)) : timeoutMinutes;

  const showActionError = (code: string | undefined, fallback: string) => {
    const mapped = statusMessage(code || '', fallback);
    setError(`${mapped.title} ${mapped.hint}`);
  };

  const act = async (action: string) => {
    if (!token || !selected) return;
    const target = action === 'unban' ? unbanId : result?.member.id;
    if (!target || !/^\d{5,25}$/.test(target)) {
      setError(action === 'unban' ? 'Pick a banned user from the list first.' : 'Look up a member first.');
      return;
    }
    if ((action === 'mute' || action === 'hardmute' || action === 'tempban') && durationText.trim()) {
      if (!/^\s*\d+\s*[mhdw]?\s*$/i.test(durationText)) {
        setError('Duration not understood — try 10m, 1h, 7d (empty = indefinite for mutes).');
        return;
      }
    }
    if (action === 'tempban' && !durationText.trim()) {
      setError('Tempban needs a duration — try 1h, 7d.');
      return;
    }
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; caseId?: number; warningCount?: number; dmSent?: boolean; error?: string; code?: string }>('/api/dashboard/moderation', {
      method: 'POST',
      token,
      body: {
        guildId: selected.id, userId: target, action,
        reason: reason.trim() || 'No reason given (dashboard)',
        minutes: action === 'timeout' ? effectiveMinutes : action === 'tempban' ? undefined : effectiveMinutes,
        duration: (action === 'mute' || action === 'hardmute' || action === 'tempban') ? durationText.trim() : undefined,
        deleteMessageDays: banDeleteDays,
      },
    });
    if (resp.ok && resp.data.success) {
      const extras: string[] = [];
      if (resp.data.warningCount) extras.push(`warning #${resp.data.warningCount}`);
      if (resp.data.dmSent === false) extras.push('DM not delivered');
      setNotice(`✅ ${action.toUpperCase()} executed on Discord — case #${resp.data.caseId ?? '?'}${extras.length ? ` (${extras.join(', ')})` : ''}`);
      setConfirming(null);
      setReason('');
      setUnbanId('');
      void loadOverview();
      void loadBans();
      if (result && action !== 'unban') {
        const refresh = await apiFetch<{ success: boolean; member: MemberInfo; warnings: WarningEntry[]; cases: CaseEntry[] }>(
          `/api/dashboard/moderation?guildId=${selected.id}&userId=${result.member.id}`, { token });
        if (refresh.ok && refresh.data.success) {
          setResult({ member: refresh.data.member, warnings: refresh.data.warnings, cases: refresh.data.cases });
        }
      } else {
        setResult(null);
        setUserId('');
      }
    } else {
      showActionError(resp.ok ? resp.data.code : (resp as { code?: string }).code,
        resp.ok ? (resp.data as unknown as { error?: string }).error || 'Action failed' : resp.error);
    }
    setBusy(false);
  };

  const removeWarning = async (index: number) => {
    if (!token || !selected || !result) return;
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; error?: string }>('/api/dashboard/moderation/tools', {
      method: 'DELETE',
      token,
      body: { guildId: selected.id, userId: result.member.id, index },
    });
    if (resp.ok && resp.data.success) {
      setNotice(`✅ Warning #${index} removed.`);
      void lookupFor(result.member.id);
      void loadOverview();
    } else {
      setError(resp.ok ? (resp.data as unknown as { error?: string }).error || 'Could not remove warning' : resp.error);
    }
    setBusy(false);
  };

  const clearWarnings = async () => {
    if (!token || !selected || !result) return;
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; error?: string }>('/api/dashboard/moderation/tools', {
      method: 'POST',
      token,
      body: { op: 'clear-warnings', guildId: selected.id, userId: result.member.id },
    });
    if (resp.ok && resp.data.success) {
      setNotice('✅ All warnings cleared.');
      void lookupFor(result.member.id);
      void loadOverview();
    } else {
      setError(resp.ok ? (resp.data as unknown as { error?: string }).error || 'Could not clear warnings' : resp.error);
    }
    setBusy(false);
  };

  // ── User notes (same store as /notes commands) ──
  const loadNotes = useCallback(async (memberId: string) => {
    if (!token || !selected || !/^\d{5,25}$/.test(memberId)) {
      setNotes([]);
      return;
    }
    setNotesLoading(true);
    const resp = await apiFetch<{ success: boolean; notes: Array<{ noteId: number; text: string; moderatorId: string; createdAt: string }>; error?: string; code?: string }>(
      `/api/dashboard/moderation/notes?guildId=${selected.id}&userId=${memberId}`, { token });
    if (resp.ok && resp.data.success) setNotes(resp.data.notes);
    else {
      setNotes([]);
      showActionError(resp.ok ? resp.data.code : (resp as { code?: string }).code,
        resp.ok ? resp.data.error || 'Could not load notes' : resp.error);
    }
    setNotesLoading(false);
  }, [token, selected]);

  const addNote = async () => {
    if (!token || !selected || !noteMemberId || !noteText.trim()) {
      setError('Pick a member and write the note first.');
      return;
    }
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; noteId?: number; error?: string; code?: string }>('/api/dashboard/moderation/notes', {
      method: 'POST', token, body: { guildId: selected.id, userId: noteMemberId, text: noteText.trim() },
    });
    if (resp.ok && resp.data.success) {
      setNotice(`✅ Note #${resp.data.noteId} saved.`);
      setNoteText('');
      void loadNotes(noteMemberId);
    } else {
      showActionError(resp.ok ? resp.data.code : (resp as { code?: string }).code,
        resp.ok ? resp.data.error || 'Could not save note' : resp.error);
    }
    setBusy(false);
  };

  const removeNote = async (noteId: number) => {
    if (!token || !selected) return;
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; error?: string; code?: string }>('/api/dashboard/moderation/notes', {
      method: 'DELETE', token, body: { guildId: selected.id, noteId },
    });
    if (resp.ok && resp.data.success) {
      setNotice(`✅ Note #${noteId} removed.`);
      void loadNotes(noteMemberId);
    } else {
      showActionError(resp.ok ? resp.data.code : (resp as { code?: string }).code,
        resp.ok ? resp.data.error || 'Could not remove note' : resp.error);
    }
    setBusy(false);
  };

  const clearNotes = async () => {
    if (!token || !selected || !noteMemberId) return;
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; cleared?: number; error?: string; code?: string }>('/api/dashboard/moderation/notes', {
      method: 'DELETE', token, body: { guildId: selected.id, userId: noteMemberId, all: true },
    });
    if (resp.ok && resp.data.success) {
      setNotice(`✅ Cleared ${resp.data.cleared ?? 0} notes.`);
      void loadNotes(noteMemberId);
    } else {
      showActionError(resp.ok ? resp.data.code : (resp as { code?: string }).code,
        resp.ok ? resp.data.error || 'Could not clear notes' : resp.error);
    }
    setBusy(false);
  };

  // ── Lockdown (same service as /lockdown commands) ──
  const runLockdown = async (unlock: boolean) => {
    if (!token || !selected) return;
    if (lockScope === 'channel' && !lockChannelId) {
      setError('Pick a channel first.');
      return;
    }
    if (lockDuration.trim() && !/^\s*\d+\s*[mhdw]?\s*$/i.test(lockDuration)) {
      setError('Duration not understood — try 30m, 2h, 1d (empty = stay locked).');
      return;
    }
    setLocking(true);
    setError('');
    const resp = await apiFetch<{
      success: boolean; caseId?: number; locked?: string[]; restored?: string[]; error?: string; code?: string;
    }>('/api/dashboard/moderation/lockdown', {
      method: 'POST', token,
      body: {
        guildId: selected.id, scope: lockScope, channelId: lockChannelId || undefined,
        duration: lockDuration.trim() || undefined, reason: lockReason.trim() || 'Dashboard lockdown',
        unlock,
      },
    });
    if (resp.ok && resp.data.success) {
      const what = unlock
        ? `restored ${resp.data.restored?.length ?? 0} channels`
        : lockScope === 'server' ? `locked ${resp.data.locked?.length ?? 0} channels` : 'channel locked';
      setNotice(`✅ ${unlock ? 'Unlocked' : 'Locked'} — ${what} (case #${resp.data.caseId ?? '?'})`);
      setLockReason('');
    } else {
      showActionError(resp.ok ? resp.data.code : (resp as { code?: string }).code,
        resp.ok ? resp.data.error || 'Lockdown failed' : resp.error);
    }
    setLocking(false);
  };

  // ── Purge (same service as /purge commands) ──
  const runPurge = async () => {
    if (!token || !selected) return;
    if (!purgeChannelId) {
      setError('Pick a channel first.');
      return;
    }
    if (purgeKind === 'user' && !purgeUserId) {
      setError('Pick a member for user purge.');
      return;
    }
    if (purgeKind === 'contains' && !purgeText.trim()) {
      setError('Search text is required for contains purge.');
      return;
    }
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; caseId?: number; deleted?: number; scanned?: number; error?: string; code?: string }>(
      '/api/dashboard/moderation/purge', {
        method: 'POST', token,
        body: {
          guildId: selected.id, channelId: purgeChannelId, kind: purgeKind,
          count: purgeCount, userId: purgeUserId || undefined, text: purgeText,
          includePinned: false,
        },
      });
    if (resp.ok && resp.data.success) {
      setNotice(`✅ Purged ${resp.data.deleted ?? 0} ${purgeKind} messages (scanned ${resp.data.scanned ?? 0}) — case #${resp.data.caseId ?? '?'}`);
      setPurgeConfirm(false);
    } else {
      showActionError(resp.ok ? resp.data.code : (resp as { code?: string }).code,
        resp.ok ? resp.data.error || 'Purge failed' : resp.error);
    }
    setBusy(false);
  };

  const applyRole = async (op: 'add' | 'remove') => {
    if (!token || !selected || !roleUserId || !roleId) {
      setError('Pick a member and a role first.');
      return;
    }
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; caseId?: number; error?: string }>('/api/dashboard/moderation/tools', {
      method: 'POST',
      token,
      body: { op: 'role', guildId: selected.id, userId: roleUserId, roleId, action: op },
    });
    if (resp.ok && resp.data.success) {
      setNotice(`✅ Role ${op === 'add' ? 'added' : 'removed'} — case #${resp.data.caseId ?? '?'}`);
      setRoleUserId('');
      setRoleId('');
      void loadOverview();
    } else {
      setError(resp.ok ? (resp.data as unknown as { error?: string }).error || 'Role change failed' : resp.error);
    }
    setBusy(false);
  };

  // ── Action policies (per-guild escalation + DM toggles) ──
  const moderation = (config?.moderation ?? {}) as Record<string, unknown>;
  const thresholds = (Array.isArray(moderation.warnThresholds) && (moderation.warnThresholds as unknown[]).length
    ? (moderation.warnThresholds as Array<{ count: number; action: string; durationMinutes: number }>)
    : [{ count: 3, action: 'timeout', durationMinutes: 60 }]);
  const escalation = (Array.isArray(moderation.escalation) && (moderation.escalation as unknown[]).length
    ? (moderation.escalation as string[]).slice(0, 5)
    : ['warn', 'timeout', 'timeout', 'kick', 'ban']);
  while (escalation.length < 5) escalation.push('warn');
  const dm = (moderation.dmNotifications ?? {}) as Record<string, boolean>;
  const setThreshold = (i: number, patch: Partial<{ count: number; action: string; durationMinutes: number }>) => {
    update('moderation', 'warnThresholds', thresholds.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  };
  const addThreshold = () => {
    if (thresholds.length >= 5) return;
    update('moderation', 'warnThresholds', [...thresholds, { count: (thresholds[thresholds.length - 1]?.count || 0) + 2, action: 'timeout', durationMinutes: 60 }]);
  };
  const removeThreshold = (i: number) => {
    update('moderation', 'warnThresholds', thresholds.filter((_, j) => j !== i));
  };

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to moderate.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar.</p>;
  }

  const stat = (label: string, value: string | number, unavailable = false) => (
    <div className="cc-card" style={{ padding: '12px 16px' }} title={unavailable ? 'Discord did not return this value (missing bot permission or unavailable intent data) — retry or check bot permissions' : undefined}>
      <div className="cc-section-label">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: unavailable ? 'var(--cc-text-faint)' : '#fff', marginTop: 2 }}>{value}</div>
      {unavailable && <div style={{ fontSize: 10.5, color: 'var(--cc-text-faint)', marginTop: 2 }}>Unavailable</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 960 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>🛡️ Moderation — {selected.name}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        Actions execute on Discord through the bot. Hierarchy, permissions and target state are
        re-verified server-side at execution time — failures here are real failures.
      </p>

      {/* Overview */}
      <div className="cc-section-label" style={{ marginBottom: 10 }}>Overview</div>
      {overviewError && (
        <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 12 }}>
          <strong>⚠️ {statusMessage(overviewCode, overviewError).title}</strong>
          <div style={{ marginTop: 4 }}>{statusMessage(overviewCode, overviewError).hint}</div>
          <button className="cc-btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => void loadOverview()}>
            Retry
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 22 }}>
        {stat('Members', overview?.memberCount ?? '—')}
        {stat('Warnings', overview?.warnings ?? '—')}
        {overview?.unknown.timeouts
          ? stat('Active timeouts', '—', true)
          : stat('Active timeouts', overview?.activeTimeouts ?? '—')}
        {overview?.unknown.bans
          ? stat('Bans', '—', true)
          : stat('Bans', overview?.bans ?? '—')}
        {stat('Actions today', overview?.today ?? '—')}
        {stat('Actions this week', overview?.week ?? '—')}
        {stat('Open cases', overview?.openCases ?? '—')}
      </div>

      {/* Member lookup + actions */}
      <div className="cc-section-label" style={{ marginBottom: 10 }}>Actions</div>
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <ResourceStatusBar loading={resLoading} error={resError} code={resCode} retryable={resRetryable} onRefresh={resRefresh} />
        <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
          👮 Member lookup — pick a member, no IDs needed
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <MemberFinder
              guildId={selected.id}
              value={userId}
              onChange={(id) => { setUserId(id); if (id) void lookupFor(id); }}
              disabled={busy}
              bulk={resources?.members ?? []}
              bulkLoading={resLoading}
            />
          </div>
          <button className="cc-btn cc-btn-primary" onClick={lookup} disabled={busy || !userId}>
            {busy ? 'Working…' : 'Look up'}
          </button>
        </div>
      </div>

      {error && <div className="cc-alert cc-alert-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
      {notice && <div className="cc-alert cc-alert-ok" role="status" style={{ marginBottom: 14 }}>{notice}</div>}

      {result && (
        <>
          {/* Profile */}
          <div className="cc-card" style={{ padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              {result.member.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.member.avatar} alt="" width={56} height={56} style={{ borderRadius: 14 }} />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>
                  {result.member.displayName}
                  <span style={{ color: 'var(--cc-text-faint)', fontWeight: 400, fontSize: 13 }}> @{result.member.username}</span>
                </div>
                <div style={{ color: 'var(--cc-text-dim)', fontSize: 12.5, marginTop: 2 }}>
                  Top role: <strong style={{ color: '#fff' }}>{result.member.topRole}</strong>
                  {' · '}joined {result.member.joinedAt ? new Date(result.member.joinedAt).toLocaleDateString() : '—'}
                  {' · '}account {new Date(result.member.accountCreated).toLocaleDateString()}
                </div>
                {result.member.timedOutUntil && (
                  <span className="cc-chip cc-chip-warn" style={{ marginTop: 6, display: 'inline-block' }}>
                    🔇 Timed out until {new Date(result.member.timedOutUntil).toLocaleString()}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 300 }}>
                {result.member.roles.slice(0, 8).map((r) => (
                  <span key={r.id} className="cc-chip">{r.name}</span>
                ))}
                {result.member.roles.length > 8 && <span className="cc-chip">+{result.member.roles.length - 8}</span>}
              </div>
            </div>
          </div>

          {/* Warnings management */}
          <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ color: '#fff', fontSize: 14 }}>⚠️ Warnings ({result.warnings.length})</strong>
              {result.warnings.length > 0 && (
                <button className="cc-link" onClick={clearWarnings} disabled={busy}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}>
                  Clear all
                </button>
              )}
            </div>
            {result.warnings.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--cc-text-faint)', fontSize: 13 }}>Clean record.</p>
            ) : (
              <div style={{ display: 'grid', gap: 5 }}>
                {result.warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                    <span style={{ flex: 1 }}>
                      <strong style={{ color: '#fff' }}>#{i + 1}</strong> • {w.reason}{' '}
                      <span style={{ color: 'var(--cc-text-faint)' }}>— {new Date(w.at).toLocaleDateString()}</span>
                    </span>
                    <button className="cc-link" onClick={() => removeWarning(i + 1)} disabled={busy}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cases */}
          <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
            <strong style={{ color: '#fff', fontSize: 14 }}>📋 Cases ({result.cases.length})</strong>
            {result.cases.length === 0 ? (
              <p style={{ margin: '8px 0 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>No cases yet.</p>
            ) : (
              <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                {result.cases.slice(0, 6).map((c) => (
                  <div key={c.caseId} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                    <strong style={{ color: '#fff' }}>#{c.caseId}</strong> {c.action.toUpperCase()} — {c.reason.slice(0, 50)}
                    <span style={{ color: 'var(--cc-text-faint)' }}> · {new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="cc-card" style={{ padding: '16px 20px', marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Reason (recorded on the case)</label>
            <input
              className="cc-input" style={{ width: '100%', marginBottom: 12 }}
              placeholder="Why is this action being taken?"
              value={reason} onChange={(e) => setReason(e.target.value)}
            />
            {confirming === 'timeout' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'var(--cc-text-dim)' }}>Duration</label>
                <select className="cc-input" value={timeoutMinutes}
                  onChange={(e) => setTimeoutMinutes(Number(e.target.value))} style={{ maxWidth: 220 }}>
                  {TIMEOUT_PRESETS.map((p) => (
                    <option key={p.label} value={p.minutes}>{p.label}</option>
                  ))}
                </select>
                {timeoutMinutes === -1 && (
                  <input className="cc-input" type="number" min={1} max={40320} value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)} placeholder="Minutes" style={{ maxWidth: 140 }} />
                )}
              </div>
            )}
            {confirming === 'ban' || confirming === 'softban' ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'var(--cc-text-dim)' }}>Delete message history</label>
                <select className="cc-input" value={banDeleteDays}
                  onChange={(e) => setBanDeleteDays(Number(e.target.value))} style={{ maxWidth: 220 }}>
                  <option value={0}>None</option>
                  <option value={1}>Last 1 day</option>
                  <option value={7}>Last 7 days</option>
                </select>
              </div>
            ) : null}
            {confirming === 'mute' || confirming === 'hardmute' || confirming === 'tempban' ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'var(--cc-text-dim)' }}>Duration</label>
                <input className="cc-input" value={durationText}
                  onChange={(e) => setDurationText(e.target.value)}
                  placeholder={confirming === 'tempban' ? '1h (required)' : '10m, 1h, 7d (empty = indefinite)'}
                  style={{ maxWidth: 260 }} />
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ACTIONS.filter((a) => a.key !== 'unban').map((a) =>
                confirming === a.key ? (
                  <span key={a.key} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                      {a.label} <strong style={{ color: '#fff' }}>{result.member.displayName}</strong>
                      {a.key === 'timeout' ? ` for ${TIMEOUT_PRESETS.find((p) => p.minutes === timeoutMinutes)?.label ?? `${effectiveMinutes} min`}` : ''}
                      {(a.key === 'mute' || a.key === 'hardmute') && durationText.trim() ? ` for ${durationText.trim()}` : ''}
                      {a.key === 'tempban' ? ` for ${durationText.trim()}` : ''}?
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cc-text-faint)', width: '100%' }}>
                        {ACTION_BLURBS[a.key]}
                      </span>
                    </span>
                    <button className="cc-btn" style={{ borderColor: 'rgba(248,113,113,0.5)', color: '#ff8a8a' }}
                            onClick={() => act(a.key)} disabled={busy}>
                      {busy ? 'Executing…' : 'Confirm'}
                    </button>
                    <button className="cc-btn" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
                  </span>
                ) : (
                  <button key={a.key}
                          className={`cc-btn ${a.primary ? 'cc-btn-primary' : ''}`}
                          style={a.primary ? { borderColor: 'rgba(248,113,113,0.5)' } : undefined}
                          onClick={() => setConfirming(a.key)} disabled={busy}>
                    {a.label}
                  </button>
                ),
              )}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
              Destructive actions require confirmation. The bot re-checks role hierarchy and its own
              permissions on Discord at the moment you confirm — stale frontend state is never trusted.
            </p>
          </div>
        </>
      )}

      {/* Unban from the live ban list — no IDs */}
      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Bans</div>
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
          🔓 Unban — pick from the current ban list
        </label>
        {bans.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--cc-text-faint)' }}>No banned users right now.</p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <DiscordMemberSelect
                members={bans.map((b) => ({ id: b.id, name: b.displayName, username: b.username, avatar: b.avatar }))}
                value={unbanId}
                onChange={(id) => setUnbanId(id)}
                disabled={busy}
              />
            </div>
            <button className="cc-btn cc-btn-primary" onClick={() => { setConfirming('unban'); }} disabled={busy || !unbanId}>
              {busy ? 'Working…' : 'Unban'}
            </button>
            {confirming === 'unban' && unbanId && (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                Unban <strong style={{ color: '#fff' }}>{bans.find((b) => b.id === unbanId)?.displayName}</strong>?
                <button className="cc-btn" style={{ borderColor: 'rgba(248,113,113,0.5)', color: '#ff8a8a' }}
                        onClick={() => act('unban')} disabled={busy}>
                  {busy ? 'Executing…' : 'Confirm'}
                </button>
                <button className="cc-btn" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Role tools */}
      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Role tools</div>
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Member</label>
            <DiscordMemberSelect
              members={resources?.members ?? []}
              value={roleUserId}
              onChange={(id) => setRoleUserId(id)}
              loading={resLoading}
              disabled={busy}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Role</label>
            <DiscordRoleSelect
              roles={resources?.roles ?? []}
              value={roleId}
              onChange={(id) => setRoleId(id)}
              loading={resLoading}
              disabled={busy}
              botTopRolePosition={resources?.bot?.topRolePosition ?? null}
              botIsAdmin={Boolean(resources?.bot?.guildPermissions && (BigInt(resources.bot.guildPermissions) & BigInt(8)) !== BigInt(0))}
              requireManageable
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="cc-btn" onClick={() => applyRole('add')} disabled={busy || !roleUserId || !roleId}>
            {busy ? 'Working…' : 'Add role'}
          </button>
          <button className="cc-btn" onClick={() => applyRole('remove')} disabled={busy || !roleUserId || !roleId}>
            {busy ? 'Working…' : 'Remove role'}
          </button>
        </div>
      </div>

      {/* User notes */}
      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>User notes</div>
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
          📝 Staff notebook — same notes as /notes commands (Manage Server)
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <DiscordMemberSelect
              members={resources?.members ?? []}
              value={noteMemberId}
              onChange={(id) => { setNoteMemberId(id); if (id) void loadNotes(id); }}
              loading={resLoading}
              disabled={busy}
            />
          </div>
          <button className="cc-btn" onClick={() => { if (noteMemberId) void loadNotes(noteMemberId); }} disabled={busy || !noteMemberId}>
            {notesLoading ? 'Loading…' : 'View notes'}
          </button>
        </div>
        {notes.length > 0 && (
          <div style={{ display: 'grid', gap: 5, marginBottom: 10 }}>
            {notes.map((n) => (
              <div key={n.noteId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                <span style={{ flex: 1 }}>
                  <strong style={{ color: '#fff' }}>#{n.noteId}</strong> • {n.text}{' '}
                  <span style={{ color: 'var(--cc-text-faint)' }}>— {new Date(n.createdAt).toLocaleDateString()}</span>
                </span>
                <button className="cc-link" onClick={() => removeNote(n.noteId)} disabled={busy}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  Delete
                </button>
              </div>
            ))}
            <div>
              <button className="cc-link" onClick={clearNotes} disabled={busy}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                Clear all notes for this member
              </button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <input className="cc-input" style={{ flex: 1, minWidth: 220 }}
            placeholder="Write a staff note…"
            value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          <button className="cc-btn cc-btn-primary" onClick={addNote} disabled={busy || !noteMemberId || !noteText.trim()}>
            {busy ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* Lockdown */}
      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Lockdown</div>
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
          🔒 Deny Send Messages for @everyone — same service as /lockdown commands (Manage Channels)
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {(['channel', 'server'] as const).map((s) => (
            <button key={s} type="button" className={`cc-btn ${lockScope === s ? 'cc-btn-primary' : ''}`}
              onClick={() => setLockScope(s)} style={{ fontSize: 12.5 }}>
              {s === 'channel' ? 'Channel' : 'Server'}
            </button>
          ))}
        </div>
        {lockScope === 'channel' && (
          <div style={{ marginBottom: 10 }}>
            <DiscordChannelSelect
              channels={resources?.channels ?? []}
              value={lockChannelId}
              onChange={(id) => setLockChannelId(id)}
              kinds="text"
              loading={resLoading}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Duration</label>
            <input className="cc-input" value={lockDuration}
              onChange={(e) => setLockDuration(e.target.value)}
              placeholder="Permanent" style={{ maxWidth: 160 }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Reason</label>
            <input className="cc-input" style={{ width: '100%' }}
              placeholder="Why is this locked?"
              value={lockReason} onChange={(e) => setLockReason(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="cc-btn cc-btn-primary" onClick={() => runLockdown(false)} disabled={locking || (lockScope === 'channel' && !lockChannelId)}>
            {locking ? 'Working…' : lockScope === 'channel' ? 'Lock Channel' : 'Lock Server'}
          </button>
          <button className="cc-btn" onClick={() => runLockdown(true)} disabled={locking || (lockScope === 'channel' && !lockChannelId)}>
            {locking ? 'Working…' : lockScope === 'channel' ? 'Unlock Channel' : 'Unlock Server'}
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--cc-text-faint)' }}>
          Unlock restores exactly what the lock changed — never unrelated administrator edits.
        </p>
      </div>

      {/* Purge */}
      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Purge</div>
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
          🧹 Filtered deletion — same service as /purge commands (Manage Server). Purge ignores pinned messages.
        </label>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Channel</label>
            <DiscordChannelSelect
              channels={resources?.channels ?? []}
              value={purgeChannelId}
              onChange={(id) => setPurgeChannelId(id)}
              kinds="text"
              loading={resLoading}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Kind</label>
            <select className="cc-input" style={{ width: '100%' }} value={purgeKind}
              onChange={(e) => { setPurgeKind(e.target.value); setPurgeConfirm(false); }}>
              {['all', 'bot', 'human', 'user', 'contains', 'embeds', 'emoji', 'files', 'images', 'links', 'mentions'].map((k) => (
                <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Amount (1–100)</label>
            <input className="cc-input" style={{ width: '100%' }} type="number" min={1} max={100}
              value={purgeCount} onChange={(e) => setPurgeCount(Math.max(1, Math.min(100, Number(e.target.value) || 20)))} />
          </div>
        </div>
        {purgeKind === 'user' && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Member</label>
            <DiscordMemberSelect
              members={resources?.members ?? []}
              value={purgeUserId}
              onChange={(id) => setPurgeUserId(id)}
              loading={resLoading}
              disabled={busy}
            />
          </div>
        )}
        {purgeKind === 'contains' && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Search text</label>
            <input className="cc-input" style={{ width: '100%' }}
              placeholder="Messages containing…"
              value={purgeText} onChange={(e) => setPurgeText(e.target.value)} />
          </div>
        )}
        {!purgeConfirm ? (
          <button className="cc-btn cc-btn-primary" style={{ borderColor: 'rgba(248,113,113,0.5)' }}
            onClick={() => setPurgeConfirm(true)} disabled={busy || !purgeChannelId}>
            Purge {purgeKind}…
          </button>
        ) : (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
            ⚠ This will remove {purgeKind} messages from the selected channel. Continue?
            <button className="cc-btn" style={{ borderColor: 'rgba(248,113,113,0.5)', color: '#ff8a8a' }}
              onClick={runPurge} disabled={busy}>
              {busy ? 'Purging…' : 'Confirm Purge'}
            </button>
            <button className="cc-btn" onClick={() => setPurgeConfirm(false)} disabled={busy}>Cancel</button>
          </span>
        )}
      </div>

      {/* Action policies */}
      <div className="cc-section-label" style={{ margin: '22px 0 10px' }}>Action policies</div>
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
          Warning escalation runs automatically when a member reaches a threshold. Changes save with the button below.
        </p>
        {thresholds.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>At</span>
            <input className="cc-input" type="number" min={1} max={100} value={t.count}
              onChange={(e) => setThreshold(i, { count: Math.max(1, Number(e.target.value) || 1) })}
              style={{ maxWidth: 90 }} aria-label="Warning count" />
            <span style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>warnings →</span>
            <select className="cc-input" value={t.action}
              onChange={(e) => setThreshold(i, { action: e.target.value })} style={{ maxWidth: 150 }} aria-label="Escalation action">
              <option value="timeout">Timeout</option>
              <option value="kick">Kick</option>
              <option value="ban">Ban</option>
            </select>
            {t.action === 'timeout' && (
              <input className="cc-input" type="number" min={1} max={40320} value={t.durationMinutes}
                onChange={(e) => setThreshold(i, { durationMinutes: Math.max(1, Number(e.target.value) || 60) })}
                style={{ maxWidth: 110 }} aria-label="Timeout minutes" />
            )}
            <button className="cc-link" onClick={() => removeThreshold(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
              Remove
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
          <button className="cc-btn" onClick={addThreshold} disabled={thresholds.length >= 5} style={{ fontSize: 12.5 }}>
            + Add threshold
          </button>
          <button className="cc-btn" onClick={() => update('moderation', 'warnThresholds', [{ count: 3, action: 'timeout', durationMinutes: 60 }])} style={{ fontSize: 12.5 }}>
            Reset to default
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
            AutoMod escalation — action per repeat-offense strike (spam, links, invites, caps)
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {escalation.map((step, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ color: 'var(--cc-text-faint)' }}>→</span>}
                <select className="cc-input" value={step} aria-label={`Strike ${i + 1} action`}
                  onChange={(e) => {
                    const next = [...escalation];
                    next[i] = e.target.value;
                    update('moderation', 'escalation', next);
                  }}
                  style={{ maxWidth: 130 }}>
                  <option value="warn">Warn</option>
                  <option value="timeout">Timeout 10m</option>
                  <option value="kick">Kick</option>
                  <option value="ban">Ban</option>
                  <option value="off">Nothing</option>
                </select>
              </span>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>DM notifications (member DMs, best-effort)</div>
          {(['warn', 'timeout', 'kick', 'ban'] as const).map((k) => (
            <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#fff', marginRight: 14 }}>
              <input type="checkbox" checked={dm[k] !== false}
                onChange={(e) => update('moderation', 'dmNotifications', { ...(dm as Record<string, boolean>), [k]: e.target.checked })} />
              {k[0].toUpperCase() + k.slice(1)}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={() => void save()} disabled={saveState === 'saving'} style={{ fontSize: 12.5 }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? '✕ Save failed' : 'Save policies'}
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
            🔇 Muterole — required for Mute / Hard Mute / Unmute (Manage Roles on Discord)
          </label>
          <DiscordRoleSelect
            roles={resources?.roles ?? []}
            value={String((moderation.muteRoleId as string) || '')}
            onChange={(id) => update('moderation', 'muteRoleId', id)}
            loading={resLoading}
          />
          {!moderation.muteRoleId && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#ff8a8a' }}>
              No Muterole set — mute commands will report MUTEROLE_NOT_CONFIGURED, never a permission error.
            </p>
          )}
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
            Moderation log channel — where case embeds are posted
          </label>
          <DiscordChannelSelect
            channels={resources?.channels ?? []}
            value={String((moderation.logChannelId as string) || '')}
            onChange={(id) => update('moderation', 'logChannelId', id)}
            kinds={kindsForKey('logChannelId')}
            loading={resLoading}
          />
        </div>
      </div>
    </div>
  );
}
