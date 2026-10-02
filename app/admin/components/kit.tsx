'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// Small building blocks shared by every Admin Panel page.
//
// They exist so that "ONLINE" always looks like ONLINE, a save always says
// what it actually did, and a refused request always says why. Admin pages
// used to each invent their own version of these, which is how a page ended
// up saying "Saved!" after a request that had actually failed.
// ─────────────────────────────────────────────────────────────────────────

export type HealthState =
  | 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'TIMEOUT' | 'UNAUTHORIZED'
  | 'RATE_LIMITED' | 'CONFIGURATION_ERROR' | 'DATABASE_ERROR' | 'NOT_CONFIGURED';

const STATE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  ONLINE: { bg: 'var(--mg-success-soft)', fg: 'var(--mg-success)', label: 'ONLINE' },
  DEGRADED: { bg: 'var(--mg-warning-soft)', fg: 'var(--mg-warning)', label: 'DEGRADED' },
  NOT_CONFIGURED: { bg: 'var(--mg-glass-bg)', fg: 'var(--mg-text-muted)', label: 'NOT CONFIGURED' },
  UNAUTHORIZED: { bg: 'var(--mg-info-soft)', fg: 'var(--mg-info)', label: 'UNAUTHORIZED' },
  RATE_LIMITED: { bg: 'var(--mg-warning-soft)', fg: 'var(--mg-warning)', label: 'RATE LIMITED' },
  TIMEOUT: { bg: 'var(--mg-error-soft)', fg: 'var(--mg-error)', label: 'TIMEOUT' },
  OFFLINE: { bg: 'var(--mg-error-soft)', fg: 'var(--mg-error)', label: 'OFFLINE' },
  CONFIGURATION_ERROR: { bg: 'var(--mg-error-soft)', fg: 'var(--mg-error)', label: 'CONFIG ERROR' },
  DATABASE_ERROR: { bg: 'var(--mg-error-soft)', fg: 'var(--mg-error)', label: 'DATABASE ERROR' },
};

export function StateBadge({ state }: { state: string }) {
  const s = STATE_STYLE[state] ?? { bg: 'var(--mg-glass-bg)', fg: 'var(--mg-text-muted)', label: state };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px', borderRadius: 'var(--mg-radius-pill)',
      background: s.bg, color: s.fg,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {s.label}
    </span>
  );
}

/** A titled card. `mg-card` keeps the panel visually one product. */
export function Panel({
  title, hint, actions, children, style,
}: {
  title?: string; hint?: string; actions?: ReactNode; children: ReactNode; style?: React.CSSProperties;
}) {
  return (
    <section className="mg-card" style={{ padding: 18, marginBottom: 18, ...style }}>
      {(title || actions) && (
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: hint ? 4 : 14 }}>
          {title ? <h2 className="mg-section-title" style={{ fontSize: 'var(--mg-text-lg)' }}>{title}</h2> : <span />}
          {actions}
        </header>
      )}
      {hint ? <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--mg-text-muted)', lineHeight: 1.5, maxWidth: 780 }}>{hint}</p> : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 'var(--mg-radius-md)',
      border: '1px solid var(--mg-border)', background: 'var(--mg-surface-2)',
    }}>
      <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.05em', color: 'var(--mg-text-faint)', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '5px 0 0', fontSize: 'var(--mg-text-xl)', fontWeight: 700, fontFamily: 'var(--font-display)', color: tone || 'var(--mg-text)' }}>{value}</p>
    </div>
  );
}

export type BannerTone = 'success' | 'warning' | 'error' | 'info';

/**
 * The one banner every write in the panel goes through.
 *
 * `tone` is chosen by the caller from what the SERVER said, never from what
 * the click hoped. A 'pending' propagation must arrive here as a warning,
 * because "stored but not live" is not the same claim as "saved".
 */
export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  const map = {
    success: { bg: 'var(--mg-success-soft)', fg: 'var(--mg-success)', Icon: CheckCircle2 },
    warning: { bg: 'var(--mg-warning-soft)', fg: 'var(--mg-warning)', Icon: AlertTriangle },
    error: { bg: 'var(--mg-error-soft)', fg: 'var(--mg-error)', Icon: XCircle },
    info: { bg: 'var(--mg-info-soft)', fg: 'var(--mg-info)', Icon: CheckCircle2 },
  } as const;
  const { bg, fg, Icon } = map[tone];
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'flex-start', gap: 9,
      padding: '10px 12px', borderRadius: 'var(--mg-radius-md)',
      background: bg, color: fg, fontSize: 13, lineHeight: 1.5,
    }}>
      <Icon size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p style={{
      margin: 0, padding: '18px 14px', textAlign: 'center',
      border: '1px dashed var(--mg-border)', borderRadius: 'var(--mg-radius-md)',
      fontSize: 13, color: 'var(--mg-text-muted)',
    }}>
      {children}
    </p>
  );
}

/**
 * Load a JSON admin API, with the three states an operator actually needs:
 * loading, loaded, and refused (with the server's reason, not a guess).
 */
export function useAdminResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(path, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || body?.code || `Request failed (${res.status})`);
        setData(null);
        return;
      }
      setData(body as T);
    } catch {
      setError('The server could not be reached.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { void load(); }, [load]);

  return { data, error, loading, reload: load };
}

export function Loading() {
  return (
    <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--mg-text-muted)' }}>
      <Loader2 size={14} className="mg-spin" /> Loading…
    </p>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" className="mg-btn mg-btn-ghost" onClick={onClick} disabled={busy}>
      <RefreshCw size={14} /> {busy ? 'Working…' : 'Refresh'}
    </button>
  );
}

/** A read/write text field on the shared tokens. */
export function Field({
  label, value, onChange, placeholder, hint, type = 'text', disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; type?: string; disabled?: boolean;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span className="mg-label">{label}</span>
      <input
        className="mg-input"
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ marginTop: 6 }}
      />
      {hint ? <span style={{ display: 'block', marginTop: 5, fontSize: 11.5, color: 'var(--mg-text-faint)' }}>{hint}</span> : null}
    </label>
  );
}