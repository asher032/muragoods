'use client';

import { useState } from 'react';
import { AdminHeader } from '../components/AdminShell';
import {
  Banner, Empty, Loading, Panel, RefreshButton, Stat, useAdminResource,
} from '../components/kit';

// ─────────────────────────────────────────────────────────────────────────
// /admin/letters — Untold Words moderation.
//
// People write letters to someone they cannot name here, so the queue is the
// unit of moderation, not the letter body. The list never carries the text; a
// moderator opens one submission deliberately. Every hide/unhide reports what
// it actually changed.
// ─────────────────────────────────────────────────────────────────────────

interface LetterRow {
  _id: string;
  authorName: string;
  recipientName: string;
  category: string;
  likes: number;
  bookmarks: number;
  approved: boolean;
  createdAt: string;
}

interface Payload {
  counts: { total: number; hidden: number; visible: number };
  letters: LetterRow[];
  privacy: string;
  readOnly: boolean;
}

interface Reveal {
  letter: LetterRow & { content: string };
  notice: string;
}

export default function AdminLettersPage() {
  const { data, error, loading, reload } = useAdminResource<Payload>('/api/admin/letters');
  const [filter, setFilter] = useState<'all' | 'hidden' | 'visible'>('all');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const letters = (data?.letters ?? []).filter((l) =>
    filter === 'all' ? true : filter === 'hidden' ? !l.approved : l.approved);

  async function openLetter(id: string) {
    setReveal(null);
    const res = await fetch(`/api/admin/letters?reveal=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setResult({ tone: 'error', message: body?.error || 'That letter could not be opened.' });
      return;
    }
    setReveal(body);
  }

  async function setApproved(row: LetterRow, approved: boolean) {
    setBusyId(row._id);
    setResult(null);
    try {
      const res = await fetch('/api/admin/letters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row._id, approved }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setResult({ tone: 'error', message: body?.error || 'The letter was not changed.' });
        return;
      }
      setResult({ tone: 'success', message: body.message });
      setReveal(null);
      reload();
    } catch {
      setResult({ tone: 'error', message: 'The server could not be reached. Nothing was changed.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <AdminHeader
        title="Letters"
        subtitle="Untold Words moderation. The queue shows who wrote to whom and whether a submission is visible — not the text, which is read one submission at a time."
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {error ? <Banner tone="error">{error}</Banner> : null}
      {result ? <div style={{ marginBottom: 16 }}><Banner tone={result.tone}>{result.message}</Banner></div> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Stat label="Submissions" value={data.counts.total} />
            <Stat label="Visible" value={data.counts.visible} tone="var(--mg-success)" />
            <Stat label="Hidden" value={data.counts.hidden} tone={data.counts.hidden > 0 ? 'var(--mg-warning)' : undefined} />
          </div>

          <Panel title="Moderation queue">
            <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
              {(['all', 'visible', 'hidden'] as const).map((f) => (
                <button key={f} type="button" className={`mg-btn ${filter === f ? 'mg-btn-primary' : 'mg-btn-ghost'}`} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>

            {letters.length === 0 ? (
              <Empty>No submissions in this view.</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {letters.map((l) => (
                  <div key={l._id} style={{ padding: '11px 13px', borderRadius: 'var(--mg-radius-md)', border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>
                        {l.authorName} <span style={{ color: 'var(--mg-text-faint)' }}>→</span> {l.recipientName}
                      </p>
                      <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--mg-text-muted)' }}>
                        {l.category} · {l.likes} likes · {l.bookmarks} bookmarks · {new Date(l.createdAt).toUTCString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 7 }}>
                      <span className={`mg-badge ${l.approved ? 'mg-badge-success' : 'mg-badge-warning'}`}>
                        {l.approved ? 'Visible' : 'Hidden'}
                      </span>
                      <button type="button" className="mg-btn mg-btn-ghost" onClick={() => openLetter(l._id)}>Open</button>
                      {!data.readOnly ? (
                        <button
                          type="button"
                          className="mg-btn mg-btn-secondary"
                          onClick={() => setApproved(l, !l.approved)}
                          disabled={busyId === l._id}
                        >
                          {busyId === l._id ? 'Saving…' : l.approved ? 'Hide' : 'Restore'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {reveal ? (
            <Panel title="Letter content" hint={reveal.notice}>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--mg-text-faint)' }}>
                {reveal.letter.authorName} → {reveal.letter.recipientName} · {reveal.letter.category} ·{' '}
                {new Date(reveal.letter.createdAt).toUTCString()}
              </p>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: 'var(--mg-text)', whiteSpace: 'pre-wrap' }}>
                {reveal.letter.content}
              </p>
            </Panel>
          ) : null}
        </>
      ) : null}
    </>
  );
}