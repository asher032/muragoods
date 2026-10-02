'use client';

import { useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import { Banner, Empty, Loading, Panel, RefreshButton, useAdminResource } from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/staff — the granular level between owner and Discord admin.
//
// "Admin" used to be a boolean, so the only way to give someone support
// access was to make them a super-admin over the economy ledger and the user
// table. Access is now a set of scopes, and only the Muragoods owner can
// change them — a staff member cannot grant themselves a scope.
// ─────────────────────────────────────────────────────────────────────────

interface StaffRow {
  _id: string;
  email: string;
  name: string;
  userId: string | null;
  role: string;
  staffScopes: string[];
}

interface Payload {
  scopes: string[];
  staff: StaffRow[];
  levels: { id: string; label: string; grants: string }[];
}

type Result = { tone: 'success' | 'warning' | 'error'; message: string } | null;

export default function AdminStaffPage() {
  const { data, error, loading, reload } = useAdminResource<Payload>('/api/admin/staff');
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<Result>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const scopesFor = (row: StaffRow) => draft[row.email] ?? row.staffScopes;

  function toggle(email: string, scope: string, current: string[]) {
    const next = current.includes(scope)
      ? current.filter((s) => s !== scope)
      : [...current, scope];
    setDraft((d) => ({ ...d, [email]: next }));
  }

  async function save(row: StaffRow) {
    const scopes = scopesFor(row);
    setBusyEmail(row.email);
    setResult(null);
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: row.email, scopes }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setResult({ tone: 'error', message: body?.error || 'Scopes were not changed.' });
        return;
      }
      // An emptied scope list removes access. Saying "updated" there would be
      // a lie about a security-relevant outcome, so it is called out.
      setResult(body.accessRemoved
        ? { tone: 'warning', message: `${row.email} is no longer staff — their access has been removed.` }
        : { tone: 'success', message: `${row.email} now has: ${scopes.join(', ') || 'no scopes'}.` });
      setDraft((d) => { const next = { ...d }; delete next[row.email]; return next; });
      void reload();
    } catch {
      setResult({ tone: 'error', message: 'The server could not be reached. Nothing was changed.' });
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <>
      <AdminHeader
        title="Staff access"
        subtitle="Scopes, not super-admin. Grant the narrowest set of capabilities the person actually needs — support, moderation, content, shop, murastream, economy, technical or analytics."
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading && !data ? <Loading /> : null}
      {result ? <div style={{ marginBottom: 16 }}><Banner tone={result.tone}>{result.message}</Banner></div> : null}

      {data ? (
        <>
          <Panel title="Access levels" hint="Three levels, and no fourth. Discord server permissions are proven live and are never inferred from a role name.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              {data.levels.map((l) => (
                <div key={l.id} style={{ padding: '12px 14px', borderRadius: 'var(--mg-radius-md)', border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)' }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{l.label}</p>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--mg-text-muted)' }}>{l.grants}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Who has access" hint="Only the Muragoods owner sees this page. Staff holding a scope cannot change scopes — including their own.">
            {data.staff.length === 0 ? (
              <Empty>No one holds a staff scope. Only the Muragoods owner currently has panel access.</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.staff.map((row) => {
                  const selected = scopesFor(row);
                  const dirty = draft[row.email] !== undefined;
                  const isOwner = row.role === 'admin';
                  return (
                    <div key={row._id} style={{ padding: 14, borderRadius: 'var(--mg-radius-md)', border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{row.name || row.email}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--mg-text-muted)' }}>
                            {row.email}{row.userId ? ` · ${row.userId}` : ''}
                          </p>
                        </div>
                        <span className={`mg-badge ${isOwner ? 'mg-badge-brand' : selected.length > 0 ? 'mg-badge-info' : 'mg-badge'}`}>
                          {isOwner ? 'Muragoods owner' : selected.length > 0 ? `${selected.length} scope(s)` : 'No access'}
                        </span>
                      </div>

                      {isOwner ? (
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mg-text-muted)' }}>
                          Holds every scope already. Removing the ecosystem owner is done on the account itself,
                          not through scope editing.
                        </p>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                            {data.scopes.map((scope) => {
                              const on = selected.includes(scope);
                              return (
                                <button
                                  key={scope}
                                  type="button"
                                  onClick={() => toggle(row.email, scope, selected)}
                                  aria-pressed={on}
                                  style={{
                                    padding: '5px 11px', borderRadius: 'var(--mg-radius-pill)',
                                    border: `1px solid ${on ? 'var(--mg-brand)' : 'var(--mg-border)'}`,
                                    background: on ? 'var(--mg-brand-softer)' : 'transparent',
                                    color: on ? 'var(--mg-brand)' : 'var(--mg-text-muted)',
                                    fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer',
                                  }}
                                >
                                  {scope}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            className="mg-btn mg-btn-primary"
                            onClick={() => save(row)}
                            disabled={!dirty || busyEmail === row.email}
                          >
                            {busyEmail === row.email ? 'Saving…' : selected.length === 0 ? 'Remove staff access' : 'Save scopes'}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </>
  );
}