'use client';

import { useCallback, useState } from 'react';
import { Banner, Field, Panel, StateBadge } from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// Admin: authorized playback sources.
//
// Registering a source here is an AUTHORIZATION DECISION by the owner: it
// asserts that Muragoods holds the rights to that asset. This page never
// invents a source, never guesses a provider, and never accepts a credential
// — providers are configured in the server environment and reported by state
// only.
//
// Season/episode are required for a series and are not even offered for a
// movie, which is what stops a film and an episode of a series ever sharing
// an address.
// ─────────────────────────────────────────────────────────────────────────

interface SourceRow {
  key: string;
  tmdbId: number;
  imdbId: string | null;
  mediaType: 'movie' | 'tv';
  season: number | null;
  episode: number | null;
  title: string;
  sourceType: string;
  provider: string;
  authorizationStatus: string;
  enabled: boolean;
  expiresAt: string | null;
  status: string;
  tier: 'static' | 'dynamic';
  // Rights evidence, shown in the "Verify Rights" audit. These are claims
  // about a licence, recorded per source; none of them is ever invented here.
  rightsStatus: string;
  licenseType: string | null;
  licenseUrl: string | null;
  rightsSourceUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

type AuditAction = 'approve' | 'reject' | 'mark_unverified';

const AUDIT_LABEL: Record<AuditAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  mark_unverified: 'Mark Unverified',
};

interface ProviderRow {
  provider: string;
  sourceType: string;
  state: string;
  detail: string;
}

interface SourcesPayload {
  store: { available: boolean; detail: string };
  counts: { total: number; static: number; dynamic: number; enabled: number; disabled: number; expired: number };
  providers: ProviderRow[];
  sources: SourceRow[];
}

/** Map a registry/provider state onto the kit's shared health vocabulary. */
function badge(state: string): 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'NOT_CONFIGURED' | 'CONFIGURATION_ERROR' {
  switch (state) {
    case 'REGISTERED':
    case 'PROVIDER_CONFIGURED':
      return 'ONLINE';
    case 'SOURCE_DISABLED':
    case 'SOURCE_EXPIRED':
      return 'DEGRADED';
    case 'SOURCE_NOT_REGISTERED':
    case 'PROVIDER_NOT_CONFIGURED':
      return 'NOT_CONFIGURED';
    case 'SOURCE_NOT_AUTHORIZED':
    case 'PROVIDER_INVALID':
    case 'PROVIDER_UNREACHABLE':
      return 'CONFIGURATION_ERROR';
    default:
      return 'DEGRADED';
  }
}

const EMPTY = {
  title: '', mediaType: 'movie', tmdbId: '', imdbId: '',
  season: '', episode: '', sourceType: 'first_party', provider: 'muragoods',
  playbackUrl: '', authorizationStatus: 'pending', expiresAt: '',
};

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span className="mg-label">{label}</span>
      <select className="mg-input" value={value} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 6 }}>
        {options.map(([v, labelText]) => <option key={v} value={v}>{labelText}</option>)}
      </select>
    </label>
  );
}

export default function PlaybackSourcesPanel() {
  const [data, setData] = useState<SourcesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [probe, setProbe] = useState<{ ok?: boolean; reason?: string } | null>(null);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null);
  // Which row's rights evidence is expanded, and which audit is in flight.
  const [auditOpen, setAuditOpen] = useState<string | null>(null);
  const [auditBusy, setAuditBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/murastream/playback/sources', { cache: 'no-store' });
      const body = await res.json();
      if (res.ok && body.success) setData(body as SourcesPayload);
      else setNotice({ tone: 'error', text: String(body?.error ?? 'Could not load sources') });
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the sources API.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null); setFieldErrors([]); setProbe(null);

    const payload: Record<string, unknown> = {
      title: form.title,
      mediaType: form.mediaType,
      tmdbId: form.tmdbId,
      imdbId: form.imdbId,
      sourceType: form.sourceType,
      provider: form.provider,
      playbackUrl: form.playbackUrl,
      authorizationStatus: form.authorizationStatus,
      expiresAt: form.expiresAt,
    };
    // Season/episode are sent only for a series. The form does not produce the
    // movie-with-an-episode mistake the server refuses.
    if (form.mediaType === 'tv') {
      payload.season = form.season;
      payload.episode = form.episode;
    }

    try {
      const res = await fetch('/api/murastream/playback/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (res.ok && body.success) {
        setProbe(body.probe ?? null);
        setNotice({ tone: 'success', text: `Registered ${body.source?.key}.` });
        setForm(EMPTY);
        await load();
      } else if (res.status === 409) {
        setNotice({ tone: 'warning', text: `${body.error} Nothing was overwritten.` });
      } else {
        setFieldErrors(body.errors ?? []);
        setNotice({ tone: 'error', text: String(body.error ?? 'Registration failed') });
      }
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the sources API.' });
    }
  }, [form, load]);

  const remove = useCallback(async (row: SourceRow) => {
    setNotice(null);
    const qs = new URLSearchParams({ tmdbId: String(row.tmdbId), mediaType: row.mediaType });
    if (row.mediaType === 'tv' && row.season != null && row.episode != null) {
      qs.set('season', String(row.season));
      qs.set('episode', String(row.episode));
    }
    const res = await fetch(`/api/murastream/playback/sources?${qs.toString()}`, { method: 'DELETE' });
    const body = await res.json();
    setNotice({
      tone: res.ok ? 'success' : 'warning',
      text: res.ok ? `Removed ${row.key}.` : String(body?.error ?? 'Remove failed'),
    });
    await load();
  }, [load]);

  const audit = useCallback(async (row: SourceRow, action: AuditAction) => {
    setNotice(null);
    setAuditBusy(row.key);
    const qs = new URLSearchParams({ tmdbId: String(row.tmdbId), mediaType: row.mediaType });
    if (row.mediaType === 'tv' && row.season != null && row.episode != null) {
      qs.set('season', String(row.season));
      qs.set('episode', String(row.episode));
    }
    try {
      const res = await fetch(`/api/murastream/playback/sources?${qs.toString()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audit: action, verifiedBy: 'muragoods admin' }),
      });
      const body = await res.json();
      if (res.ok && body.success) {
        setNotice({
          tone: 'success',
          text: `${AUDIT_LABEL[action]} — ${row.key} is now ${body.source?.rightsStatus ?? 'unknown'}${body.source?.enabled === false ? ' (disabled)' : ''}.`,
        });
      } else {
        // Approve can be refused for missing evidence; say which, rather than
        // collapsing it into a generic failure.
        const detail = Array.isArray(body?.errors) ? ` (${body.errors.join('; ')})` : '';
        setNotice({ tone: 'warning', text: `${AUDIT_LABEL[action]} refused: ${String(body?.error ?? 'unknown error')}${detail}` });
      }
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the sources API.' });
    } finally {
      setAuditBusy(null);
      await load();
    }
  }, [load]);

  const runImport = useCallback(async () => {
    setNotice(null); setImportResult(null);
    let rows: Array<Record<string, unknown>>;
    try {
      rows = JSON.parse(importText) as Array<Record<string, unknown>>;
    } catch {
      setNotice({ tone: 'error', text: 'Paste a JSON array of source rows.' });
      return;
    }
    if (!Array.isArray(rows)) {
      setNotice({ tone: 'error', text: 'The import must be a JSON array of rows.' });
      return;
    }
    const res = await fetch('/api/murastream/playback/sources/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `replace` is deliberately omitted: an import never overwrites a
      // working source unless the operator asks for that explicitly.
      body: JSON.stringify({ sources: rows }),
    });
    setImportResult(await res.json());
    await load();
  }, [importText, load]);

  return (
    <>
      <Panel
        title="Playback Sources"
        hint="Authorized sources the resolver may play. Registering one asserts that Muragoods holds the rights to that asset. Providers are configured in the server environment — credentials are never entered here."
        actions={(
          <button type="button" className="deco-btn deco-btn-sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        )}
      >
        {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

        {data && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
              <StateBadge state={data.store.available ? 'ONLINE' : 'DEGRADED'} />
              <span style={{ fontSize: 12.5, color: 'var(--mg-text-muted)' }}>
                {data.counts.total} registered · {data.counts.static} committed · {data.counts.dynamic} operator-registered · {data.counts.disabled} disabled · {data.counts.expired} expired
              </span>
            </div>
            {!data.store.available && (
              <Banner tone="warning">
                {data.store.detail}. Committed sources still resolve; operator-registered sources need a writable database.
              </Banner>
            )}

            <h3 style={{ margin: '16px 0 6px', fontSize: 13 }}>Providers</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.providers.map((p) => (
                <li key={p.sourceType} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                  <StateBadge state={badge(p.state)} />
                  <strong style={{ minWidth: 150 }}>{p.sourceType}</strong>
                  <span style={{ color: 'var(--mg-text-muted)' }}>{p.state} — {p.detail}</span>
                </li>
              ))}
            </ul>

            <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>Registered sources</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {['Address', 'Title', 'Source', 'Provider', 'Authorization', 'Rights', 'State', ''].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--mg-border-2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((s) => (
                    <tr key={s.key}>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>{s.key}</td>
                      <td style={{ padding: '6px 8px' }}>{s.title}</td>
                      <td style={{ padding: '6px 8px' }}>{s.sourceType}</td>
                      <td style={{ padding: '6px 8px' }}>{s.provider}</td>
                      <td style={{ padding: '6px 8px' }}>{s.authorizationStatus}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span title={s.licenseType ?? 'No licence recorded'}>{s.rightsStatus ?? 'UNVERIFIED'}</span>
                      </td>
                      <td style={{ padding: '6px 8px' }}><StateBadge state={badge(s.status)} /></td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="deco-btn deco-btn-sm"
                          onClick={() => setAuditOpen(auditOpen === s.key ? null : s.key)}
                          aria-expanded={auditOpen === s.key}
                        >
                          {auditOpen === s.key ? 'Hide rights' : 'Verify rights'}
                        </button>
                        {s.tier === 'dynamic' && (
                          <button type="button" className="deco-btn deco-btn-sm" onClick={() => void remove(s)}>Remove</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.sources.filter((s) => auditOpen === s.key).map((s) => (
                    <tr key={`${s.key}-audit`}>
                      <td colSpan={8} style={{ padding: '10px 12px', background: 'var(--mg-surface-2, transparent)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                          <tbody>
                            {([
                              ['Title', s.title],
                              ['Source', `${s.sourceType} · ${s.provider}`],
                              ['Rights status', s.rightsStatus ?? 'UNVERIFIED'],
                              ['License', s.licenseType ?? '— not recorded —'],
                              ['License URL', s.licenseUrl ?? '— not recorded —'],
                              ['Evidence URL', s.rightsSourceUrl ?? '— not recorded —'],
                              ['Attribution', s.attributionRequired ? (s.attributionText ?? 'Required, text not recorded') : 'Not required'],
                              ['Verified on', s.verifiedAt ?? '— never verified —'],
                              ['Verified by', s.verifiedBy ?? '— never verified —'],
                            ] as const).map(([label, value]) => (
                              <tr key={label}>
                                <td style={{ padding: '3px 10px 3px 0', color: 'var(--mg-text-2)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{label}</td>
                                <td style={{ padding: '3px 0' }}>
                                  {/^https?:\/\//.test(value) ? (
                                    <a href={value} target="_blank" rel="noreferrer noopener" style={{ wordBreak: 'break-all' }}>{value}</a>
                                  ) : (
                                    value
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {s.rightsStatus === 'UNVERIFIED' && !s.rightsSourceUrl && (
                          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--mg-text-2)' }}>
                            This source has no rights evidence recorded, so it cannot be approved and will not play.
                            Register its licence and evidence URL first.
                          </p>
                        )}

                        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                          {(Object.keys(AUDIT_LABEL) as AuditAction[]).map((action) => (
                            <button
                              key={action}
                              type="button"
                              className="deco-btn deco-btn-sm"
                              disabled={auditBusy === s.key}
                              onClick={() => void audit(s, action)}
                            >
                              {auditBusy === s.key ? 'Working…' : AUDIT_LABEL[action]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Add source" hint="Season and episode are required for a series and absent for a movie. The source is validated before it is saved.">
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <Field label="Title" value={form.title} onChange={set('title')} />
          <Select
            label="Media type"
            value={form.mediaType}
            onChange={set('mediaType')}
            options={[['movie', 'Movie'], ['tv', 'TV episode']]}
          />
          <Field label="TMDB ID" value={form.tmdbId} onChange={set('tmdbId')} />
          <Field label="IMDb ID (optional)" value={form.imdbId} onChange={set('imdbId')} placeholder="tt1234567" />
          {form.mediaType === 'tv' && (
            <>
              <Field label="Season" value={form.season} onChange={set('season')} />
              <Field label="Episode" value={form.episode} onChange={set('episode')} />
            </>
          )}
          <Select
            label="Source type"
            value={form.sourceType}
            onChange={set('sourceType')}
            options={[
              ['first_party', 'first_party — our own media'],
              ['cloudflare_stream', 'cloudflare_stream'],
              ['apivideo', 'apivideo'],
            ]}
          />
          <Field label="Provider" value={form.provider} onChange={set('provider')} />
          <Field
            label="Source reference"
            value={form.playbackUrl}
            onChange={set('playbackUrl')}
            hint="A path under /media, or a provider asset id."
          />
          <Select
            label="Authorization"
            value={form.authorizationStatus}
            onChange={set('authorizationStatus')}
            options={[
              ['pending', 'pending'],
              ['verified', 'verified'],
              ['unverified', 'unverified — will not play'],
            ]}
          />
          <Field label="Expires (optional)" value={form.expiresAt} onChange={set('expiresAt')} placeholder="2027-01-01" />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="deco-btn deco-btn-sm">Register source</button>
          </div>
        </form>

        {fieldErrors.length > 0 && (
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
            {fieldErrors.map((e, i) => (
              <li key={`${e.field}-${i}`}><strong>{e.field}</strong>: {e.message}</li>
            ))}
          </ul>
        )}

        {probe && (
          <div style={{ marginTop: 12, fontSize: 12.5 }}>
            <strong>Validation:</strong>{' '}
            {probe.ok
              ? 'the source resolves and serves video now.'
              : `not yet playable — ${probe.reason ?? 'unknown reason'}.`}
          </div>
        )}
      </Panel>

      <Panel
        title="Bulk import"
        hint="A JSON array of source rows. Every row is validated and reported individually; duplicates are never overwritten unless replacement is explicitly requested."
      >
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={6}
          placeholder='[{"tmdbId":123,"title":"…","mediaType":"movie","sourceType":"cloudflare_stream","playbackUrl":"assetid123"}]'
          style={{ width: '100%', fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 12 }}
        />
        <div style={{ marginTop: 10 }}>
          <button type="button" className="deco-btn deco-btn-sm" onClick={() => void runImport()}>Import rows</button>
        </div>
        {importResult && (
          <div style={{ marginTop: 10, fontSize: 12.5 }}>
            imported {importResult.imported ?? 0} · invalid {importResult.invalid ?? 0} ·{' '}
            duplicate {importResult.duplicate ?? 0} · expired {importResult.expired ?? 0} ·{' '}
            unauthorized {importResult.unauthorized ?? 0}
          </div>
        )}
      </Panel>
    </>
  );
}