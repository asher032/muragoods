'use client';

// Content lock gate — when the admin flips "contentLocked" in /admin, every
// page wrapped in this gate shows a closed notice to everyone except admins.
// Admins keep full access and see a small amber "locked" banner with a quick
// way back to the switch. The lock state lives in Mongo (SiteFlag), so it
// takes effect on every client without a redeploy.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/app/contexts/AuthContext';

type LockState = 'checking' | 'open' | 'locked-for-me' | 'locked-for-others';

export default function ContentLockGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<LockState>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/site-flags', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        const locked = !!data?.data?.contentLocked;
        if (cancelled) return;
        if (!locked) {
          setState('open');
          return;
        }
        const admins = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'mhaxthedog@gmail.com,muragoods0@gmail.com')
          .split(',').map(e => e.trim().toLowerCase());
        const isAdmin = user?.role === 'admin' || (!!user?.email && admins.includes(user.email.toLowerCase()));
        setState(isAdmin ? 'locked-for-others' : 'locked-for-me');
      } catch {
        // On API failure, stay open — the lock must never brick the site by accident.
        if (!cancelled) setState('open');
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (state === 'checking') return <>{children}</>;

  if (state === 'locked-for-me') {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--mg-bg)', color: 'var(--mg-text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}>
        <div className="mg-card" style={{ textAlign: 'center', maxWidth: '440px', padding: '40px 36px' }}>
          <Lock color="var(--mg-brand)" size={44} style={{ marginBottom: '20px' }} aria-hidden />
          <h1 style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--mg-text-2xl)', fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.02em',
            color: 'var(--mg-text-strong)',
          }}>
            MuraStream is taking a break
          </h1>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--mg-text-base)', color: 'var(--mg-text-muted)', margin: '0 0 28px',
            lineHeight: 'var(--mg-leading-normal)',
          }}>
            Streaming is temporarily unavailable. Please check back soon.
          </p>
          <Link href="/hub" className="mg-btn mg-btn-primary">
            Back to Hub
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {state === 'locked-for-others' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
          background: 'var(--mg-warning-soft)', borderBottom: '1px solid rgba(251,191,36,0.3)',
          padding: '8px 16px', position: 'sticky', top: 0, zIndex: 60,
        }}>
          <ShieldAlert color="var(--mg-warning)" size={14} aria-hidden />
          <span style={{
            fontFamily: 'var(--font-sans)', fontSize: 'var(--mg-text-xs)',
            color: 'var(--mg-warning)', fontWeight: 600,
          }}>
            Content lock is ON — only you can see this.{' '}
            <Link href="/admin" style={{ color: 'var(--mg-warning)', textDecoration: 'underline' }}>Open the switch</Link>
          </span>
        </div>
      )}
      {children}
    </>
  );
}
