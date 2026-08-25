'use client';

import Link from 'next/link';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const DIGIT_COUNT = 6;
const ORBIT_RADIUS = 120;
const SLOT_SIZE = 40;

function slotPosition(i: number, r: number, cx: number, cy: number) {
  const angle = (Math.PI * 2 * i) / DIGIT_COUNT - Math.PI / 2;
  return {
    x: cx + r * Math.cos(angle) - SLOT_SIZE / 2,
    y: cy + r * Math.sin(angle) - SLOT_SIZE / 2,
    deg: (angle * 180) / Math.PI,
  };
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
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
        setTimeout(() => setVerdict('idle'), 1200);
      }
    } catch {
      setVerdict('bad');
      setError('An error occurred. Please try again.');
      setTimeout(() => setVerdict('idle'), 1200);
    } finally {
      setLoading(false);
    }
  };

  const hubCx = ORBIT_RADIUS + SLOT_SIZE / 2 + 16;
  const hubCy = ORBIT_RADIUS + SLOT_SIZE / 2 + 16;
  const svgSize = (ORBIT_RADIUS + SLOT_SIZE / 2 + 16) * 2;
  const ringColor = verdict === 'ok' ? '#2eeba8' : verdict === 'bad' ? '#ff4d6a' : 'rgba(255,214,10,0.25)';

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'var(--mario-bg)' }}>
      <style jsx>{`
        .orbit-container {
          position: relative;
          width: ${svgSize}px;
          height: ${svgSize}px;
          margin: 0 auto 24px;
        }
        .orbit-ring {
          position: absolute;
          inset: 0;
        }
        .orbit-hub {
          position: absolute;
          left: ${hubCx - 18}px;
          top: ${hubCy - 18}px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255,214,10,0.12);
          border: 2px solid rgba(255,214,10,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          z-index: 2;
          transition: border-color 0.4s, background 0.4s;
        }
        .orbit-hub.verdict-ok { border-color: #2eeba8; background: rgba(46,235,168,0.12); }
        .orbit-hub.verdict-bad { border-color: #ff4d6a; background: rgba(255,77,106,0.12); }
        .digit-slot {
          position: absolute;
          width: ${SLOT_SIZE}px;
          height: ${SLOT_SIZE}px;
          z-index: 3;
          transition: border-color 0.4s, box-shadow 0.4s;
        }
        .digit-slot input {
          width: 100%;
          height: 100%;
          border-radius: 10px;
          border: 2px solid rgba(255,214,10,0.25);
          background: rgba(26,26,42,0.9);
          backdrop-filter: blur(8px);
          color: var(--mario-yellow);
          font-family: var(--font-arcade);
          font-size: 18px;
          font-weight: 700;
          text-align: center;
          outline: none;
          transition: border-color 0.3s, box-shadow 0.3s, background 0.3s;
          caret-color: transparent;
        }
        .digit-slot input:focus {
          border-color: var(--mario-yellow);
          box-shadow: 0 0 0 3px rgba(255,214,10,0.15), 0 0 16px rgba(255,214,10,0.1);
          background: rgba(30,30,50,0.95);
        }
        .digit-slot input.filled {
          border-color: rgba(255,214,10,0.5);
          background: rgba(255,214,10,0.06);
        }
        .digit-slot.verdict-ok input {
          border-color: #2eeba8;
          box-shadow: 0 0 12px rgba(46,235,168,0.2);
          color: #2eeba8;
        }
        .digit-slot.verdict-bad input {
          border-color: #ff4d6a;
          box-shadow: 0 0 12px rgba(255,77,106,0.2);
          color: #ff4d6a;
          animation: slotShake 0.4s ease-in-out;
        }
        @keyframes slotShake {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-3px, 1px); }
          40% { transform: translate(3px, -1px); }
          60% { transform: translate(-2px, 2px); }
          80% { transform: translate(2px, -2px); }
        }
      `}</style>

      <div className="w-full max-w-md">
        <div style={{
          background: 'var(--mario-bg-card)',
          border: '2px solid rgba(255,214,10,0.2)',
          borderRadius: '20px',
          padding: '32px 24px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          <div className="flex flex-col items-center gap-3 mb-6">
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(72,149,239,0.15)', border: '2px solid rgba(72,149,239,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
            }}>📧</div>
            <div className="text-center">
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-blue)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                Verify Your Email
              </p>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--mario-text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '2px' }}>
                One last step!
              </p>
            </div>
          </div>

          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: 'var(--mario-yellow)', textAlign: 'center', marginBottom: '4px' }}>
            ENTER CODE
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', textAlign: 'center', marginBottom: '4px' }}>
            We sent a 6-digit code to your email.
          </p>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: 'var(--mario-yellow)', textAlign: 'center', marginBottom: '24px' }}>
            Check your inbox (and spam folder!)
          </p>

          <form onSubmit={handleVerify}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'var(--mario-yellow)', textTransform: 'uppercase', letterSpacing: '0.15em', display: 'block', marginBottom: '8px' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)', background: 'var(--mario-bg-input)',
                  color: 'var(--mario-text)', fontSize: '13px', outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            <div className="orbit-container">
              <svg className="orbit-ring" viewBox={`0 0 ${svgSize} ${svgSize}`} fill="none">
                <circle
                  cx={hubCx}
                  cy={hubCy}
                  r={ORBIT_RADIUS}
                  stroke={ringColor}
                  strokeWidth="1.5"
                  strokeDasharray="2 8"
                  vectorEffect="non-scaling-stroke"
                  style={{ transition: 'stroke 0.4s' }}
                />
              </svg>

              <div className={`orbit-hub ${verdict === 'ok' ? 'verdict-ok' : verdict === 'bad' ? 'verdict-bad' : ''}`}>
                {verdict === 'ok' ? '✓' : verdict === 'bad' ? '✗' : '✉'}
              </div>

              {Array.from({ length: DIGIT_COUNT }).map((_, i) => {
                const pos = slotPosition(i, ORBIT_RADIUS, hubCx, hubCy);
                return (
                  <div
                    key={i}
                    className={`digit-slot ${verdict === 'ok' ? 'verdict-ok' : verdict === 'bad' ? 'verdict-bad' : ''}`}
                    style={{
                      left: `${pos.x}px`,
                      top: `${pos.y}px`,
                      transformOrigin: `${hubCx - pos.x}px ${hubCy - pos.y}px`,
                      opacity: mounted ? 1 : 0,
                      transform: mounted ? 'scale(1)' : 'scale(0.1)',
                      transition: mounted
                        ? `opacity 0.4s ease ${i * 0.06}s, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.06}s`
                        : 'none',
                    }}
                  >
                    <input
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={digits[i]}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={i === 0 ? handlePaste : undefined}
                      className={digits[i] ? 'filled' : ''}
                    />
                  </div>
                );
              })}
            </div>

            {error && (
              <div style={{
                border: '2px solid var(--mario-red)', borderRadius: '8px',
                background: 'rgba(230,57,70,0.1)', padding: '10px 14px',
                fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'var(--mario-red)',
                marginBottom: '12px', textAlign: 'center',
              }}>
                ⚠ {error}
              </div>
            )}
            {success && (
              <div style={{
                border: '2px solid var(--mario-green)', borderRadius: '8px',
                background: 'rgba(6,214,160,0.1)', padding: '10px 14px',
                fontFamily: 'var(--font-arcade)', fontSize: '9px', color: 'var(--mario-green)',
                marginBottom: '12px', textAlign: 'center',
              }}>
                ✓ {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== DIGIT_COUNT}
              style={{
                width: '100%', height: '42px', borderRadius: '10px',
                border: '2px solid var(--mario-yellow)',
                background: 'rgba(255,214,10,0.15)',
                color: 'var(--mario-yellow)',
                fontFamily: 'var(--font-arcade)', fontSize: '12px', fontWeight: 700,
                cursor: loading || code.length !== DIGIT_COUNT ? 'not-allowed' : 'pointer',
                opacity: loading || code.length !== DIGIT_COUNT ? 0.4 : 1,
                transition: 'all 0.2s',
                marginTop: '8px',
              }}
            >
              {loading ? 'VERIFYING...' : 'VERIFY EMAIL'}
            </button>
          </form>

          <div style={{ margin: '24px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          <Link
            href="/"
            style={{
              display: 'block', textAlign: 'center', padding: '10px',
              borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
              background: 'var(--mario-bg-input)', color: 'var(--mario-text)',
              fontSize: '12px', textDecoration: 'none', fontWeight: 600,
            }}
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
