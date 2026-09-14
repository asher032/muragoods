'use client';

// MuraStream comments — a Reddit-meets-Netflix discussion strip under every
// title. Posts anonymously (a stable "Guest #NN" name is derived from the
// login email when available), optimistically renders new messages, and
// polls every 20s so replies from other viewers appear without a refresh.

import { useState, useEffect, useRef, useCallback } from 'react';

type CommentItem = { id: string; name: string; text: string; at: string; self: boolean };

const AVATAR_COLORS = ['#e50914', '#06d6a0', '#118ab2', '#f78c6b', '#9b5de5', '#f15bb5'];
const POLL_MS = 20_000;

function initials(name: string): string {
  const m = name.match(/Guest #(\d+)/);
  if (m) return `G${m[1]}`;
  return name.trim().charAt(0).toUpperCase() || 'G';
}
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function MuraStreamComments({ mediaType, tmdbId, title }: {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
}) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const myIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/murastream/comments?type=${mediaType}&id=${tmdbId}`);
      if (!res.ok) return;
      const data = await res.json() as { comments?: CommentItem[] };
      if (Array.isArray(data.comments)) {
        setComments(prev => {
          // Keep optimistic posts that the server hasn't returned yet.
          const serverIds = new Set(data.comments!.map(c => c.id));
          const pending = prev.filter(c => c.self && !serverIds.has(c.id));
          return [...data.comments!, ...pending];
        });
      }
    } catch { /* offline — keep what we have */ } finally {
      setLoaded(true);
    }
  }, [mediaType, tmdbId]);

  useEffect(() => {
    setLoaded(false);
    setComments([]);
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setNotice('');
    let email = ''; let name = '';
    try {
      const raw = localStorage.getItem('user');
      if (raw) { const u = JSON.parse(raw); email = u.email || ''; name = u.name || ''; }
    } catch { /* anonymous */ }
    const optimistic: CommentItem = {
      id: `local-${Date.now()}`, name: name || 'You', text, at: new Date().toISOString(), self: true,
    };
    setComments(prev => [...prev, optimistic]);
    setDraft('');
    try {
      const res = await fetch('/api/murastream/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType, tmdbId, name, text, email }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; comment?: CommentItem; error?: string };
      if (res.ok && data.success && data.comment) {
        myIds.current.add(data.comment.id);
        setComments(prev => prev.map(c => (c.id === optimistic.id ? { ...data.comment!, self: true } : c)));
      } else {
        setComments(prev => prev.filter(c => c.id !== optimistic.id));
        setNotice(data.error || 'Could not post — try again');
      }
    } catch {
      setComments(prev => prev.filter(c => c.id !== optimistic.id));
      setNotice('Could not post — check your connection');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop: 48, marginBottom: 80 }}>
      <h3 style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 18,
        fontWeight: 700, color: 'var(--ms-text-strong)', margin: '0 0 4px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: '#e50914', display: 'inline-block',
          boxShadow: '0 0 8px rgba(229,9,20,0.8)',
        }} />
        The Screening Room
      </h3>
      <p style={{ fontSize: 12, color: 'var(--ms-text-faint)', margin: '0 0 16px' }}>
        What the MuraStream crowd thinks about {title || 'this title'} — no login needed.
      </p>

      {/* Composer */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 18,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: 10,
      }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value.slice(0, 500))}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); }
          }}
          placeholder="Share your reaction — spoiler-free zone…"
          rows={2}
          aria-label="Write a comment"
          style={{
            flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--ms-text)', fontSize: 13.5, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            lineHeight: 1.5, padding: '4px 2px',
          }}
        />
        <button
          onClick={() => void send()}
          disabled={!draft.trim() || sending}
          style={{
            alignSelf: 'flex-end', padding: '8px 18px', borderRadius: 8,
            cursor: draft.trim() && !sending ? 'pointer' : 'default',
            border: '1px solid #e50914', background: draft.trim() && !sending ? '#e50914' : 'rgba(229,9,20,0.25)',
            color: '#fff', fontSize: 12.5, fontWeight: 700, flexShrink: 0,
          }}
        >{sending ? 'Posting…' : 'Post'}</button>
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--ms-text-ghost)', margin: '-10px 0 14px' }}>
        {notice ? <span style={{ color: '#ef4444' }}>{notice} · </span> : null}
        Ctrl+Enter to post · be cool, it's a small community
      </p>

      {/* Thread */}
      {!loaded ? (
        <p style={{ fontSize: 12.5, color: 'var(--ms-text-ghost)', textAlign: 'center', padding: 24 }}>
          Loading the discussion…
        </p>
      ) : comments.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '28px 20px', borderRadius: 12,
          border: '1px dashed rgba(255,255,255,0.12)', color: 'var(--ms-text-faint)',
        }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, margin: '0 0 4px', color: 'var(--ms-text-dim)' }}>
            No comments yet — you get first word
          </p>
          <p style={{ fontSize: 12, margin: 0 }}>Was it worth the watch? Everyone sees it here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {comments.map(c => {
            const color = colorFor(c.name);
            return (
              <div key={c.id} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                background: c.self ? 'rgba(229,9,20,0.05)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${c.self ? 'rgba(229,9,20,0.25)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 12, padding: '10px 14px',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: color, color: '#fff', fontSize: 13, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                }}>{initials(c.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ms-text)', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    {c.name}{c.self && <span style={{ fontSize: 10, color: '#e50914', fontWeight: 700 }}>YOU</span>}
                    <span style={{ fontSize: 10.5, color: 'var(--ms-text-ghost)', fontWeight: 400 }}>{timeAgo(c.at)}</span>
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ms-text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {c.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
