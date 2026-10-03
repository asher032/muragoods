'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────
// Murastream → Free / Legal
//
// The one page that answers "what can Muragoods actually stream, and why?".
// Every entry shows the licence it was verified under and links to the
// evidence it was verified from. Titles whose rights we could not establish
// are listed as held back rather than quietly dropped or quietly presented as
// free.
//
// Murastream has no advertising of any kind on this page or any other: no ad
// slots, no ad scripts, no third-party ad iframes, no interstitial overlays.
// ─────────────────────────────────────────────────────────────────────────

interface LegalItem {
  key: string;
  title: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  season: number | null;
  episode: number | null;
  provider: string;
  rightsStatus: string;
  licenseType: string | null;
  licenseUrl: string | null;
  rightsSourceUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  category: string | null;
  playable: boolean;
  note: string | null;
}

interface LegalPayload {
  categories: Array<{ key: string; label: string; count: number }>;
  items: LegalItem[];
  storeAvailable: boolean;
  total: number;
  playableCount: number;
}

const ALL = 'ALL';

function watchHref(i: LegalItem): string {
  return i.mediaType === 'tv'
    ? `/murastream/watch?tmdbId=${i.tmdbId}&season=${i.season ?? 1}&episode=${i.episode ?? 1}`
    : `/murastream/watch?tmdbId=${i.tmdbId}`;
}

export default function FreeLegalPage() {
  const [data, setData] = useState<LegalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(ALL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/murastream/legal', { cache: 'no-store' });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body?.categories) setError(String(body?.error ?? 'Could not load the legal catalog.'));
        else setData(body as LegalPayload);
      } catch {
        if (!cancelled) setError('Could not reach the legal catalog API.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    if (!data) return [];
    if (filter === ALL) return data.items;
    return data.items.filter((i) => i.category === filter);
  }, [data, filter]);

  return (
    <main style={{ padding: '24px 16px 64px', maxWidth: 1080, margin: '0 auto' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 26 }}>Free / Legal</h1>
        <p style={{ margin: 0, color: 'var(--mg-text-2)', maxWidth: 68 + 'ch' }}>
          Everything Muragoods is permitted to stream, with the licence each title was verified
          under and the evidence it was verified from. A title appears here only because a
          specific licence says we may — never because it is simply available somewhere online.
        </p>
      </header>

      {error && (
        <p role="alert" style={{ padding: 12, border: '1px solid var(--mg-danger, #b91c1c)', borderRadius: 8 }}>
          {error}
        </p>
      )}

      {!data && !error && <p style={{ color: 'var(--mg-text-2)' }}>Loading verified catalog…</p>}

      {data && (
        <>
          <p style={{ fontSize: 13, color: 'var(--mg-text-2)' }}>
            {data.playableCount} of {data.total} verified titles are playable right now.
            {data.storeAvailable ? '' : ' (Source database unavailable — showing the committed catalog only.)'}
          </p>

          <nav aria-label="Licence categories" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
            <button
              type="button"
              className="deco-btn deco-btn-sm"
              onClick={() => setFilter(ALL)}
              aria-pressed={filter === ALL}
              style={filter === ALL ? { borderColor: 'var(--mg-accent)' } : undefined}
            >
              All ({data.total})
            </button>
            {data.categories.map((c) => (
              <button
                key={c.key}
                type="button"
                className="deco-btn deco-btn-sm"
                onClick={() => setFilter(c.key)}
                aria-pressed={filter === c.key}
                style={filter === c.key ? { borderColor: 'var(--mg-accent)' } : undefined}
              >
                {c.label} ({c.count})
              </button>
            ))}
          </nav>

          {shown.length === 0 && (
            <p style={{ color: 'var(--mg-text-2)' }}>No verified titles in this category yet.</p>
          )}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {shown.map((i) => (
              <li
                key={i.key}
                style={{
                  border: '1px solid var(--mg-border-2, rgba(127,127,127,0.3))',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 220 }}>
                    <strong style={{ fontSize: 15 }}>
                      {i.title}
                      {i.mediaType === 'tv' && (
                        <span style={{ color: 'var(--mg-text-2)', fontWeight: 400 }}>
                          {' '}S{String(i.season ?? 1).padStart(2, '0')}E{String(i.episode ?? 1).padStart(2, '0')}
                        </span>
                      )}
                    </strong>
                    <div style={{ fontSize: 12, color: 'var(--mg-text-2)' }}>
                      TMDB {i.tmdbId} · {i.mediaType} · hosted by {i.provider}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: '1px solid currentColor',
                        color: i.playable ? 'var(--mg-success, #15803d)' : 'var(--mg-text-2)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {i.rightsStatus}
                    </span>
                    {i.playable ? (
                      <Link href={watchHref(i)} className="deco-btn deco-btn-sm">Play</Link>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--mg-text-2)' }}>Not playable</span>
                    )}
                  </div>
                </div>

                <dl style={{ margin: '10px 0 0', fontSize: 12.5, display: 'grid', gap: 3 }}>
                  <div><dt style={{ display: 'inline', color: 'var(--mg-text-2)' }}>License: </dt>
                    <dd style={{ display: 'inline', margin: 0 }}>{i.licenseType ?? 'Not recorded'}</dd></div>
                  {i.licenseUrl && (
                    <div><dt style={{ display: 'inline', color: 'var(--mg-text-2)' }}>License URL: </dt>
                      <dd style={{ display: 'inline', margin: 0 }}>
                        <a href={i.licenseUrl} target="_blank" rel="noreferrer noopener">{i.licenseUrl}</a>
                      </dd></div>
                  )}
                  {i.rightsSourceUrl && (
                    <div><dt style={{ display: 'inline', color: 'var(--mg-text-2)' }}>Evidence: </dt>
                      <dd style={{ display: 'inline', margin: 0 }}>
                        <a href={i.rightsSourceUrl} target="_blank" rel="noreferrer noopener">{i.rightsSourceUrl}</a>
                      </dd></div>
                  )}
                  {i.attributionRequired && (
                    <div><dt style={{ display: 'inline', color: 'var(--mg-text-2)' }}>Required attribution: </dt>
                      <dd style={{ display: 'inline', margin: 0 }}>{i.attributionText ?? 'Required by this licence.'}</dd></div>
                  )}
                </dl>

                {i.note && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--mg-text-2)' }}>{i.note}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}