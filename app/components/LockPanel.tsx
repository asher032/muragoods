'use client';

// LockPanel — the admin-only content lock switch. Flipping it writes the
// SiteFlag in Mongo via /api/admin/site-flags; the gate on every MuraStream /
// hub page reads that flag and closes the doors for non-admins.

import { useCallback, useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';

export default function LockPanel({ adminEmail }: { adminEmail: string }) {
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/site-flags', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success) {
        setLocked(!!data.data.contentLocked);
        setMessage(data.data.lockedMessage || '');
      }
    } catch {
      setError('Could not load lock state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/site-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, contentLocked: !locked }),
      });
      const data = await res.json();
      if (data?.success) {
        setLocked(!!data.data.contentLocked);
      } else {
        setError(data?.error || 'Failed to update lock');
      }
    } catch {
      setError('Failed to update lock');
    } finally {
      setSaving(false);
    }
  }, [adminEmail, locked]);

  return (
    <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-6 rounded-2xl mt-8">
      <h2 className="text-sm text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
        Content Lock
      </h2>
      <p className="mt-2 text-[11px] text-[var(--pewter)]">
        When locked, MuraStream and the hub show a &ldquo;temporarily unavailable&rdquo; screen for
        everyone except you. The repo stays public; the site is yours alone.
      </p>
      {loading ? (
        <p className="mt-4 text-xs text-[var(--pewter)]">Loading…</p>
      ) : (
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={toggle}
            disabled={saving}
            className={`deco-btn deco-btn-sm ${locked ? 'deco-btn-gold' : 'deco-btn-crimson'}`}
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            {locked ? (
              <><Lock color="#e6b800" className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Site is LOCKED — click to open</>
            ) : (
              <><LockOpen color="#e63946" className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Site is OPEN — click to lock</>
            )}
          </button>
          {error && <span className="text-xs text-[var(--crimson)]">{error}</span>}
        </div>
      )}
      {locked && (
        <p className="mt-3 text-[10px] text-[var(--gold)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)' }}>
          Locked at {new Date().toLocaleTimeString()} — visitors see the closed screen instantly
        </p>
      )}
    </div>
  );
}
