'use client';

import { useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import {
  Banner, Empty, Field, Loading, Panel, RefreshButton, StateBadge, Stat, useAdminResource,
} from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/murastream — the complete Murastream control surface.
//
// Catalog metadata exists whether or not it can be played, so the question an
// owner actually has is "will this title play?". This page answers it with the
// resolver's own verdict for a specific title, rather than by inferring health
// from the fact that TMDB returned a poster.
//
// An empty first-party manifest is reported as empty. It is not dressed up as a
// fault, and it is not hidden behind an empty-looking table.
// ─────────────────────────────────────────────────────────────────────────

interface Source {
  slug: string; tmdbId: number; title: string; mediaType: string;
  file: string; season: number | null; episode: number | null; url: string;
}

interface Failure {
  at: string; mediaType?: string; tmdbId?: number; status?: string; reason?: string;
}

interface Probe {
  request: { mediaType: string; tmdbId: number; season: number | null; episode: number | null };
  status: string; reason: string | null; message: string | null; canPlay: boolean;
  sources: unknown[]; trailers: { url: string; label: string; kind: string }[];
}

interface Payload {
  registry: { titles: number; episodes: number; sources: Source[]; note: string | null };
  reasons: Record<string, string>;
  recentFailures: Failure[];
  totalFailures: number;
  probe?: Probe;
  readOnly: boolean;
}

export default function AdminMurastreamPage() {
  const { data, error, loading, reload } = useAdminResource<Payload>('/api/admin/murastream');

  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('tv');
  const [tmdbId, setTmdbId] = useState('');
  const [season, setSeason] = useState('1');
  const [episode, setEpisode] = useState('1');
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [extraProbe, setExtraProbe] = useState<Probe | null>(null);

  async function runProbe() {
    setProbeBusy(true);
    setProbeError(null);
    setExtraProbe(null);
    try {
      const res = await fetch('/api/admin/murastream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaType,
          tmdbId: Number(tmdbId),
          season: mediaType === 'tv' ? Number(season) : null,
          episode: mediaType === 'tv' ? Number(episode) : null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setProbeError(body?.error || 'The probe could not be run.');
        return;
      }
      setExtraProbe({
        request: { mediaType, tmdbId: Number(tmdbId), season: mediaType === 'tv' ? Number(season) : null, episode: mediaType === 'tv' ? Number(episode) : null },
        status: body.status, reason: body.reason ?? null, message: body.message ?? null,
        canPlay: body.canPlay, sources: body.sources ?? [], trailers: [],
      });
    } catch {
      setProbeError('The server could not be reached.');
    } finally {
      setProbeBusy(false);
    }
  }

  const probe = extraProbe;
  const reg = data?.registry;

  return (
    <>
      <AdminHeader
        title="Murastream"
        subtitle="Catalog reachability, authorized media sources, the playback resolver and its recent failures. Metadata and playability are reported separately, because they are different things."
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {error ? <Banner tone="error">Could not read Murastream state: {error}</Banner> : null}
      {loading && !data ? <Loading /> : null}

      {data && reg ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Stat label="Titles registered" value={reg.titles} tone={reg.titles === 0 ? 'var(--mg-warning)' : 'var(--mg-success)'} />
            <Stat label="Episode files" value={reg.episodes} />
            <Stat label="Failures (this process)" value={data.totalFailures} tone={data.totalFailures > 0 ? 'var(--mg-warning)' : undefined} />
            <Stat label="Resolver probe" value={probe ? probe.status : '—'} />
          </div>

          {reg.note ? (
            <div style={{ marginBottom: 18 }}>
              <Banner tone="warning">{reg.note}</Banner>
            </div>
          ) : null}

          {/* ── Authorized sources ─────────────────────────────────────── */}
          <Panel
            title="Authorized media sources"
            hint="Playback is only ever served from entries in this manifest. Nothing outside it can be resolved, from the site or from any dashboard."
          >
            {reg.sources.length === 0 ? (
              <Empty>
                No first-party media is registered. Until an entry exists, every title correctly
                reports “playback source unavailable” — the catalog works, the content simply is
                not licensed.
              </Empty>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Title', 'TMDB', 'Type', 'File', 'Source URL'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, letterSpacing: '0.05em', color: 'var(--mg-text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--mg-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reg.sources.map((s) => (
                      <tr key={`${s.slug}-${s.file}`} style={{ borderBottom: '1px solid var(--mg-border)' }}>
                        <td style={{ padding: '9px 10px', fontWeight: 600 }}>{s.title}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)' }}>{s.tmdbId}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)' }}>
                          {s.mediaType}{s.episode ? ` S${s.season}E${s.episode}` : ''}
                        </td>
                        <td style={{ padding: '9px 10px', color: 'var(--mg-text-muted)' }}>{s.file}</td>
                        <td style={{ padding: '9px 10px' }}><code style={{ fontSize: 12 }}>{s.url}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* ── Live resolver probe ────────────────────────────────────── */}
          <Panel
            title="Resolver probe"
            hint="Runs the real resolver against a title and reports its verdict. Nothing is persisted — this is a diagnostic."
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ width: 140 }}>
                <span className="mg-label">Type</span>
                <select className="mg-select" value={mediaType} onChange={(e) => setMediaType(e.target.value as 'movie' | 'tv')} style={{ marginTop: 6 }}>
                  <option value="tv">Series / anime / K-drama</option>
                  <option value="movie">Movie</option>
                </select>
              </div>
              <div style={{ width: 130 }}>
                <Field label="TMDB ID" value={tmdbId} onChange={setTmdbId} placeholder="1399" />
              </div>
              {mediaType === 'tv' ? (
                <>
                  <div style={{ width: 100 }}>
                    <Field label="Season" value={season} onChange={setSeason} />
                  </div>
                  <div style={{ width: 100 }}>
                    <Field label="Episode" value={episode} onChange={setEpisode} />
                  </div>
                </>
              ) : null}
              <button
                type="button"
                className="mg-btn mg-btn-primary"
                onClick={runProbe}
                disabled={probeBusy || !tmdbId}
                style={{ marginBottom: 6 }}
              >
                {probeBusy ? 'Probing…' : 'Run probe'}
              </button>
            </div>

            {probeError ? <div style={{ marginTop: 14 }}><Banner tone="error">{probeError}</Banner></div> : null}

            {probe ? (
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'minmax(160px, 200px) 1fr', gap: 14 }}>
                <div>
                  <StateBadge state={probe.canPlay ? 'ONLINE' : 'OFFLINE'} />
                  <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700 }}>{probe.status}</p>
                  {probe.reason ? (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--mg-text-muted)' }}>
                      {probe.reason} — {data.reasons[probe.reason] ?? ''}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--mg-text-muted)', lineHeight: 1.55 }}>
                    {probe.message ?? 'No message returned.'}
                  </p>
                  <p style={{ margin: '10px 0 0', fontSize: 12.5 }}>
                    Sources returned: <strong>{probe.sources.length}</strong>
                    {probe.sources.length === 0 ? ' — a partially-resolved list is never returned, so zero means zero.' : null}
                  </p>
                </div>
              </div>
            ) : null}
          </Panel>

          {/* ── Recent failures ────────────────────────────────────────── */}
          <Panel title="Recent playback failures" hint="Redacted ring buffer for this server process. Secrets are never included.">
            {data.recentFailures.length === 0 ? (
              <Empty>No playback failure has been recorded in this process.</Empty>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      {['When', 'Type', 'TMDB', 'Status', 'Reason'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, letterSpacing: '0.05em', color: 'var(--mg-text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--mg-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentFailures.map((f, i) => (
                      <tr key={`${f.at}-${i}`} style={{ borderBottom: '1px solid var(--mg-border)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-text-muted)' }}>{new Date(f.at).toUTCString()}</td>
                        <td style={{ padding: '8px 10px' }}>{f.mediaType ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-text-muted)' }}>{f.tmdbId ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-warning)' }}>{f.status ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--mg-text-muted)' }}>{f.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </>
  );
}