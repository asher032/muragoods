import crypto from 'crypto';
import table from '@/app/lib/jobs-table.json';

// ── Jobs engine (data-driven from jobs-table.json) ───────────────────────
// jobs-table.json is the source of truth: exact shifts/day, cooldowns,
// unlocks, salaries and work items. Payouts credit the existing
// User.coinBalance — no second currency. Success pays the EXACT salary;
// failure pays floor(salary * failRate), always lower.

export type JobGame = 'order' | 'reaction' | 'memory' | 'choice' | 'timing';

export interface JobFlavor {
  prompt: string;
  items?: string[];
  pool?: string[];
  questions?: Array<{ q: string; options: string[]; correct: number }>;
}

export interface JobDef {
  id: string;
  name: string;
  icon: string;
  shiftsPerDay: number;
  cooldownMin: number;
  unlock: number;
  salary: number;
  workItem: string;
  game: JobGame;
  flavor: JobFlavor;
}

interface RawJob {
  id: string; name: string; icon: string;
  shiftsPerDay: number; cooldownMin: number; unlock: number; salary: number;
  workItem: string; game: JobGame; flavor: JobFlavor;
}

const TABLE_JOBS = (table as { jobs: RawJob[] }).jobs;

export const JOBS: JobDef[] = TABLE_JOBS.map((j) => ({
  id: j.id,
  name: j.name,
  icon: j.icon,
  shiftsPerDay: Math.max(1, Math.floor(j.shiftsPerDay)),
  cooldownMin: Math.max(1, Math.floor(j.cooldownMin)),
  unlock: Math.max(0, Math.floor(j.unlock)),
  salary: Math.max(1, Math.floor(j.salary)),
  workItem: String(j.workItem),
  game: j.game,
  flavor: j.flavor,
}));

export const JOB_MAP: Record<string, JobDef> = Object.fromEntries(JOBS.map((j) => [j.id, j]));

// Difficulty tier derived from unlock requirement (higher jobs, tighter).
function tierOf(job: Pick<JobDef, 'unlock'>): number {
  if (job.unlock >= 300) return 2;
  if (job.unlock >= 100) return 1;
  return 0;
}

/** Display difficulty label, derived from the unlock requirement. */
export function difficultyFor(job: Pick<JobDef, 'unlock'>): 'Easy' | 'Medium' | 'Hard' {
  const t = tierOf(job);
  return t >= 2 ? 'Hard' : t >= 1 ? 'Medium' : 'Easy';
}

export interface JobParams {
  steps: number;
  timeSec: number;
  windowMs: number;
  periodMs: number;
  options: number;
}

/** Difficulty-tuned parameters per job. Deterministic from table values. */
export function paramsFor(job: JobDef): JobParams {
  const t = tierOf(job);
  switch (job.game) {
    case 'order': return { steps: Math.min(6, 4 + t), timeSec: 30, windowMs: 0, periodMs: 2000, options: 0 };
    case 'memory': return { steps: Math.min(5, 3 + t), timeSec: 30, windowMs: 0, periodMs: 2000, options: 0 };
    case 'choice': return { steps: 0, timeSec: t >= 2 ? 10 : 12, windowMs: 0, periodMs: 2000, options: 4 };
    case 'timing':
      return {
        steps: 1, timeSec: 20, windowMs: Math.max(80, 160 - t * 20),
        periodMs: 1800 + (tierHash(job.id) % 5) * 100, options: 0,
      };
    case 'reaction':
      return { steps: 1, timeSec: 20, windowMs: Math.max(600, 900 - t * 100), periodMs: 2000, options: 0 };
  }
}

function tierHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export const DEFAULT_FAIL_RATE = 0.3;

export function failPayout(salary: number, failRate: number): number {
  const rate = Number.isFinite(failRate) ? Math.max(0.05, Math.min(0.9, failRate)) : DEFAULT_FAIL_RATE;
  return Math.max(1, Math.floor(salary * rate));
}

export interface JobChallenge {
  game: JobGame;
  // order: display labels (shuffled) + answer indexes into labels.
  labels?: string[];
  answer?: number[];
  // memory: icon sequence to reproduce (indexes into pool).
  icons?: string[];
  pool?: string[];
  // choice: question + shuffled options + correct index.
  question?: string;
  options?: string[];
  correct?: number;
  // timing: zone [lo,hi] ms within periodMs.
  zone?: [number, number];
  periodMs?: number;
  // reaction: server go timestamp.
  delayMs?: number;
  windowMs?: number;
  goAt?: number;
  deadlineAt?: number;
}

const GENERIC_POOL = ['⭐', '🔶', '🔷', '🟢', '🟣', '🔺', '🔻', '⭕'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Server-side challenge generation. Expected answers stay server-side. */
export function generateChallenge(job: JobDef, nowMs: number): JobChallenge {
  const p = paramsFor(job);
  const deadlineAt = nowMs + Math.max(5, p.timeSec) * 1000;
  switch (job.game) {
    case 'order': {
      const items = (job.flavor.items || []).slice(0, Math.max(2, p.steps));
      const order = items.map((_, i) => i);
      const display = shuffle(order);
      return { game: 'order', labels: display.map((i) => items[i]), answer: display.map((_, pos) => display.indexOf(pos)), deadlineAt };
    }
    case 'memory': {
      const pool = job.flavor.pool && job.flavor.pool.length >= 4 ? job.flavor.pool : GENERIC_POOL;
      const seq = Array.from({ length: p.steps }, () => crypto.randomInt(pool.length));
      return { game: 'memory', icons: seq.map((i) => pool[i]), pool, deadlineAt };
    }
    case 'choice': {
      const bank = job.flavor.questions || [];
      const q = bank[crypto.randomInt(bank.length)];
      const order = shuffle(q.options.map((_, i) => i));
      return {
        game: 'choice', question: q.q,
        options: order.map((i) => q.options[i]),
        correct: order.indexOf(q.correct), deadlineAt,
      };
    }
    case 'timing': {
      const width = Math.max(60, p.windowMs);
      const lo = crypto.randomInt(0, p.periodMs - width);
      return { game: 'timing', zone: [lo, lo + width], periodMs: p.periodMs, deadlineAt };
    }
    case 'reaction': {
      const delayMs = 1500 + crypto.randomInt(2500);
      return { game: 'reaction', delayMs, windowMs: p.windowMs, goAt: nowMs + delayMs, deadlineAt };
    }
  }
}

export interface JobAttempt {
  clicks?: number[]; // order: pressed positions in display order; memory: pool indexes
  pick?: number; // choice: option index
  elapsedMs?: number; // timing/reaction advisory ms
  reactedEarly?: boolean;
}

export interface JobVerdict {
  won: boolean;
  reason: string;
}

/** Server-side validation. Pure apart from the clock — never trusts "won". */
export function validateAttempt(job: JobDef, ch: JobChallenge, a: JobAttempt, nowMs: number): JobVerdict {
  if (nowMs > (ch.deadlineAt || 0)) {
    return { won: false, reason: 'you ran out of time' };
  }
  const p = paramsFor(job);
  const elapsed = Math.max(0, Math.floor(Number(a.elapsedMs ?? 0)));
  switch (job.game) {
    case 'order': {
      const answer = ch.answer || [];
      const clicks = Array.isArray(a.clicks) ? a.clicks.map(Number) : [];
      if (clicks.length !== answer.length) {
        return { won: false, reason: 'you did not finish the order sequence' };
      }
      if (elapsed < answer.length * 350) {
        return { won: false, reason: 'the shift finished impossibly fast' };
      }
      for (let i = 0; i < answer.length; i++) {
        if (!Number.isInteger(clicks[i]) || clicks[i] !== answer[i]) {
          return { won: false, reason: 'you clicked the buttons in the wrong order' };
        }
      }
      return { won: true, reason: 'order complete' };
    }
    case 'memory': {
      const want = ch.icons || [];
      const pool = ch.pool || GENERIC_POOL;
      const clicks = Array.isArray(a.clicks) ? a.clicks.map(Number) : [];
      if (clicks.length !== want.length) {
        return { won: false, reason: 'you did not finish the sequence' };
      }
      if (elapsed < want.length * 350) {
        return { won: false, reason: 'the shift finished impossibly fast' };
      }
      for (let i = 0; i < want.length; i++) {
        if (!Number.isInteger(clicks[i]) || pool[clicks[i]] !== want[i]) {
          return { won: false, reason: 'you entered the sequence incorrectly' };
        }
      }
      return { won: true, reason: 'sequence reproduced perfectly' };
    }
    case 'choice': {
      const options = ch.options || [];
      const pick = Math.floor(Number(a.pick));
      if (!Number.isInteger(pick) || pick < 0 || pick >= options.length) {
        return { won: false, reason: 'you did not pick a valid answer' };
      }
      if (pick !== ch.correct) {
        return { won: false, reason: 'you picked the wrong answer' };
      }
      return { won: true, reason: 'correct call' };
    }
    case 'timing': {
      const [lo, hi] = ch.zone || [0, 0];
      const period = ch.periodMs || p.periodMs;
      if (elapsed < 200) {
        return { won: false, reason: 'you stopped the meter instantly' };
      }
      const pos = elapsed % period;
      if (pos >= lo && pos <= hi) return { won: true, reason: 'meter stopped in the zone' };
      return { won: false, reason: 'you stopped outside the target zone' };
    }
    case 'reaction': {
      if (a.reactedEarly) {
        return { won: false, reason: 'you jumped the gun before green' };
      }
      const reaction = nowMs - (ch.goAt || 0);
      void elapsed;
      if (reaction < 80) {
        return { won: false, reason: 'you reacted impossibly fast' };
      }
      if (reaction > (ch.windowMs || p.windowMs)) {
        return { won: false, reason: 'you reacted too slowly' };
      }
      return { won: true, reason: `reacted in ${reaction}ms` };
    }
    default:
      return { won: false, reason: 'you did not finish the shift' };
  }
}

// ── Progression (pure helpers; storage lives in callers) ─────────────────
export const PROMO_EVERY = 10; // successes per promotion level
export const PROMO_STEP = 0.02; // +2% salary per level
export const PROMO_CAP = 10; // max level → +20%
export const FIRED_STREAK = 5; // consecutive fails → fired (promotion reset)

export function promoLevelFor(successes: number): number {
  return Math.max(0, Math.min(PROMO_CAP, Math.floor(Math.max(0, successes) / PROMO_EVERY)));
}

export function promoBonusFor(successes: number): number {
  return promoLevelFor(successes) * PROMO_STEP;
}

/** Success payout: exact salary + promotion bonus (that job only). */
export function successPayout(job: JobDef, successes: number): number {
  return Math.floor(job.salary * (1 + promoBonusFor(successes)));
}

export function fmtCoins(n: number): string {
  return `⏣ ${Math.max(0, Math.floor(n)).toLocaleString('en-US')}`;
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

export function fmtDateTime(at: string | Date): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}
