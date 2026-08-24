'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'email' | 'verify' | 'reset';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Please enter your email address'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess(result.message || 'A verification code has been generated. Ask an admin for your code.');
        setStep('verify');
      } else {
        setError(result.error || 'Failed to generate code');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code || code.length !== 6) { setError('Please enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess('Code verified! Set your new password below.');
        setStep('reset');
      } else {
        setError(result.error || 'Invalid or expired code');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newPassword || newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess('Password reset successfully! Redirecting to login...');
        setTimeout(() => router.push('/login'), 2000);
      } else {
        setError(result.error || 'Failed to reset password');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-8">
          <div className="flex flex-col items-center gap-3 mb-8">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,214,10,0.15)', border: '2px solid rgba(255,214,10,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
              🔑
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                Muragoods
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--pewter)]">
                {step === 'email' ? 'Reset Password' : step === 'verify' ? 'Enter Code' : 'New Password'}
              </p>
            </div>
          </div>

          {step === 'email' && (
            <>
              <h1 className="text-lg mb-2 text-center text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>FORGOT PASSWORD?</h1>
              <p className="text-xs text-[var(--pewter)] mb-6 text-center">Enter your email and we&apos;ll generate a verification code for you.</p>
              <form onSubmit={handleRequestCode} className="space-y-4">
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Email Address</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="deco-input" placeholder="your@email.com" />
                </label>
                {error && <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-3 text-[9px] text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>⚠ {error}</div>}
                {success && <div className="border-2 border-[var(--emerald)] bg-[rgba(6,214,160,0.1)] p-3 text-[9px] text-[var(--emerald)]" style={{ fontFamily: 'var(--font-arcade)' }}>✓ {success}</div>}
                <button type="submit" disabled={loading} className="deco-btn deco-btn-gold w-full deco-btn-lg mt-4">
                  {loading ? 'GENERATING...' : 'GET CODE'}
                </button>
              </form>
            </>
          )}

          {step === 'verify' && (
            <>
              <h1 className="text-lg mb-2 text-center text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>ENTER CODE</h1>
              <p className="text-xs text-[var(--pewter)] mb-2 text-center">We generated a 6-digit code for you.</p>
              <p className="text-[10px] text-[var(--gold)] mb-6 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>Ask an admin for your code at @muragoods_</p>
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Verification Code</span>
                  <input type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="deco-input" placeholder="000000" maxLength={6} style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontFamily: 'var(--font-arcade)' }} />
                </label>
                {error && <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-3 text-[9px] text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>⚠ {error}</div>}
                {success && <div className="border-2 border-[var(--emerald)] bg-[rgba(6,214,160,0.1)] p-3 text-[9px] text-[var(--emerald)]" style={{ fontFamily: 'var(--font-arcade)' }}>✓ {success}</div>}
                <button type="submit" disabled={loading} className="deco-btn deco-btn-gold w-full deco-btn-lg mt-4">
                  {loading ? 'VERIFYING...' : 'VERIFY CODE'}
                </button>
              </form>
            </>
          )}

          {step === 'reset' && (
            <>
              <h1 className="text-lg mb-2 text-center text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>NEW PASSWORD</h1>
              <p className="text-xs text-[var(--pewter)] mb-6 text-center">Choose a new password for your account.</p>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>New Password</span>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="deco-input" placeholder="••••••••" />
                </label>
                <label className="block">
                  <span className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Confirm Password</span>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="deco-input" placeholder="••••••••" />
                </label>
                {error && <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-3 text-[9px] text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>⚠ {error}</div>}
                {success && <div className="border-2 border-[var(--emerald)] bg-[rgba(6,214,160,0.1)] p-3 text-[9px] text-[var(--emerald)]" style={{ fontFamily: 'var(--font-arcade)' }}>✓ {success}</div>}
                <button type="submit" disabled={loading} className="deco-btn deco-btn-gold w-full deco-btn-lg mt-4">
                  {loading ? 'RESETTING...' : 'RESET PASSWORD'}
                </button>
              </form>
            </>
          )}

          <div className="my-6"><hr className="deco-divider" /></div>
          <Link href="/login" className="deco-btn w-full text-center">← Back to Login</Link>
        </div>
      </div>
    </main>
  );
}
