'use client';

import { useCallback, useState } from 'react';
import { useGuild } from '@/app/lib/guild-context';
import { apiFetch } from '../lib/api';
import { DiscordMemberSelect, ResourceStatusBar, useGuildResources } from '../components/selectors';

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

interface LookupResult {
  member: MemberInfo;
  warnings: { reason: string; moderatorId: string; at: string }[];
  cases: { caseId: number; action: string; reason: string; moderatorId: string; createdAt: string }[];
}

const ACTIONS = [
  { key: 'warn', label: '⚠️ Warn', primary: false },
  { key: 'timeout', label: '🔇 Timeout 10m', primary: false },
  { key: 'kick', label: '👢 Kick', primary: false },
  { key: 'ban', label: '🔨 Ban', primary: true },
] as const;

export default function ModerationPage() {
  const { token, selected } = useGuild();
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { resources, loading: resLoading, error: resError, refresh: resRefresh } = useGuildResources(selected?.id ?? null);

  const lookupFor = useCallback(async (id: string) => {
    if (!token || !selected || !/^\d{5,25}$/.test(id)) {
      setError('Pick a member from the list — IDs are handled automatically.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setResult(null);
    const resp = await apiFetch<{ success: boolean; member: MemberInfo; warnings: LookupResult['warnings']; cases: LookupResult['cases'] }>(
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

  const lookup = () => void lookupFor(userId);

  const act = async (action: string) => {
    if (!token || !selected || !result) return;
    setBusy(true);
    setError('');
    const resp = await apiFetch<{ success: boolean; caseId?: number; error?: string }>('/api/dashboard/moderation', {
      method: 'POST',
      token,
      body: {
        guildId: selected.id, userId: result.member.id, action,
        reason: reason.trim() || 'No reason given (dashboard)', minutes: 10,
      },
    });
    if (resp.ok && resp.data.success) {
      setNotice(`✅ ${action.toUpperCase()} executed on Discord — case #${resp.data.caseId ?? '?'}`);
      setConfirming(null);
      setReason('');
      // Re-pull fresh state from Discord/DB.
      const refresh = await apiFetch<{ success: boolean; member: MemberInfo; warnings: LookupResult['warnings']; cases: LookupResult['cases'] }>(
        `/api/dashboard/moderation?guildId=${selected.id}&userId=${result.member.id}`, { token });
      if (refresh.ok && refresh.data.success) {
        setResult({ member: refresh.data.member, warnings: refresh.data.warnings, cases: refresh.data.cases });
      }
    } else {
      setError(resp.ok ? (resp.data as unknown as { error?: string }).error || 'Action failed' : resp.error);
    }
    setBusy(false);
  };

  if (!token) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Sign in with Discord to moderate.</p>;
  }
  if (!selected) {
    return <p style={{ color: 'var(--cc-text-faint)', fontSize: 14 }}>Select a server in the top bar.</p>;
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <p style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>MURAGOODS</p>
      <h1 style={{ margin: '4px 0 4px', fontSize: 26, fontWeight: 800, color: '#fff' }}>🛡️ Moderation — {selected.name}</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--cc-text-dim)' }}>
        Actions execute on Discord through the bot. Hierarchy, permissions and target state are
        re-verified server-side at execution time — failures here are real failures.
      </p>

      {/* Member lookup */}
      <div className="cc-card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <ResourceStatusBar loading={resLoading} error={resError} onRefresh={resRefresh} />
        <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>
          👮 Member lookup — pick a member, no IDs needed
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <DiscordMemberSelect
              members={resources?.members ?? []}
              value={userId}
              onChange={(id) => { setUserId(id); if (id) void lookupFor(id); }}
              loading={resLoading}
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

          {/* History */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div className="cc-card" style={{ padding: '14px 18px' }}>
              <strong style={{ color: '#fff', fontSize: 14 }}>⚠️ Warnings ({result.warnings.length})</strong>
              {result.warnings.length === 0 ? (
                <p style={{ margin: '8px 0 0', color: 'var(--cc-text-faint)', fontSize: 13 }}>Clean record.</p>
              ) : (
                <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                  {result.warnings.slice(0, 6).map((w, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                      • {w.reason} <span style={{ color: 'var(--cc-text-faint)' }}>— {new Date(w.at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="cc-card" style={{ padding: '14px 18px' }}>
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
          </div>

          {/* Action bar */}
          <div className="cc-card" style={{ padding: '16px 20px' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--cc-text-dim)', marginBottom: 6 }}>Reason (recorded on the case)</label>
            <input
              className="cc-input" style={{ width: '100%', marginBottom: 12 }}
              placeholder="Why is this action being taken?"
              value={reason} onChange={(e) => setReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ACTIONS.map((a) =>
                confirming === a.key ? (
                  <span key={a.key} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--cc-text-dim)' }}>
                      {a.key === 'ban' ? 'Ban' : a.key} <strong style={{ color: '#fff' }}>{result.member.displayName}</strong>?
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
    </div>
  );
}
