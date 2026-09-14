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
        minHeight: '100vh', background: '#0A0A0A', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '440px' }}>
          <Lock color="#E50914" size={44} style={{ marginBottom: '20px' }} aria-hidden />
          <h1 style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '24px', fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.02em',
          }}>
            MuraStream is taking a break
          </h1>
          <p style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '14px', color: '#999', margin: '0 0 28px', lineHeight: 1.6,
          }}>
            Streaming is temporarily unavailable. Please check back soon.
          </p>
          <Link href="/hub" style={{
            display: 'inline-block', padding: '12px 28px', borderRadius: '10px',
            background: '#E50914', color: '#fff', textDecoration: 'none',
            fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 700,
          }}>
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
          background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(245,158,11,0.3)',
          padding: '8px 16px', position: 'sticky', top: 0, zIndex: 60,
        }}>
          <ShieldAlert color="#f59e0b" size={14} aria-hidden />
          <span style={{
            fontFamily: '-apple-system, sans-serif', fontSize: '12px', color: '#f59e0b', fontWeight: 600,
          }}>
            Content lock is ON — only you can see this.{' '}
            <Link href="/admin" style={{ color: '#fbbf24', textDecoration: 'underline' }}>Open the switch</Link>
          </span>
        </div>
      )}
      {children}
    </>
  );
}
