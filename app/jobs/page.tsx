'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useAuth } from '@/app/contexts/AuthContext';
import { fmtCoins, fmtDuration, fmtDateTime, type JobDef, type JobGame } from '@/app/lib/jobs';

interface JobState extends JobDef {
  unlocked: boolean;
  disabled?: boolean;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  unlockProgress: number;
  today: number;
  dailyDone: boolean;
  cooldownSec: number;
  cooldownRemaining: number;
  cooldownLabel: string;
  successes: number;
  promoLevel: number;
  promoBonusPct: number;
  firedCount: number;
}

interface Challenge {
  game: JobGame;
  labels?: string[];
  ticket?: string[];
  icons?: string[];
  pool?: string[];
  question?: string;
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
  startedAt: number;
  deadline: number;
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
  fired?: boolean;
  promoLevel?: number;
  job: { id: string; name: string; icon: string };
}

export default function JobsPage() {
  const { state } = useAuth();
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [resigning, setResigning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [jl, hl] = await Promise.all([
        fetch('/api/jobs', { cache: 'no-store' }),
        fetch('/api/jobs/history?limit=20', { cache: 'no-store' }),
      ]);
      const jd = (await jl.json().catch(() => null)) as {
        success?: boolean; jobs?: JobState[]; totalCompleted?: number; error?: string;
      } | null;
      if (!jd?.success) {
        setError(jd?.error || 'Could not load jobs');
      } else {
        setJobs(jd.jobs || []);
        setTotalCompleted(jd.totalCompleted || 0);
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

  // Per-job cooldown tickers.
  useEffect(() => {
    if (!jobs.some((j) => j.cooldownRemaining > 0)) return;
    const t = setInterval(() => {
      setJobs((prev) => prev.map((j) => j.cooldownRemaining > 0
        ? { ...j, cooldownRemaining: j.cooldownRemaining - 1, cooldownLabel: fmtDuration(j.cooldownRemaining - 1) }
        : j));
    }, 1000);
    return () => clearInterval(t);
  }, [jobs.some((j) => j.cooldownRemaining > 0)]); // eslint-disable-line react-hooks/exhaustive-deps

  const startShift = async (jobId: string) => {
    if (starting) return;
    setStarting(jobId);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/jobs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean; token?: string; job?: JobDef; challenge?: Challenge;
        serverNow?: number; error?: string; code?: string; required?: number; progress?: number;
        cooldownRemaining?: number;
      } | null;
      if (!data?.success || !data.token || !data.job || !data.challenge) {
        if (data?.code === 'LOCKED') {
          setError(`🔒 Locked — requires ${data.required} completed shifts (${data.progress} so far)`);
        } else {
          setError(data?.error || 'Could not start shift');
        }
        void load();
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

  const resign = async (jobId: string, jobName: string) => {
    if (resigning) return;
    if (!confirm(`Resign from ${jobName}? Promotion progress resets and must be re-earned.`)) return;
    setResigning(jobId);
    try {
      const res = await fetch('/api/jobs/resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!data?.success) setError(data?.error || 'Could not resign');
    } catch {
      setError('Network error');
    } finally {
      setResigning(null);
      void load();
    }
  };

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
          <div style={{ display: 'flex', gap: 14, fontSize: 13, fontWeight: 700, color: '#aaa' }}>
            <span>📊 Shifts: <strong style={{ color: '#fff' }}>{totalCompleted}</strong></span>
            {balance !== null && <span style={{ color: '#ffd60a' }}>⏣ {balance.toLocaleString('en-US')}</span>}
          </div>
        </div>
        <p style={{ color: '#aaa', fontSize: 13.5, margin: '0 0 18px' }}>
          Choose an unlocked job and complete its shift mini-game to earn ⏣. No mini-game, no payout.
          Promotions (+2% salary per 10 wins, up to +20%) apply only to the job they were earned in.
        </p>

        {error && (
          <div role="alert" style={{ background: 'rgba(230,57,70,0.12)', border: '1px solid rgba(230,57,70,0.4)', borderRadius: 12, padding: '12px 16px', color: '#ff8a8a', fontSize: 13.5, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>Loading jobs…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14, marginBottom: 26 }}>
            {jobs.map((j) => {
              const blocked = !j.unlocked || j.dailyDone || j.cooldownRemaining > 0 || starting !== null;
              return (
                <div key={j.id} style={{ ...card, opacity: j.unlocked ? 1 : 0.75 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 38 }}>{j.icon}</span>
                    <div>
                      <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, margin: 0 }}>{j.name}</p>
                      <p style={{ fontSize: 12, margin: '2px 0 0', color: '#888', fontWeight: 700 }}>
                        {j.game} shift · {j.workItem}
                      </p>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#ccc', marginTop: 10, display: 'grid', gap: 3 }}>
                    <div>Salary: <strong style={{ color: '#ffd60a' }}>{fmtCoins(j.salary)}</strong> / shift</div>
                    <div>Work Item: <strong style={{ color: '#fff' }}>{j.workItem}</strong></div>
                    <div>Shifts: <strong style={{ color: '#fff' }}>{Math.min(j.today, j.shiftsPerDay)} / {j.shiftsPerDay}</strong> / day</div>
                    <div>Cooldown: <strong style={{ color: '#fff' }}>{j.cooldownMin} minutes</strong></div>
                    <div>Unlock: <strong style={{ color: '#fff' }}>{j.unlock === 0 ? 'Open' : `${j.unlock} shifts`}</strong></div>
                    {j.promoLevel > 0 && (
                      <div>Promotion: <strong style={{ color: '#06d6a0' }}>Lv{j.promoLevel} (+{j.promoBonusPct}%)</strong> · {j.successes} wins</div>
                    )}
                    {j.firedCount > 0 && (
                      <div style={{ color: '#888' }}>Fired {j.firedCount}× (promotion reset)</div>
                    )}
                  </div>

                  {!j.unlocked ? (
                    <div style={{ marginTop: 12, padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 14 }}>🔒 Locked</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#aaa' }}>
                        Requires {j.unlock} completed shifts<br />
                        Progress: {j.unlockProgress} / {j.unlock}
                      </p>
                    </div>
                  ) : j.disabled ? (
                    <div style={{ marginTop: 12, padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 13.5, color: '#888', fontWeight: 700 }}>🚧 Temporarily closed</p>
                    </div>
                  ) : j.dailyDone ? (
                    <div style={{ marginTop: 12, padding: '12px', borderRadius: 12, background: 'rgba(6,214,160,0.08)', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 13.5, color: '#06d6a0', fontWeight: 700 }}>✓ Daily shifts complete</p>
                    </div>
                  ) : j.cooldownRemaining > 0 ? (
                    <div style={{ marginTop: 12, padding: '12px', borderRadius: 12, background: 'rgba(255,214,10,0.08)', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: '#ffd60a' }}>⏱️ Next shift available in</p>
                      <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                        {j.cooldownLabel}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => void startShift(j.id)}
                      style={{
                        width: '100%', marginTop: 12, padding: '12px', borderRadius: 12, border: 'none',
                        background: '#ffd60a', color: '#111', fontWeight: 800, fontSize: 14,
                        cursor: 'pointer', opacity: starting === j.id ? 0.6 : 1,
                      }}
                    >
                      {starting === j.id ? 'Clocking in…' : 'Start Shift'}
                    </button>
                  )}
                  {j.unlocked && j.successes > 0 && (
                    <button
                      type="button"
                      disabled={resigning !== null}
                      onClick={() => void resign(j.id, j.name)}
                      style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: '#666', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {resigning === j.id ? 'Resigning…' : `Resign (reset Lv${j.promoLevel} promotion)`}
                    </button>
                  )}
                </div>
              );
            })}
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
                    {h.won ? '✓' : '✕'} {h.jobName} — {h.won ? 'Successful shift' : 'Sub-par shift'}
                  </p>
                  <p style={{ color: '#888', fontSize: 12, margin: '2px 0 0' }}>
                    {h.game} mini-game · {fmtDateTime(h.at)}{h.won ? '' : ` · ${h.reason}`}
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
            {result.fired && (
              <p style={{ color: '#e63946', fontSize: 13, fontWeight: 700, margin: '8px 0 0' }}>
                Fired after 5 straight failures — promotion progress reset.
              </p>
            )}
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
  const timeSec = Math.max(1, Math.round((shift.deadline - shift.startedAt) / 1000));

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
            width: `${Math.max(0, Math.min(100, (left / timeSec) * 100))}%`,
            background: left <= 5 ? '#e63946' : 'linear-gradient(90deg,#7b2ff7,#ffd60a)',
          }} />
        </div>

        {shift.challenge.game === 'order' && (
          <OrderGame ticket={shift.challenge.ticket || []} labels={shift.challenge.labels || []} startedAt={startedAt} onDone={submit} />
        )}
        {shift.challenge.game === 'memory' && (
          <MemoryGame icons={shift.challenge.icons || []} pool={shift.challenge.pool || []} startedAt={startedAt} onDone={submit} />
        )}
        {shift.challenge.game === 'choice' && (
          <ChoiceGame
            question={shift.challenge.question || ''} options={shift.challenge.options || []}
            startedAt={startedAt} onDone={submit}
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
  padding: '14px 8px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', flex: '1 1 90px',
};

function OrderGame({ ticket, labels, startedAt, onDone }: {
  ticket: string[]; labels: string[]; startedAt: number; onDone: (p: Record<string, unknown>) => void;
}) {
  const [pressed, setPressed] = useState<number[]>([]);
  // Canonical order is 0..n-1 over the ticket; buttons show shuffled labels.
  // Tapping must follow the ticket sequence.
  const press = (pos: number) => {
    if (pressed.includes(pos)) return;
    const next = [...pressed, pos];
    setPressed(next);
    if (next.length === ticket.length) {
      onDone({ clicks: next, elapsedMs: Date.now() - startedAt });
    } else {
      // Immediate fail the moment the sequence breaks: ticket[pos] must equal
      // labels[next[pos]] at every step.
      const step = next.length - 1;
      const labelIdx = labels.indexOf(ticket[step]);
      if (next[step] !== labelIdx) {
        onDone({ clicks: next, elapsedMs: Date.now() - startedAt });
      }
    }
  };
  return (
    <div>
      <p style={hint}>Follow the ticket in order:</p>
      <p style={{ color: '#ffd60a', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>
        🎟 {ticket.join(' → ')}
      </p>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>Progress: {pressed.length}/{ticket.length}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {labels.map((label, pos) => {
          const done = pressed.includes(pos);
          return (
            <button
              key={pos} type="button" disabled={done} onClick={() => press(pos)}
              style={{ ...gameBtn, opacity: done ? 0.35 : 1, borderColor: done ? 'rgba(6,214,160,0.5)' : undefined }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MemoryGame({ icons, pool, startedAt, onDone }: {
  icons: string[]; pool: string[]; startedAt: number; onDone: (p: Record<string, unknown>) => void;
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
  const pad = pool.length >= 4 ? pool : ['⭐', '🔶', '🔷', '🟢', '🟣', '🔺', '🔻', '⭕'];
  if (phase === 'show') {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={hint}>Memorize this lineup…</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', fontSize: 40, margin: '12px 0', flexWrap: 'wrap' }}>
          {icons.map((ic, i) => <span key={i}>{ic}</span>)}
        </div>
      </div>
    );
  }
  return (
    <div>
      <p style={hint}>Replay the lineup in order ({picked.length}/{icons.length})</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', fontSize: 30, minHeight: 48, marginBottom: 12, flexWrap: 'wrap' }}>
        {picked.map((idx, i) => <span key={i}>{pad[idx]}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {pad.map((ic, idx) => (
          <button key={idx} type="button" onClick={() => pick(idx)} style={{ ...gameBtn, fontSize: 26 }}>
            {ic}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceGame({ question, options, startedAt, onDone }: {
  question: string; options: string[]; startedAt: number; onDone: (p: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <p style={hint}>{question}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {options.map((o, i) => (
          <button
            key={i} type="button"
            onClick={() => onDone({ pick: i, elapsedMs: Date.now() - startedAt })}
            style={{
              padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', textAlign: 'left',
            }}
          >
            {o}
          </button>
        ))}
      </div>
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
  void startedAt;
  const lo = (zone[0] / periodMs) * 100;
  const hi = (zone[1] / periodMs) * 100;
  const cur = (pos / periodMs) * 100;
  return (
    <div>
      <p style={hint}>Stop the meter inside the green zone.</p>
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
