'use client';

import Link from 'next/link';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const DIGIT_COUNT = 6;

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [verdict, setVerdict] = useState<'idle' | 'ok' | 'bad'>('idle');
  const [mounted, setMounted] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (mounted) inputRefs.current[0]?.focus();
  }, [mounted]);

  const handleDigitChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGIT_COUNT);
    if (!pasted) return;
    const next = Array(DIGIT_COUNT).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const focusIdx = Math.min(pasted.length, DIGIT_COUNT - 1);
    inputRefs.current[focusIdx]?.focus();
  }, []);

  const code = digits.join('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setVerdict('idle');
    if (!email) { setError('Please enter your email'); return; }
    if (code.length !== DIGIT_COUNT) { setError('Enter all 6 digits'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const result = await res.json();
      if (result.success) {
        setVerdict('ok');
        setSuccess('Email verified! Redirecting...');
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
        setVerdict('bad');
        setError(result.error || 'Verification failed');
        setTimeout(() => setVerdict('idle'), 1500);
      }
    } catch {
      setVerdict('bad');
      setError('An error occurred. Please try again.');
      setTimeout(() => setVerdict('idle'), 1500);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) { setError('Enter your email first'); return; }
    setResending(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess('New code sent! Check your inbox.');
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
    <main className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'var(--mario-bg)' }}>
      <style jsx>{`
        .verify-container {
          width: 100%;
          max-width: 400px;
          opacity: ${mounted ? 1 : 0};
          transform: translateY(${mounted ? '0' : '20px'});
          transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .verify-card {
          background: var(--mario-bg-card);
          border: 2px solid rgba(255,214,10,0.15);
          border-radius: 20px;
          padding: 36px 28px;
          backdrop-filter: blur(16px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .logo-icon {
          width: 64px; height: 64px; border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,214,10,0.15), rgba(255,214,10,0.05));
          border: 2px solid rgba(255,214,10,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 28px; margin: 0 auto 16px;
          box-shadow: 0 4px 20px rgba(255,214,10,0.15);
          animation: float-glow 3s ease-in-out infinite;
        }
        @keyframes float-glow {
          0%, 100% { transform: translateY(0); box-shadow: 0 4px 20px rgba(255,214,10,0.15); }
          50% { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(255,214,10,0.25); }
        }
        .title {
          font-family: var(--font-arcade); font-size: 14px;
          color: var(--mario-yellow); text-align: center;
          letter-spacing: 0.15em; margin-bottom: 4px;
        }
        .subtitle {
          font-size: 13px; color: var(--mario-text-muted);
          text-align: center; margin-bottom: 28px; line-height: 1.5;
        }
        .input-group { margin-bottom: 20px; }
        .input-label {
          font-family: var(--font-arcade); font-size: 9px;
          color: var(--mario-yellow); text-transform: uppercase;
          letter-spacing: 0.15em; display: block; margin-bottom: 8px;
        }
        .email-input {
          width: 100%; height: 44px; padding: 0 14px;
          border-radius: 10px; border: 1.5px solid rgba(255,255,255,0.08);
          background: var(--mario-bg-input); color: var(--mario-text);
          font-size: 14px; outline: none; font-family: var(--font-body);
          transition: border-color 0.3s, box-shadow 0.3s;
          box-sizing: border-box;
        }
        .email-input:focus {
          border-color: rgba(255,214,10,0.4);
          box-shadow: 0 0 0 3px rgba(255,214,10,0.08);
        }
        .digits-row {
          display: flex; gap: 8px; justify-content: center;
          margin-bottom: 24px;
        }
        .digit-input {
          width: 48px; height: 56px; border-radius: 12px;
          border: 2px solid rgba(255,214,10,0.2);
          background: rgba(26,26,42,0.9);
          color: var(--mario-yellow);
          font-family: var(--font-arcade); font-size: 22px;
          font-weight: 700; text-align: center; outline: none;
          transition: border-color 0.3s, box-shadow 0.3s, background 0.3s, transform 0.2s;
          caret-color: transparent;
        }
        .digit-input:focus {
          border-color: var(--mario-yellow);
          box-shadow: 0 0 0 3px rgba(255,214,10,0.12), 0 0 20px rgba(255,214,10,0.08);
          background: rgba(30,30,50,0.95);
          transform: scale(1.05);
        }
        .digit-input.filled {
          border-color: rgba(255,214,10,0.4);
          background: rgba(255,214,10,0.06);
        }
        .digit-input.verdict-ok {
          border-color: #2eeba8; color: #2eeba8;
          box-shadow: 0 0 15px rgba(46,235,168,0.2);
        }
        .digit-input.verdict-bad {
          border-color: #ff4d6a; color: #ff4d6a;
          box-shadow: 0 0 15px rgba(255,77,106,0.2);
          animation: shake 0.5s ease-in-out;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        .verify-btn {
          width: 100%; height: 48px; border-radius: 12px;
          border: 2px solid var(--mario-yellow);
          background: linear-gradient(135deg, rgba(255,214,10,0.2), rgba(255,214,10,0.1));
          color: var(--mario-yellow);
          font-family: var(--font-arcade); font-size: 13px; font-weight: 700;
          cursor: pointer; transition: all 0.25s;
          text-transform: uppercase; letter-spacing: 0.1em;
        }
        .verify-btn:hover:not(:disabled) {
          background: rgba(255,214,10,0.25);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(255,214,10,0.2);
        }
        .verify-btn:active:not(:disabled) { transform: translateY(1px); }
        .verify-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .resend-btn {
          background: none; border: none; color: var(--mario-blue);
          font-size: 12px; cursor: pointer; padding: 8px;
          font-family: var(--font-body); font-weight: 600;
          transition: color 0.2s;
        }
        .resend-btn:hover:not(:disabled) { color: var(--mario-yellow); }
        .resend-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .msg-error {
          border: 1.5px solid var(--mario-red); border-radius: 10px;
          background: rgba(230,57,70,0.08); padding: 10px 14px;
          font-size: 12px; color: var(--mario-red);
          margin-bottom: 12px; text-align: center;
        }
        .msg-success {
          border: 1.5px solid var(--mario-green); border-radius: 10px;
          background: rgba(6,214,160,0.08); padding: 10px 14px;
          font-size: 12px; color: var(--mario-green);
          margin-bottom: 12px; text-align: center;
        }
        .back-link {
          display: block; text-align: center; padding: 12px;
          border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);
          background: var(--mario-bg-input); color: var(--mario-text-muted);
          font-size: 12px; text-decoration: none; font-weight: 600;
          transition: border-color 0.2s;
        }
        .back-link:hover { border-color: rgba(255,214,10,0.3); }
        @media (max-width: 440px) {
          .digits-row { gap: 6px; }
          .digit-input { width: 44px; height: 50px; font-size: 20px; }
          .verify-card { padding: 28px 20px; }
        }
      `}</style>

      <div className="verify-container">
        <div className="verify-card">
          <div className="logo-icon">✉️</div>
          <p className="title">VERIFY YOUR EMAIL</p>
          <p className="subtitle">
            We sent a 6-digit code to your email.<br />
            Enter it below to activate your account.
          </p>

          <form onSubmit={handleVerify}>
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="email-input"
              />
            </div>

            <div className="input-group">
              <label className="input-label" style={{ textAlign: 'center', display: 'block' }}>
                Verification Code
              </label>
              <div className="digits-row">
                {Array.from({ length: DIGIT_COUNT }).map((_, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digits[i]}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    className={`digit-input ${digits[i] ? 'filled' : ''} ${
                      verdict === 'ok' ? 'verdict-ok' : verdict === 'bad' ? 'verdict-bad' : ''
                    }`}
                    style={{
                      opacity: mounted ? 1 : 0,
                      transform: mounted ? 'translateY(0)' : 'translateY(10px)',
                      transition: `opacity 0.3s ease ${i * 0.05}s, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.05}s, border-color 0.3s, box-shadow 0.3s, background 0.3s`,
                    }}
                  />
                ))}
              </div>
            </div>

            {error && <div className="msg-error">⚠ {error}</div>}
            {success && <div className="msg-success">✓ {success}</div>}

            <button
              type="submit"
              disabled={loading || code.length !== DIGIT_COUNT}
              className="verify-btn"
            >
              {loading ? '⏳ VERIFYING...' : '✓ VERIFY EMAIL'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              onClick={handleResend}
              disabled={resending || !email}
              className="resend-btn"
            >
              {resending ? '⏳ Sending...' : '🔄 Resend Code'}
            </button>
          </div>

          <div style={{ margin: '20px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }} />

          <Link href="/" className="back-link">
            ← Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
