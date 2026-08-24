'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !code) { setError('Please enter your email and verification code'); return; }
    if (code.length !== 6) { setError('Code must be 6 digits'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess('Email verified! Redirecting...');
        // Update local user data
        try {
          const userStr = localStorage.getItem('user');
          if (userStr) {
            const user = JSON.parse(userStr);
            user.emailVerified = true;
            localStorage.setItem('user', JSON.stringify(user));
          }
        } catch { /* empty */ }
        setTimeout(() => router.push('/'), 1500);
      } else {
        setError(result.error || 'Verification failed');
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
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(72,149,239,0.15)', border: '2px solid rgba(72,149,239,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
              📧
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--blue)]" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--mario-blue)' }}>
                Verify Your Email
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--pewter)]">
                One last step!
              </p>
            </div>
          </div>

          <h1 className="text-lg mb-2 text-center text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>ENTER CODE</h1>
          <p className="text-xs text-[var(--pewter)] mb-2 text-center">Enter the 6-digit verification code.</p>
          <p className="text-[10px] text-[var(--gold)] mb-6 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>Ask an admin at @muragoods_ for your code</p>

          <form onSubmit={handleVerify} className="space-y-4">
            <label className="block">
              <span className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="deco-input" placeholder="your@email.com" />
            </label>
            <label className="block">
              <span className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block" style={{ fontFamily: 'var(--font-arcade)' }}>Verification Code</span>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="deco-input" placeholder="000000" maxLength={6} style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontFamily: 'var(--font-arcade)' }} />
            </label>
            {error && <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-3 text-[9px] text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)' }}>⚠ {error}</div>}
            {success && <div className="border-2 border-[var(--emerald)] bg-[rgba(6,214,160,0.1)] p-3 text-[9px] text-[var(--emerald)]" style={{ fontFamily: 'var(--font-arcade)' }}>✓ {success}</div>}
            <button type="submit" disabled={loading} className="deco-btn deco-btn-gold w-full deco-btn-lg mt-4">
              {loading ? 'VERIFYING...' : 'VERIFY EMAIL'}
            </button>
          </form>

          <div className="my-6"><hr className="deco-divider" /></div>
          <Link href="/" className="deco-btn w-full text-center">← Back to Home</Link>
        </div>
      </div>
    </main>
  );
}
