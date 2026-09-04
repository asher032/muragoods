'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';

export default function SignupPage() {
  const { user, state, signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreeToTos, setAgreeToTos] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();

  // If already authenticated, redirect away
  useEffect(() => {
    if (state === 'authenticated' && user) {
      if (user.email === 'admin@muragoods.com') {
        router.push('/admin');
      } else {
        router.push('/');
      }
    }
  }, [state, user, router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!agreeToTos) {
      setError('You must agree to the Terms of Service');
      return;
    }

    setLoading(true);
    try {
      const result = await signup(name, email, password);
      if (result.success) {
        setEmailSent(true);
        setShowSuccess(true);
      } else {
        setError(result.error || 'Signup failed');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 page-enter">
      <div className="w-full max-w-md">
        <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-8">
          {/* Logo + Brand */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative w-20 h-20 border-2 border-[var(--gold)] overflow-hidden">
              <Image src="/images/signup-badge.png" alt="Muragoods Signup" fill className="object-cover" />
            </div>
            <div className="text-center">
              <p
                className="text-[10px] uppercase tracking-[0.2em] text-[var(--emerald-bright)]"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Muragoods
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--pewter)]">
                Create Account
              </p>
            </div>
          </div>

          <h1
            className="text-xl mb-2 text-center text-[var(--cream)]"
            style={{ fontFamily: 'var(--font-arcade)' }}
          >
            JOIN THE CREW
          </h1>
          <p className="text-sm text-[var(--pewter)] mb-8 text-center">
            Create your account to start ordering
          </p>

          <form onSubmit={handleSignup} className="space-y-5">
            <label className="block">
              <span
                className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Full Name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="deco-input"
                placeholder="Your name"
              />
            </label>

            <label className="block">
              <span
                className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="deco-input"
                placeholder="your@email.com"
              />
            </label>

            <label className="block">
              <span
                className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="deco-input"
                placeholder="••••••••"
              />
            </label>

            <label className="block">
              <span
                className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Referral Code (optional)
              </span>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                className="deco-input"
                placeholder="e.g. MURA-A1B2C3D4"
              />
            </label>

            <label className="block">
              <span
                className="text-[9px] text-[var(--gold)] uppercase tracking-[0.15em] mb-2 block"
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                Confirm Password
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="deco-input"
                placeholder="••••••••"
              />
            </label>

            {/* Terms of Service */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeToTos}
                onChange={(e) => setAgreeToTos(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[var(--gold)]"
                style={{ minWidth: '16px' }}
              />
              <span className="text-xs text-[var(--cream-muted)]" style={{ lineHeight: '1.5' }}>
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="text-[var(--gold)] hover:text-[var(--gold-bright)] underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/terms" target="_blank" className="text-[var(--gold)] hover:text-[var(--gold-bright)] underline">
                  Privacy Policy
                </Link>
              </span>
            </label>

            {error && (
              <div className="border-2 border-[var(--crimson)] bg-[rgba(229,37,33,0.1)] p-3 text-sm text-[var(--crimson)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="deco-btn deco-btn-gold w-full deco-btn-lg mt-6 disabled:opacity-50"
            >
              {loading ? 'CREATING...' : 'CREATE ACCOUNT'}
            </button>
          </form>

          <div className="my-8">
            <hr className="deco-divider" />
          </div>

          <p className="text-center text-sm text-[var(--cream-muted)]">
            Have an account?{' '}
            <Link href="/login" className="text-[var(--gold)] hover:text-[var(--gold-bright)] underline transition-colors">
              Sign in!
            </Link>
          </p>

          <Link href="/" className="deco-btn w-full mt-6 text-center">
            ← Back to Shop
          </Link>
        </div>
      </div>
      {/* ─── Success Modal ─────────────────────────────── */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md border-2 border-[var(--emerald)] bg-[var(--charcoal)] p-8" style={{ borderRadius: '16px' }}>
            <div className="text-center">
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(6,214,160,0.15)', border: '2px solid rgba(6,214,160,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px' }}>
                📧
              </div>
              <h2 className="text-lg mb-2 text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>ACCOUNT CREATED!</h2>
              <p className="text-sm text-[var(--cream-muted)] mb-4">
                {emailSent
                  ? <>We sent a <strong style={{ color: 'var(--mario-yellow)' }}>6-digit code</strong> to your email. Check your inbox!</>
                  : <>Your account is ready. You can verify your email later.</>
                }
              </p>
              <div style={{ background: 'rgba(255,214,10,0.06)', border: '1px solid rgba(255,214,10,0.15)', borderRadius: '8px', padding: '12px', marginBottom: '20px' }}>
                <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>Go to <strong style={{ color: 'var(--mario-yellow)' }}>muragoods.vercel.app/verify-email</strong> and enter the code.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setShowSuccess(false); router.push('/verify-email'); }} style={{ flex: 1, padding: '12px', background: 'var(--mario-yellow)', border: 'none', borderRadius: '10px', color: '#0f0f1a', fontFamily: 'var(--font-arcade)', fontSize: '10px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 0 var(--mario-yellow-dark)' }}>
                  VERIFY NOW
                </button>
                <button onClick={() => { setShowSuccess(false); router.push('/'); }} style={{ flex: 1, padding: '12px', background: 'var(--mario-bg-card)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'var(--mario-text)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
