'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/app/contexts/AuthContext';
import MuraStreamLoader from '@/app/murastream/components/MuraStreamLoader';

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
    return <MuraStreamLoader text="Loading..." />;
  }

  // Error state — show recoverable error
  if (state === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '16px', color: '#ef4444', marginBottom: '12px' }}>
            Something went wrong
          </p>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: '#888', marginBottom: '20px' }}>
            We couldn&apos;t verify your session. Please try again.
          </p>
          <button onClick={() => window.location.reload()} style={{
            padding: '10px 24px', borderRadius: '8px', border: '1px solid rgba(229,9,20,0.3)',
            background: 'rgba(229,9,20,0.1)', color: '#E50914',
            fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>
            Retry
          </button>
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
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Card */}
        <div style={{
          background: '#111', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px', padding: '40px 32px',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '14px',
              background: 'rgba(229,9,20,0.15)', border: '1px solid rgba(229,9,20,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="#E50914" viewBox="0 0 1024 1024">
                <path d="M0 0h1024v1024H0z" fill="none" />
                <path fill="currentColor" d="M912 302.3L784 376V224c0-35.3-28.7-64-64-64H128c-35.3 0-64 28.7-64 64v576c0 35.3 28.7 64 64 64h592c35.3 0 64-28.7 64-64V648l128 73.7c21.3 12.3 48-3.1 48-27.6V330c0-24.6-26.7-40-48-27.7M712 792H136V232h576zm176-167l-104-59.8V458.9L888 399zM208 360h112c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H208c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8" />
              </svg>
            </div>
            <h1 style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              fontSize: '22px', fontWeight: 800, color: '#F5F5F5', margin: '0 0 6px',
            }}>
              MuraGoods
            </h1>
            <p style={{
              fontFamily: '-apple-system, sans-serif',
              fontSize: '14px', color: '#888', margin: 0,
            }}>
              {mode === 'login' ? 'Welcome back. Sign in to continue.' : 'Create an account to get started.'}
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '4px' }}>
            <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: mode === 'login' ? 'rgba(229,9,20,0.15)' : 'transparent',
              color: mode === 'login' ? '#E50914' : '#888',
              fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600,
              transition: 'all 0.2s',
            }}>
              Sign In
            </button>
            <button onClick={() => { setMode('signup'); setError(''); setSuccess(''); }} style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: mode === 'signup' ? 'rgba(229,9,20,0.15)' : 'transparent',
              color: mode === 'signup' ? '#E50914' : '#888',
              fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: 600,
              transition: 'all 0.2s',
            }}>
              Create Account
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 600, color: '#888', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#E5E5E5', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                    fontFamily: '-apple-system, sans-serif',
                  }} />
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 600, color: '#888', marginBottom: '6px' }}>
                Email
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#E5E5E5', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                  fontFamily: '-apple-system, sans-serif',
                }} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 600, color: '#888', marginBottom: '6px' }}>
                Password
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#E5E5E5', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                  fontFamily: '-apple-system, sans-serif',
                }} />
            </div>

            {mode === 'signup' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontFamily: '-apple-system, sans-serif', fontSize: '12px', fontWeight: 600, color: '#888', marginBottom: '6px' }}>
                  Confirm Password
                </label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#E5E5E5', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                    fontFamily: '-apple-system, sans-serif',
                  }} />
              </div>
            )}

            {/* Error message */}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: '#ef4444',
              }}>
                {error}
              </div>
            )}

            {/* Success message */}
            {success && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
                background: 'rgba(6,214,160,0.1)', border: '1px solid rgba(6,214,160,0.2)',
                fontFamily: '-apple-system, sans-serif', fontSize: '13px', color: '#06d6a0',
              }}>
                ✓ {success}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
              background: '#E50914', color: '#FFF', cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: '-apple-system, sans-serif', fontSize: '14px', fontWeight: 700,
              opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
              boxShadow: '0 4px 20px rgba(229,9,20,0.3)',
            }}>
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Forgot Password + Resend Verification — login mode only */}
          {mode === 'login' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <Link href="/forgot-password" style={{
                fontFamily: '-apple-system, sans-serif', fontSize: '13px',
                color: '#E50914', textDecoration: 'none', fontWeight: 500,
              }}>
                Forgot Password?
              </Link>
              <button
                onClick={handleResendVerification}
                disabled={resending || !email}
                style={{
                  background: 'none', border: 'none', cursor: resending ? 'not-allowed' : 'pointer',
                  fontFamily: '-apple-system, sans-serif', fontSize: '13px',
                  color: resending ? '#555' : '#888', fontWeight: 500,
                  padding: 0,
                }}
              >
                {resending ? 'Sending...' : 'Resend Code'}
              </button>
            </div>
          )}
        </div>

        {/* Back to MuraGoods */}
        <Link href="/" style={{
          display: 'block', textAlign: 'center', marginTop: '16px',
          fontFamily: '-apple-system, sans-serif', fontSize: '13px',
          color: '#666', textDecoration: 'none',
        }}>
          ← Back to MuraGoods
        </Link>
      </div>
    </div>
  );
}
