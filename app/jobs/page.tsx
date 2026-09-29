'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useAuth } from '@/app/contexts/AuthContext';
import { fmtCoins, fmtDuration, type JobDef, type JobGame } from '@/app/lib/jobs';

interface Challenge {
  game: JobGame;
  sequence?: number[];
  icons?: string[];
  options?: string[];
  zone?: [number, number];
  periodMs?: number;
  delayMs?: number;
  windowMs?: number;
  deadlineAt?: number;
}

interface ActiveShift {
  token: string;
  job: JobDef;
  challenge: Challenge;
  startedAt: number; // client ms
  deadline: number; // client ms
}

interface HistoryRow {
  jobId: string; jobName: string; icon: string; game: string;
  won: boolean | null; payout: number | null; reason: string; at: string;
}

interface ResultState {
  won: boolean;
  reason: string;
  payout: number;
  payoutLabel: string;
  balance: number | null;
  job: { id: string; name: string; icon: string };
}

const diffColor: Record<string, string> = { Easy: '#06d6a0', Medium: '#ffd60a', Hard: '#e63946' };
const MEMO_PAD = ['☕', '🍩', '🥐', '🧋', '🍰', '🥤', '🍪', '🥧'];

export default function JobsPage() {
  const { state } = useAuth();
  const [jobs, setJobs] = useState<JobDef[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [jl, hl] = await Promise.all([
        fetch('/api/jobs', { cache: 'no-store' }),
        fetch('/api/jobs/history?limit=20', { cache: 'no-store' }),
      ]);
      const jd = (await jl.json().catch(() => null)) as {
        success?: boolean; jobs?: JobDef[]; cooldownSec?: number; cooldownRemaining?: number; error?: string;
      } | null;
      if (!jd?.success) {
        setError(jd?.error || 'Could not load jobs');
      } else {
        setJobs(jd.jobs || []);
        setCooldown(jd.cooldownRemaining || 0);
      }
      const hd = (await hl.json().catch(() => null)) as { success?: boolean; history?: HistoryRow[] } | null;
      if (hd?.success) setHistory(hd.history || []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state === 'authenticated' || state === 'error') void load();
  }, [state, load]);

  // Cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const startShift = async (jobId: string) => {
    if (cooldown > 0 || starting) return;
    setStarting(jobId);
    setResult(null);
    try {
      const res = await fetch('/api/jobs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean; token?: string; job?: JobDef; challenge?: Challenge;
        serverNow?: number; error?: string; cooldownRemaining?: number;
      } | null;
      if (!data?.success || !data.token || !data.job || !data.challenge) {
        setError(data?.error || 'Could not start shift');
        if (typeof data?.cooldownRemaining === 'number') setCooldown(data.cooldownRemaining);
        return;
      }
      const now = Date.now();
      const offset = now - (data.serverNow || now);
      setShift({
        token: data.token,
        job: data.job,
        challenge: data.challenge,
        startedAt: now,
        deadline: (data.challenge.deadlineAt || now + 30000) - offset,
      });
    } catch {
      setError('Network error starting shift');
    } finally {
      setStarting(null);
    }
  };

  const finishShift = useCallback(async (payload: Record<string, unknown>) => {
    if (!shift) return;
    const token = shift.token;
    setShift(null);
    try {
      const res = await fetch('/api/jobs/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...payload }),
      });
      const data = (await res.json().catch(() => null)) as (ResultState & { success?: boolean; error?: string }) | null;
      if (!data?.success) {
        setError(data?.error || 'Shift could not be completed');
      } else {
        setResult(data);
        if (typeof data.balance === 'number') setBalance(data.balance);
      }
    } catch {
      setError('Network error completing shift');
    } finally {
      void load();
    }
  }, [shift, load]);

  const closeResult = () => {
    setResult(null);
    void load();
  };

  if (state === 'checking') {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Jobs" />
        <p style={{ textAlign: 'center', color: '#888', padding: 60 }}>LOADING…</p>
      </main>
    );
  }
  if (state === 'unauthenticated') {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
        <NavBar pageLabel="Jobs" />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 48 }}>💼</p>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>Muragoods Jobs</h1>
          <p style={{ color: '#aaa' }}>Sign in to clock in — payouts land in your account.</p>
          <Link href="/login" style={{ display: 'inline-block', marginTop: 16, background: '#ffd60a', color: '#111', fontWeight: 800, padding: '12px 28px', borderRadius: 12, textDecoration: 'none' }}>
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 16, padding: 18,
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a18' }}>
      <NavBar pageLabel="Jobs" />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px 90px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
          <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: 0 }}>💼 Jobs</h1>
          {balance !== null && <span style={{ color: '#ffd60a', fontWeight: 800 }}>⏣ {balance.toLocaleString('en-US')}</span>}
        </div>
        <p style={{ color: '#aaa', fontSize: 13.5, margin: '0 0 18px' }}>
          Choose a job and complete its shift mini-game to earn ⏣. No mini-game, no payout.
        </p>

        {error && (
          <div role="alert" style={{ background: 'rgba(230,57,70,0.12)', border: '1px solid rgba(230,57,70,0.4)', borderRadius: 12, padding: '12px 16px', color: '#ff8a8a', fontSize: 13.5, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {cooldown > 0 && (
          <div style={{ ...card, marginBottom: 18, textAlign: 'center', borderColor: 'rgba(255,214,10,0.35)' }}>
            <p style={{ color: '#ffd60a', fontWeight: 800, margin: 0 }}>You can work again in:</p>
            <p style={{ color: '#fff', fontSize: 30, fontWeight: 800, margin: '6px 0 0', fontVariantNumeric: 'tabular-nums' }}>
              {fmtDuration(cooldown)}
            </p>
          </div>
        )}

        {loading ? (
          <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>Loading jobs…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 26 }}>
            {jobs.map((j) => (
              <div key={j.id} style={card}>
                <p style={{ fontSize: 40, margin: '0 0 8px' }}>{j.icon}</p>
                <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, margin: '0 0 4px' }}>{j.name}</p>
                <p style={{ color: '#aaa', fontSize: 12.5, margin: '0 0 10px', minHeight: 32 }}>{j.description}</p>
                <p style={{ fontSize: 12.5, margin: '0 0 4px' }}>
                  <span style={{ color: '#888' }}>Difficulty: </span>
                  <strong style={{ color: diffColor[j.difficulty] || '#fff' }}>{j.difficulty}</strong>
                </p>
                <p style={{ fontSize: 12.5, margin: '0 0 14px' }}>
                  <span style={{ color: '#888' }}>Pay: </span>
                  <strong style={{ color: '#ffd60a' }}>{fmtCoins(j.payMin)}–{fmtCoins(j.payMax).replace('⏣ ', '')}</strong>
                </p>
                <button
                  type="button"
                  disabled={cooldown > 0 || starting !== null}
                  onClick={() => void startShift(j.id)}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                    background: cooldown > 0 ? 'rgba(255,255,255,0.08)' : '#ffd60a',
                    color: '#111', fontWeight: 800, fontSize: 14,
                    cursor: cooldown > 0 ? 'not-allowed' : 'pointer', opacity: starting === j.id ? 0.6 : 1,
                  }}
                >
                  {starting === j.id ? 'Clocking in…' : 'Start Shift'}
                </button>
              </div>
            ))}
          </div>
        )}

        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '0 0 12px' }}>📋 Work History</h2>
        {history.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No shifts yet — clock in above.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {history.map((h, i) => (
              <div key={`${h.at}-${i}`} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px' }}>
                <span style={{ fontSize: 28 }}>{h.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>
                    {h.jobName} {h.won ? '✓ Successful' : '✕ Failed'}
                  </p>
                  <p style={{ color: '#888', fontSize: 12, margin: '2px 0 0' }}>
                    {new Date(h.at).toLocaleString()} · {h.game} mini-game{h.won ? '' : ` · ${h.reason}`}
                  </p>
                </div>
                <strong style={{ color: h.won ? '#06d6a0' : '#ffd60a', fontSize: 15 }}>
                  + {fmtCoins(h.payout || 0)}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {shift && (
        <ShiftModal
          shift={shift}
          onDone={(payload) => void finishShift(payload)}
          onAbandon={() => setShift(null)}
        />
      )}

      {result && (
        <div role="dialog" aria-modal="true" aria-label={result.won ? 'Shift success' : 'Shift failed'} style={overlay}>
          <div style={{ ...card, maxWidth: 420, width: '100%', textAlign: 'center', padding: 28 }}>
            <p style={{ fontSize: 44, margin: '0 0 8px' }}>{result.won ? '🎉' : '❌'}</p>
            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>
              {result.won ? 'Great work!' : 'Terrible work!'}
            </h2>
            <p style={{ color: '#ccc', fontSize: 14, margin: '0 0 4px' }}>
              {result.won
                ? 'You completed your shift successfully.'
                : `You lost the mini-game because ${result.reason}.`}
            </p>
            <p style={{ color: '#aaa', fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>You were given:</p>
            <p style={{ color: '#ffd60a', fontSize: 30, fontWeight: 800, margin: 0 }}>
              {result.payoutLabel}
            </p>
            {!result.won && <p style={{ color: '#888', fontSize: 12.5, margin: '4px 0 0' }}>for a sub-par shift</p>}
            {result.balance !== null && (
              <p style={{ color: '#888', fontSize: 12.5, margin: '10px 0 0' }}>
                Balance: ⏣ {result.balance.toLocaleString('en-US')}
              </p>
            )}
            <button
              type="button"
              onClick={closeResult}
              style={{ marginTop: 18, padding: '12px 28px', borderRadius: 12, border: 'none', background: '#ffd60a', color: '#111', fontWeight: 800, cursor: 'pointer' }}
            >
              Back to Jobs
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  backdropFilter: 'blur(6px)',
};

// ── Shift modal + mini-games ─────────────────────────────────────────────
function useCountdown(deadline: number, onExpire: () => void) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.ceil((deadline - Date.now()) / 1000);
      setLeft(Math.max(0, s));
      if (s <= 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    }, 250);
    return () => clearInterval(t);
  }, [deadline, onExpire]);
  return left;
}

const modalCard: React.CSSProperties = {
  background: '#14141f', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 18, padding: 24, maxWidth: 480, width: '100%',
  maxHeight: '88vh', overflowY: 'auto',
};

function ShiftModal({ shift, onDone, onAbandon }: {
  shift: ActiveShift;
  onDone: (payload: Record<string, unknown>) => void;
  onAbandon: () => void;
}) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const submitted = useRef(false);
  const submit = useCallback((payload: Record<string, unknown>) => {
    if (submitted.current) return;
    submitted.current = true;
    doneRef.current(payload);
  }, []);
  const expire = useCallback(() => submit({ expired: true }), [submit]);
  const left = useCountdown(shift.deadline, expire);
  const startedAt = shift.startedAt;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${shift.job.name} shift`} style={overlay}>
      <div style={modalCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: 0 }}>
            {shift.job.icon} {shift.job.name}
          </h2>
          <span style={{
            color: left <= 5 ? '#e63946' : '#ffd60a', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
          }}>
            ⏱ {left}s
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: 18 }}>
          <div style={{
            height: '100%', borderRadius: 4, transition: 'width 0.25s linear',
            width: `${Math.max(0, Math.min(100, (left / Math.max(1, shift.job.timeSec)) * 100))}%`,
            background: left <= 5 ? '#e63946' : 'linear-gradient(90deg,#7b2ff7,#ffd60a)',
          }} />
        </div>

        {shift.challenge.game === 'order' && (
          <OrderGame sequence={shift.challenge.sequence || []} startedAt={startedAt} onDone={submit} />
        )}
        {shift.challenge.game === 'memory' && (
          <MemoryGame icons={shift.challenge.icons || []} startedAt={startedAt} onDone={submit} />
        )}
        {shift.challenge.game === 'choice' && (
          <ChoiceGame
            options={shift.challenge.options || []} startedAt={startedAt} onDone={submit}
            timeSec={shift.job.timeSec}
          />
        )}
        {shift.challenge.game === 'timing' && (
          <TimingGame
            zone={(shift.challenge.zone || [0, 100]) as [number, number]} periodMs={shift.challenge.periodMs || 2000}
            startedAt={startedAt} onDone={submit}
          />
        )}
        {shift.challenge.game === 'reaction' && (
          <ReactionGame
            delayMs={shift.challenge.delayMs || 2000} startedAt={startedAt} onDone={submit}
          />
        )}

        <button
          type="button" onClick={onAbandon}
          style={{ marginTop: 16, background: 'none', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', width: '100%' }}
        >
          Abandon shift (no payout)
        </button>
      </div>
    </div>
  );
}

const gameBtn: React.CSSProperties = {
  padding: '16px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 22, fontWeight: 800,
  cursor: 'pointer', flex: '1 1 60px',
};

function OrderGame({ sequence, startedAt, onDone }: {
  sequence: number[]; startedAt: number; onDone: (p: Record<string, unknown>) => void;
}) {
  const [pressed, setPressed] = useState<number[]>([]);
  const expected = [...sequence].sort((a, b) => a - b);
  const press = (n: number) => {
    if (pressed.includes(n)) return;
    const next = [...pressed, n];
    setPressed(next);
    if (next.length === expected.length) {
      onDone({ clicks: next, elapsedMs: Date.now() - startedAt });
    } else if (n !== expected[next.length - 1]) {
      // Wrong button: fail immediately with the actual (wrong) sequence.
      onDone({ clicks: next, elapsedMs: Date.now() - startedAt });
    }
  };
  return (
    <div>
      <p style={hint}>Tap the tickets in order: 1 → {expected.length}</p>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>Progress: {pressed.length}/{expected.length}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {sequence.map((n) => {
          const done = pressed.includes(n);
          return (
            <button
              key={n} type="button" disabled={done} onClick={() => press(n)}
              style={{ ...gameBtn, opacity: done ? 0.35 : 1, borderColor: done ? 'rgba(6,214,160,0.5)' : undefined }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MemoryGame({ icons, startedAt, onDone }: {
  icons: string[]; startedAt: number; onDone: (p: Record<string, unknown>) => void;
}) {
  const [phase, setPhase] = useState<'show' | 'input'>('show');
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setPhase('input'), 2500);
    return () => clearTimeout(t);
  }, []);
  const pick = (idx: number) => {
    const next = [...picked, idx];
    setPicked(next);
    if (next.length === icons.length) {
      onDone({ clicks: next, elapsedMs: Date.now() - startedAt });
    }
  };
  if (phase === 'show') {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={hint}>Memorize this drink order…</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', fontSize: 40, margin: '12px 0' }}>
          {icons.map((ic, i) => <span key={i}>{ic}</span>)}
        </div>
      </div>
    );
  }
  return (
    <div>
      <p style={hint}>Remake the order — tap the drinks in sequence ({picked.length}/{icons.length})</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', fontSize: 30, minHeight: 48, marginBottom: 12 }}>
        {picked.map((idx, i) => <span key={i}>{MEMO_PAD[idx]}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {MEMO_PAD.map((ic, idx) => (
          <button key={idx} type="button" onClick={() => pick(idx)} style={{ ...gameBtn, fontSize: 26 }}>
            {ic}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceGame({ options, startedAt, onDone, timeSec }: {
  options: string[]; startedAt: number; onDone: (p: Record<string, unknown>) => void; timeSec: number;
}) {
  return (
    <div>
      <p style={hint}>Ship the correct build — QA ends when the timer does.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {options.map((o, i) => (
          <button
            key={i} type="button"
            onClick={() => onDone({ pick: i, elapsedMs: Date.now() - startedAt })}
            style={{
              padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15,
              fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace',
            }}
          >
            {o}
          </button>
        ))}
      </div>
      <p style={{ color: '#666', fontSize: 11.5, margin: '10px 0 0' }}>Wrong build = failed shift. {timeSec}s on the clock.</p>
    </div>
  );
}

function TimingGame({ zone, periodMs, startedAt, onDone }: {
  zone: [number, number]; periodMs: number; startedAt: number; onDone: (p: Record<string, unknown>) => void;
}) {
  const [pos, setPos] = useState(0);
  const raf = useRef(0);
  const t0 = useRef(Date.now());
  useEffect(() => {
    const tick = () => {
      setPos((Date.now() - t0.current) % periodMs);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [periodMs]);
  const lo = (zone[0] / periodMs) * 100;
  const hi = (zone[1] / periodMs) * 100;
  const cur = (pos / periodMs) * 100;
  return (
    <div>
      <p style={hint}>Stop the beacon inside the green zone.</p>
      <div style={{ position: 'relative', height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', margin: '8px 0 16px' }}>
        <div style={{ position: 'absolute', left: `${lo}%`, width: `${Math.max(2, hi - lo)}%`, top: 0, bottom: 0, background: 'rgba(6,214,160,0.45)' }} />
        <div style={{ position: 'absolute', left: `calc(${cur}% - 3px)`, top: 0, bottom: 0, width: 6, background: '#ffd60a', borderRadius: 3 }} />
      </div>
      <button
        type="button"
        onClick={() => onDone({ elapsedMs: Date.now() - t0.current })}
        style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#e63946', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
      >
        ⏹ STOP
      </button>
    </div>
  );
}

function ReactionGame({ delayMs, startedAt, onDone }: {
  delayMs: number; startedAt: number; onDone: (p: Record<string, unknown>) => void;
}) {
  const [green, setGreen] = useState(false);
  const goAt = useRef(startedAt + delayMs);
  useEffect(() => {
    const wait = Math.max(0, goAt.current - Date.now());
    const t = setTimeout(() => setGreen(true), wait);
    return () => clearTimeout(t);
  }, []);
  const tap = () => {
    if (!green) {
      onDone({ reactedEarly: true, elapsedMs: Date.now() - startedAt });
    } else {
      onDone({ elapsedMs: Date.now() - goAt.current });
    }
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={hint}>{green ? 'NOW — tap it!' : 'Wait for green…'}</p>
      <button
        type="button" onClick={tap} aria-label="Reaction button"
        style={{
          width: 180, height: 180, borderRadius: '50%', cursor: 'pointer',
          border: '4px solid rgba(255,255,255,0.2)',
          background: green ? '#06d6a0' : '#e63946',
          color: '#fff', fontSize: 20, fontWeight: 800,
          boxShadow: green ? '0 0 60px rgba(6,214,160,0.6)' : 'none',
          transition: 'background 0.1s',
        }}
      >
        {green ? 'TAP!' : 'WAIT'}
      </button>
    </div>
  );
}

const hint: React.CSSProperties = { color: '#ccc', fontSize: 13.5, margin: '0 0 12px' };
