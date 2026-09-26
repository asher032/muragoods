'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { useGuildConfig } from '@/app/lib/use-guild-config';
import { apiFetch } from '../lib/api';
import {
  DiscordChannelSelect, DiscordMemberSelect, DiscordRoleSelect,
  ResourceStatusBar, kindsForKey, statusMessage, useGuildMemberSearch,
  useGuildResources, type SearchedMember,
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
  { key: 'timeout', label: '🔇 Timeout', primary: false },
  { key: 'kick', label: '👢 Kick', primary: false },
  { key: 'ban', label: '🔨 Ban', primary: true },
  { key: 'unban', label: '🔓 Unban', primary: false },
] as const;

// ── Backend member finder ──────────────────────────────────────────────
// Guild-scoped server search (debounced 300ms, bounded, abort-safe): typing
// "olin" queries ONLY the selected guild and shows avatar + display name +
// username; the Discord user ID stays internal. Three states stay distinct:
// searching… / no results / failed + retry — never a silent empty list.
function MemberFinder({
  guildId, value, onChange, disabled,
}: {
  guildId: string;
  value: string;
  onChange: (id: string, member?: SearchedMember) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<SearchedMember | null>(null);
  const { results, searching, searchError, searchCode } = useGuildMemberSearch(guildId, open ? query : '');

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
          {searching && <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>Searching members…</div>}
          {!searching && searchError && (
            <div style={{ padding: '10px 8px', fontSize: 12.5, color: '#ff8a8a' }}>
              <div><strong>⚠️ {statusMessage(searchCode, searchError).title}</strong></div>
              <div style={{ color: 'var(--cc-text-dim)', marginTop: 2 }}>{statusMessage(searchCode, searchError).hint}</div>
            </div>
          )}
          {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
            <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>No members found.</div>
          )}
          {!searching && !searchError && query.trim().length < 2 && (
            <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--cc-text-faint)' }}>Type at least 2 characters to search.</div>
          )}
          {results.map((m) => (
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
          {results.length > 0 && (
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
  const [roleUserId, setRoleUserId] = useState('');
  const [roleId, setRoleId] = useState('');
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
    void loadOverview();
    void loadBans();
  }, [selected?.id, loadOverview, loadBans]);

  const lookup = () => void lookupFor(userId);
  const effectiveMinutes = timeoutMinutes === -1 ? Math.max(1, Math.min(40320, Number(customMinutes) || 30)) : timeoutMinutes;

  const act = async (action: string) => {
    if (!token || !selected) return;
    const target = action === 'unban' ? unbanId : result?.member.id;
    if (!target || !/^\d{5,25}$/.test(target)) {
      setError(action === 'unban' ? 'Pick a banned user from the list first.' : 'Look up a member first.');
      return;
    }
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; caseId?: number; error?: string }>('/api/dashboard/moderation', {
      method: 'POST',
      token,
      body: {
        guildId: selected.id, userId: target, action,
        reason: reason.trim() || 'No reason given (dashboard)',
        minutes: effectiveMinutes, deleteMessageDays: banDeleteDays,
      },
    });
    if (resp.ok && resp.data.success) {
      setNotice(`✅ ${action.toUpperCase()} executed on Discord — case #${resp.data.caseId ?? '?'}`);
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
      setError(resp.ok ? (resp.data as unknown as { error?: string }).error || 'Action failed' : resp.error);
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
            {confirming === 'ban' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'var(--cc-text-dim)' }}>Delete message history</label>
                <select className="cc-input" value={banDeleteDays}
                  onChange={(e) => setBanDeleteDays(Number(e.target.value))} style={{ maxWidth: 220 }}>
                  <option value={0}>None</option>
                  <option value={1}>Last 1 day</option>
                  <option value={7}>Last 7 days</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ACTIONS.filter((a) => a.key !== 'unban').map((a) =>
                confirming === a.key ? (
                  <span key={a.key} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                      {a.key === 'ban' ? 'Ban' : a.key} <strong style={{ color: '#fff' }}>{result.member.displayName}</strong>
                      {a.key === 'timeout' ? ` for ${TIMEOUT_PRESETS.find((p) => p.minutes === timeoutMinutes)?.label ?? `${effectiveMinutes} min`}` : ''}?
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
