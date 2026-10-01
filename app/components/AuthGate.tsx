'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/app/contexts/AuthContext';
import { LoadingState } from '@/app/components/ui/States';
import { GlassButton, GlassInput } from '@/app/components/ui';
import { Check } from 'lucide-react';

// Sign-in / sign-up gate.
//
// This screen used to carry its own visual system — a near-black page, a
// red CTA, and the OS UI font — which is exactly why arriving here felt
// like leaving Muragoods. It now renders through the shared primitives, so
// the first thing a visitor sees is the brand: dark glass, Muragoods yellow,
// the Muragoods type ramp.

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, state, login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Loading state — show loader while checking session
  if (state === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--mg-bg)' }}>
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

  // Error state — show recoverable error
  if (state === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '20px', background: 'var(--mg-bg)' }}>
        <div className="mg-card" style={{ maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--mg-text-lg)', color: 'var(--mg-error)', marginBottom: '12px', fontWeight: 700 }}>
            Something went wrong
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--mg-text-sm)', color: 'var(--mg-text-muted)', marginBottom: '20px' }}>
            We couldn&apos;t verify your session. Please try again.
          </p>
          <GlassButton variant="secondary" onClick={() => window.location.reload()}>
            Retry
          </GlassButton>
        </div>
      </div>
    );
  }

  // Authenticated — show the app
  if (state === 'authenticated' && user) {
    return <>{children}</>;
  }

  // Unauthenticated — show login/signup
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'signup') {
      if (!name || !email || !password || !confirmPassword) {
        setError('Please fill in all fields');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }
      const result = await signup(name, email, password);
      if (result.success) {
        setSuccess('Account created! Check your email for a verification code.');
      } else {
        setError(result.error || 'Signup failed');
      }
    } else {
      if (!email || !password) {
        setError('Please fill in all fields');
        setLoading(false);
        return;
      }
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || 'Login failed');
      }
    }

    setLoading(false);
  };

  const handleResendVerification = async () => {
    if (!email) { setError('Enter your email first'); return; }
    setResending(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/auth/verify-email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess(result.message || 'Verification code sent! Check your inbox.');
      } else {
        setError(result.error || 'Failed to resend code');
      }
    } catch {
      setError('Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'var(--mg-bg)' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div className="mg-card" style={{ padding: '40px 32px' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: 'var(--mg-radius-md)',
              background: 'var(--mg-brand-soft)', border: '1px solid var(--mg-border-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="var(--mg-brand)" viewBox="0 0 1024 1024">
                <path d="M0 0h1024v1024H0z" fill="none" />
                <path fill="currentColor" d="M912 302.3L784 376V224c0-35.3-28.7-64-64-64H128c-35.3 0-64 28.7-64 64v576c0 35.3 28.7 64 64 64h592c35.3 0 64-28.7 64-64V648l128 73.7c21.3 12.3 48-3.1 48-27.6V330c0-24.6-26.7-40-48-27.7M712 792H136V232h576zm176-167l-104-59.8V458.9L888 399zM208 360h112c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H208c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8" />
              </svg>
            </div>
            <h1 style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--mg-text-2xl)', fontWeight: 800,
              color: 'var(--mg-text-strong)', margin: '0 0 6px',
            }}>
              MuraGoods
            </h1>
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--mg-text-base)', color: 'var(--mg-text-muted)', margin: 0,
            }}>
              {mode === 'login' ? 'Welcome back. Sign in to continue.' : 'Create an account to get started.'}
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: 'var(--mg-glass-bg)', borderRadius: 'var(--mg-radius-md)', padding: '4px' }}>
            <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} style={{
              flex: 1, padding: '10px', borderRadius: 'var(--mg-radius-sm)', border: 'none', cursor: 'pointer',
              background: mode === 'login' ? 'var(--mg-brand-soft)' : 'transparent',
              color: mode === 'login' ? 'var(--mg-brand)' : 'var(--mg-text-muted)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--mg-text-sm)', fontWeight: 600,
              transition: 'background var(--mg-transition-fast), color var(--mg-transition-fast)',
            }}>
              Sign In
            </button>
            <button onClick={() => { setMode('signup'); setError(''); setSuccess(''); }} style={{
              flex: 1, padding: '10px', borderRadius: 'var(--mg-radius-sm)', border: 'none', cursor: 'pointer',
              background: mode === 'signup' ? 'var(--mg-brand-soft)' : 'transparent',
              color: mode === 'signup' ? 'var(--mg-brand)' : 'var(--mg-text-muted)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--mg-text-sm)', fontWeight: 600,
              transition: 'background var(--mg-transition-fast), color var(--mg-transition-fast)',
            }}>
              Create Account
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div style={{ marginBottom: '16px' }}>
                <label className="mg-label">Full Name</label>
                <GlassInput
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label className="mg-label">Email</label>
              <GlassInput
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label className="mg-label">Password</label>
              <GlassInput
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {mode === 'signup' && (
              <div style={{ marginBottom: '16px' }}>
                <label className="mg-label">Confirm Password</label>
                <GlassInput
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            )}

            {/* Error message */}
            {error && (
              <div role="alert" className="mg-state mg-state-error" style={{ padding: '10px 14px', marginBottom: '16px', textAlign: 'left' }}>
                {error}
              </div>
            )}

            {/* Success message */}
            {success && (
              <div role="status" style={{
                padding: '10px 14px', borderRadius: 'var(--mg-radius-sm)', marginBottom: '16px',
                background: 'var(--mg-success-soft)', border: '1px solid rgba(6,214,160,0.35)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--mg-text-sm)', color: 'var(--mg-success)',
              }}>
                <Check className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> {success}
              </div>
            )}

            <GlassButton type="submit" disabled={loading} className="w-full">
              {loading ? 'Loading…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </GlassButton>
          </form>

          {/* Forgot Password + Resend Verification — login mode only */}
          {mode === 'login' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <Link href="/forgot-password" style={{
                fontFamily: 'var(--font-sans)', fontSize: 'var(--mg-text-sm)',
                color: 'var(--mg-brand)', textDecoration: 'none', fontWeight: 500,
              }}>
                Forgot Password?
              </Link>
              <button
                onClick={handleResendVerification}
                disabled={resending || !email}
                style={{
                  background: 'none', border: 'none', cursor: resending ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--mg-text-sm)',
                  color: resending ? 'var(--mg-text-faint)' : 'var(--mg-text-muted)', fontWeight: 500,
                  padding: 0,
                }}
              >
                {resending ? 'Sending…' : 'Resend Code'}
              </button>
            </div>
          )}
        </div>

        {/* Back to MuraGoods */}
        <Link href="/" style={{
          display: 'block', textAlign: 'center', marginTop: '16px',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--mg-text-sm)',
          color: 'var(--mg-text-muted)', textDecoration: 'none',
        }}>
          ← Back to MuraGoods
        </Link>
      </div>
    </div>
  );
}
