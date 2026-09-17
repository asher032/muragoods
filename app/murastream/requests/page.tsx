'use client';

// Request a Movie — users ask for missing movies/TV/anime and support
// existing requests. Duplicates collapse into supporters automatically
// (the API handles it) with a friendly notice.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, ThumbsUp, Film, Tv, Sparkles, Search } from 'lucide-react';

type RequestItem = {
  id: string;
  title: string;
  type: 'movie' | 'tv' | 'anime';
  year: string;
  notes: string;
  supporters: number;
  supportedByMe: boolean;
  status: 'Requested' | 'Under Review' | 'In Progress' | 'Added' | 'Unavailable' | 'Rejected';
  requestedBy: string;
  tmdbId: number | null;
  tmdbType: 'movie' | 'tv' | null;
  adminNote: string;
  at: string;
};

const STATUS_COLORS: Record<string, string> = {
  'Requested': '#8b9bb4',
  'Under Review': '#eab308',
  'In Progress': '#3b82f6',
  'Added': '#22c55e',
  'Unavailable': '#6b7280',
  'Rejected': '#ef4444',
};

const GLASS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.10)',
  backdropFilter: 'blur(13px)',
  WebkitBackdropFilter: 'blur(13px)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 20,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.25)',
};

function typeIcon(t: string) {
  return t === 'anime' ? <Sparkles size={13} /> : t === 'tv' ? <Tv size={13} /> : <Film size={13} />;
}

function RequestsContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'list' | 'new'>('list');
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'popular' | 'new'>('popular');
  const [statusFilter, setStatusFilter] = useState('');
  const [notice, setNotice] = useState('');

  // New-request form
  const [title, setTitle] = useState(searchParams.get('title') || '');
  const [type, setType] = useState<'movie' | 'tv' | 'anime'>('movie');
  const [year, setYear] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set('q', q.trim());
      if (statusFilter) sp.set('status', statusFilter);
      sp.set('sort', sort);
      const res = await fetch(`/api/murastream/requests?${sp}`);
      const data = await res.json();
      if (data.success) setRequests(data.requests || []);
    } catch { /* keep what we have */ } finally {
      setLoading(false);
    }
  }, [q, sort, statusFilter]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const submit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setNotice('');
    try {
      const res = await fetch('/api/murastream/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), type, year: year.trim(), notes: notes.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(data.message || 'Your request has been submitted.');
        setTitle(''); setYear(''); setNotes('');
        setTab('list');
        void load();
      } else {
        setNotice(data.error || 'Could not submit — try again');
      }
    } catch {
      setNotice('Could not submit — check your connection');
    } finally {
      setSubmitting(false);
    }
  };

  const support = async (r: RequestItem) => {
    if (r.supportedByMe) return;
    setRequests(prev => prev.map(x => (x.id === r.id
      ? { ...x, supporters: x.supporters + 1, supportedByMe: true }
      : x)));
    try {
      const res = await fetch('/api/murastream/requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id }),
      });
      const data = await res.json();
      if (res.ok && data.success && typeof data.supporters === 'number') {
        setRequests(prev => prev.map(x => (x.id === r.id ? { ...x, supporters: data.supporters } : x)));
      }
    } catch { /* keep optimistic */ }
  };

  return (
    <div className="ms-page-pad" style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '28px 0 20px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'rgba(245,245,250,0.95)', margin: 0 }}>
            Request a Movie
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(235,235,245,0.5)', margin: '4px 0 0' }}>
            Missing something? Ask for it — popular requests get added faster.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setTab('list')} style={{
            padding: '9px 18px', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            border: `1px solid ${tab === 'list' ? 'rgba(229,9,20,0.5)' : 'rgba(255,255,255,0.15)'}`,
            background: tab === 'list' ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.06)',
            color: tab === 'list' ? '#E50914' : 'rgba(235,235,245,0.7)',
          }}>Browse Requests</button>
          <button onClick={() => setTab('new')} style={{
            padding: '9px 18px', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: `1px solid ${tab === 'new' ? 'rgba(229,9,20,0.5)' : 'rgba(255,255,255,0.15)'}`,
            background: tab === 'new' ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.06)',
            color: tab === 'new' ? '#E50914' : 'rgba(235,235,245,0.7)',
          }}><Plus size={14} /> New Request</button>
        </div>
      </div>

      {notice && (
        <div style={{ ...GLASS, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#86efac', border: '1px solid rgba(34,197,94,0.35)' }}>
          {notice}
        </div>
      )}

      {tab === 'new' ? (
        <div style={{ ...GLASS, padding: 22 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(235,235,245,0.55)', marginBottom: 6 }}>
            TITLE *
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 120))}
            placeholder="e.g. Interstellar"
            aria-label="Title"
            style={{
              width: '100%', padding: '11px 14px', marginBottom: 14, borderRadius: 12,
              background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(245,245,250,0.95)', fontSize: 14, outline: 'none',
            }}
          />
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(235,235,245,0.55)', marginBottom: 6 }}>
            TYPE *
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['movie', 'tv', 'anime'] as const).map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: `1px solid ${type === t ? 'rgba(229,9,20,0.5)' : 'rgba(255,255,255,0.15)'}`,
                background: type === t ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.06)',
                color: type === t ? '#E50914' : 'rgba(235,235,245,0.7)',
              }}>{typeIcon(t)} {t === 'movie' ? 'Movie' : t === 'tv' ? 'TV Series' : 'Anime'}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(235,235,245,0.55)', marginBottom: 6 }}>
                YEAR (OPTIONAL)
              </label>
              <input
                value={year}
                onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="2014"
                inputMode="numeric"
                aria-label="Year"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 12,
                  background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)',
                  color: 'rgba(245,245,250,0.95)', fontSize: 14, outline: 'none',
                }}
              />
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(235,235,245,0.55)', marginBottom: 6 }}>
                ADDITIONAL INFO (OPTIONAL)
              </label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 500))}
                placeholder="Anything that helps us find it — language, dub, season…"
                aria-label="Additional information"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 12,
                  background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)',
                  color: 'rgba(245,245,250,0.95)', fontSize: 14, outline: 'none',
                }}
              />
            </div>
          </div>
          <button onClick={() => void submit()} disabled={!title.trim() || submitting} style={{
            width: '100%', padding: '13px', borderRadius: 12, cursor: title.trim() && !submitting ? 'pointer' : 'default',
            border: '1px solid #E50914', background: title.trim() && !submitting ? '#E50914' : 'rgba(229,9,20,0.25)',
            color: '#fff', fontSize: 14, fontWeight: 700,
          }}>
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(235,235,245,0.4)' }} />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search requests…"
                aria-label="Search requests"
                style={{
                  width: '100%', padding: '10px 14px 10px 36px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(245,245,250,0.95)', fontSize: 13, outline: 'none',
                }}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status" style={{
              padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(235,235,245,0.8)', fontSize: 12.5, cursor: 'pointer',
            }}>
              <option value="">All statuses</option>
              {['Requested', 'Under Review', 'In Progress', 'Added', 'Unavailable', 'Rejected'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button onClick={() => setSort(sort === 'popular' ? 'new' : 'popular')} style={{
              padding: '10px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.07)',
              color: 'rgba(235,235,245,0.7)',
            }}>{sort === 'popular' ? 'Most supported' : 'Newest'}</button>
          </div>

          {/* List */}
          {loading ? (
            <p style={{ textAlign: 'center', padding: 32, color: 'rgba(235,235,245,0.4)', fontSize: 13 }}>Loading requests…</p>
          ) : requests.length === 0 ? (
            <div style={{ ...GLASS, textAlign: 'center', padding: '32px 20px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(235,235,245,0.7)', margin: '0 0 4px' }}>No requests yet</p>
              <p style={{ fontSize: 12.5, color: 'rgba(235,235,245,0.45)', margin: 0 }}>Be the first — hit “New Request”.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {requests.map(r => (
                <div key={r.id} style={{ ...GLASS, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                    background: 'rgba(229,9,20,0.14)', border: '1px solid rgba(229,9,20,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E50914',
                  }}>{typeIcon(r.type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'rgba(245,245,250,0.95)', display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      {r.title}
                      {r.year && <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(235,235,245,0.4)' }}>{r.year}</span>}
                      <span style={{
                        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em',
                        color: STATUS_COLORS[r.status] || '#8b9bb4',
                        border: `1px solid ${STATUS_COLORS[r.status] || '#8b9bb4'}55`,
                        padding: '1px 7px', borderRadius: 6,
                      }}>{r.status.toUpperCase()}</span>
                    </p>
                    <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'rgba(235,235,245,0.45)' }}>
                      Requested by {r.requestedBy} · {r.supporters} supporter{r.supporters === 1 ? '' : 's'}
                      {r.adminNote ? ` · ${r.adminNote}` : ''}
                    </p>
                  </div>
                  {r.status === 'Added' && r.tmdbId && r.tmdbType ? (
                    <a href={`/murastream/${r.tmdbType}/${r.tmdbId}`} style={{
                      padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, textDecoration: 'none',
                      border: '1px solid rgba(34,197,94,0.5)', background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                    }}>Watch now</a>
                  ) : (
                    <button onClick={() => void support(r)} disabled={r.supportedByMe} style={{
                      padding: '8px 14px', borderRadius: 10, cursor: r.supportedByMe ? 'default' : 'pointer',
                      fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      border: `1px solid ${r.supportedByMe ? 'rgba(229,9,20,0.5)' : 'rgba(255,255,255,0.2)'}`,
                      background: r.supportedByMe ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.07)',
                      color: r.supportedByMe ? '#E50914' : 'rgba(235,235,245,0.8)',
                    }}>
                      <ThumbsUp size={12} /> {r.supportedByMe ? 'Supported' : 'Support'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 120, textAlign: 'center' }}>
        <div className="custom-loader" style={{ margin: '0 auto' }} />
      </div>
    }>
      <RequestsContent />
    </Suspense>
  );
}
