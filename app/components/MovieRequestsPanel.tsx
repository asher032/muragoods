'use client';

// Admin — Movie Requests management. List, search, sort by popularity,
// change status, link the TMDB entry when content goes live, delete spam.
// Authorization is enforced server-side (admin session on every mutation);
// this panel is just the UI.

import { useCallback, useEffect, useState } from 'react';
import { Inbox, Trash2, Check } from 'lucide-react';

type RequestItem = {
  id: string;
  title: string;
  type: 'movie' | 'tv' | 'anime';
  year: string;
  notes: string;
  supporters: number;
  status: string;
  requestedBy: string;
  tmdbId: number | null;
  tmdbType: 'movie' | 'tv' | null;
  adminNote: string;
  at: string;
};

const STATUSES = ['Requested', 'Under Review', 'In Progress', 'Added', 'Unavailable', 'Rejected'] as const;

export default function MovieRequestsPanel() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'popular' | 'new'>('popular');
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams({ sort });
      if (q.trim()) sp.set('q', q.trim());
      const res = await fetch(`/api/murastream/requests?${sp}`);
      const data = await res.json();
      if (data.success) setRequests(data.requests || []);
    } catch {
      setError('Could not load requests');
    } finally {
      setLoading(false);
    }
  }, [q, sort]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const update = async (id: string, patch: Record<string, unknown>) => {
    setSavingId(id);
    setError('');
    try {
      const res = await fetch('/api/murastream/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) setError(data.error || 'Update failed');
      else setRequests(prev => prev.map(r => (r.id === id ? { ...r, ...patch } as RequestItem : r)));
    } catch {
      setError('Update failed — check your connection');
    } finally {
      setSavingId('');
    }
  };

  const remove = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/murastream/requests?id=${id}`, { method: 'DELETE' });
      if (res.ok) setRequests(prev => prev.filter(r => r.id !== id));
      else setError('Delete failed');
    } catch {
      setError('Delete failed');
    } finally {
      setSavingId('');
    }
  };

  return (
    <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-6 rounded-2xl mt-8">
      <h2 className="text-sm text-[var(--cream)] uppercase flex items-center gap-2" style={{ fontFamily: 'var(--font-arcade)' }}>
        <Inbox size={15} /> Movie Requests
      </h2>
      <p className="mt-1 text-[11px] text-[var(--pewter)]">
        Community requests from MuraStream. Mark as Added and link the title when it goes live.
      </p>

      {error && <p className="mt-2 text-[12px]" style={{ color: '#ef4444' }}>{error}</p>}

      <div className="mt-4 flex gap-2 flex-wrap">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search requests…"
          className="mario-input"
          style={{ flex: 1, minWidth: 180, fontSize: '12px' }}
        />
        <button onClick={() => setSort(sort === 'popular' ? 'new' : 'popular')} className="deco-btn deco-btn-sm">
          {sort === 'popular' ? 'Most supported' : 'Newest'}
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-[12px] text-[var(--pewter)]">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="mt-4 text-[12px] text-[var(--pewter)]">No requests yet.</p>
      ) : (
        <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
          {requests.map(r => (
            <div key={r.id} className="p-3 bg-[var(--charcoal-light)] rounded-xl border border-[rgba(242,240,228,0.08)]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[13px] text-[var(--cream)] font-bold truncate">
                    {r.title}
                    {r.year ? ` (${r.year})` : ''} <span className="text-[10px] font-normal text-[var(--pewter)]">· {r.type} · {r.supporters} supporters</span>
                  </p>
                  {r.notes && <p className="text-[11px] text-[var(--pewter)] truncate">“{r.notes}” — {r.requestedBy}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={r.status}
                    disabled={savingId === r.id}
                    onChange={e => void update(r.id, { status: e.target.value })}
                    aria-label={`Status for ${r.title}`}
                    className="mario-input"
                    style={{ fontSize: 11, padding: '5px 8px', width: 'auto' }}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {r.status === 'Added' && (
                    <input
                      defaultValue={r.tmdbId || ''}
                      onBlur={e => {
                        const v = e.target.value.trim();
                        const id = Number(v);
                        if (v === '' ? !!r.tmdbId : (Number.isInteger(id) && id > 0)) {
                          void update(r.id, { tmdbId: v === '' ? null : id, tmdbType: r.type === 'anime' ? 'tv' : r.type });
                        }
                      }}
                      placeholder="TMDB id"
                      aria-label={`TMDB id for ${r.title}`}
                      className="mario-input"
                      style={{ fontSize: 11, padding: '5px 8px', width: 90 }}
                    />
                  )}
                  <button
                    onClick={() => void remove(r.id)}
                    disabled={savingId === r.id}
                    aria-label={`Delete request ${r.title}`}
                    className="deco-btn deco-btn-sm"
                    style={{ padding: '5px 9px' }}
                  ><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
