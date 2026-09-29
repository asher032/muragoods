import crypto from 'crypto';

// ── Jobs catalog (ONE definition for the whole site) ─────────────────────
// Payouts credit the existing User.coinBalance — no second currency. Amounts
// follow the Jobs spec; only the shift cooldown is admin-configurable.

export type JobGame = 'order' | 'reaction' | 'memory' | 'choice' | 'timing';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface JobDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  difficulty: Difficulty;
  game: JobGame;
  payMin: number;
  payMax: number;
  failMin: number;
  failMax: number;
  // Difficulty-tuned minigame parameters.
  steps: number; // buttons / sequence length / options / zones
  timeSec: number; // overall shift timer
  windowMs: number; // reaction window / timing tolerance base / choice time
}

export const JOBS: JobDef[] = [
  {
    id: 'fastfood', name: 'Fast Food Worker', icon: '🍔',
    description: 'Serve customers in order and complete your shift.',
    difficulty: 'Easy', game: 'order',
    payMin: 150000, payMax: 220000, failMin: 40000, failMax: 80000,
    steps: 4, timeSec: 30, windowMs: 0,
  },
  {
    id: 'warehouse', name: 'Warehouse Worker', icon: '📦',
    description: 'Stop the forklift beacon inside the target zone.',
    difficulty: 'Medium', game: 'timing',
    payMin: 180000, payMax: 260000, failMin: 50000, failMax: 90000,
    steps: 1, timeSec: 20, windowMs: 140,
  },
  {
    id: 'cafe', name: 'Café Worker', icon: '☕',
    description: 'Memorize the drink order, then remake it exactly.',
    difficulty: 'Easy', game: 'memory',
    payMin: 140000, payMax: 210000, failMin: 35000, failMax: 75000,
    steps: 3, timeSec: 30, windowMs: 0,
  },
  {
    id: 'technician', name: 'Computer Technician', icon: '💻',
    description: 'React the instant the diagnostic light turns green.',
    difficulty: 'Hard', game: 'reaction',
    payMin: 200000, payMax: 300000, failMin: 60000, failMax: 110000,
    steps: 1, timeSec: 20, windowMs: 900,
  },
  {
    id: 'gametester', name: 'Game Tester', icon: '🎮',
    description: 'Pick the correct build before the timer runs out.',
    difficulty: 'Hard', game: 'choice',
    payMin: 220000, payMax: 320000, failMin: 70000, failMax: 120000,
    steps: 6, timeSec: 12, windowMs: 0,
  },
];

export const JOB_MAP: Record<string, JobDef> = Object.fromEntries(JOBS.map((j) => [j.id, j]));

export const DEFAULT_JOB_COOLDOWN_SEC = 3600;

export interface JobChallenge {
  game: JobGame;
  // order: display sequence; memory: icon sequence; choice: options+correct;
  // timing: zone [lo,hi] in ms within a sweep period; reaction: delayMs+windowMs.
  sequence?: number[];
  icons?: string[];
  options?: string[];
  correct?: number;
  zone?: [number, number];
  periodMs?: number;
  delayMs?: number;
  windowMs?: number;
  goAt?: number; // server timestamp (ms) when reaction turns green
  deadlineAt?: number; // server timestamp (ms) when the shift expires
}

const MEMORY_ICONS = ['☕', '🍩', '🥐', '🧋', '🍰', '🥤', '🍪', '🥧'];
const CHOICE_BUILDS = ['v1.0-stable', 'v1.1-beta', 'v1.2-rc', 'v2.0-alpha', 'v2.1-nightly', 'v3.0-stable'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Server-side challenge generation. The expected answer stays server-side. */
export function generateChallenge(job: JobDef, nowMs: number, timeSec: number): JobChallenge {
  const deadlineAt = nowMs + Math.max(5, timeSec) * 1000;
  switch (job.game) {
    case 'order': {
      const seq = shuffle(Array.from({ length: job.steps }, (_, i) => i + 1));
      return { game: 'order', sequence: seq, deadlineAt };
    }
    case 'memory': {
      const icons = Array.from({ length: job.steps }, () => MEMORY_ICONS[crypto.randomInt(MEMORY_ICONS.length)]);
      return { game: 'memory', icons, deadlineAt };
    }
    case 'choice': {
      const options = shuffle(CHOICE_BUILDS).slice(0, job.steps);
      return { game: 'choice', options, correct: crypto.randomInt(options.length), deadlineAt };
    }
    case 'timing': {
      const periodMs = 2000;
      const width = Math.max(60, job.windowMs);
      const lo = crypto.randomInt(0, periodMs - width);
      return { game: 'timing', zone: [lo, lo + width], periodMs, deadlineAt };
    }
    case 'reaction': {
      const delayMs = 1500 + crypto.randomInt(2500);
      return { game: 'reaction', delayMs, windowMs: job.windowMs, goAt: nowMs + delayMs, deadlineAt };
    }
    default:
      return { game: 'order', sequence: [1], deadlineAt };
  }
}

export interface JobAttempt {
  clicks?: number[]; // order: pressed values in order; memory: icon indexes
  pick?: number; // choice: option index
  elapsedMs?: number; // timing: ms the indicator ran before stop; reaction: ms after go
  reactedEarly?: boolean; // reaction: clicked before green
}

export interface JobVerdict {
  won: boolean;
  reason: string;
}

/**
 * Server-side attempt validation against the stored challenge. Pure apart
 * from the clock — never trusts a client "won" flag.
 */
export function validateAttempt(job: JobDef, ch: JobChallenge, a: JobAttempt, nowMs: number): JobVerdict {
  if (nowMs > (ch.deadlineAt || 0)) {
    return { won: false, reason: 'you ran out of time' };
  }
  const elapsed = Math.max(0, Math.floor(Number(a.elapsedMs ?? 0)));
  switch (job.game) {
    case 'order': {
      const expected = [...(ch.sequence || [])].sort((x, y) => x - y);
      const clicks = Array.isArray(a.clicks) ? a.clicks.map(Number) : [];
      if (clicks.length !== expected.length) {
        return { won: false, reason: 'you did not finish the order sequence' };
      }
      // Anti-instant: nobody taps a real sequence in under 350ms per button.
      if (elapsed < expected.length * 350) {
        return { won: false, reason: 'the shift finished impossibly fast' };
      }
      for (let i = 0; i < expected.length; i++) {
        if (clicks[i] !== expected[i]) {
          return { won: false, reason: 'you clicked the buttons in the wrong order' };
        }
      }
      return { won: true, reason: 'order complete' };
    }
    case 'memory': {
      const want = (ch.icons || []).length;
      const clicks = Array.isArray(a.clicks) ? a.clicks.map(Number) : [];
      if (clicks.length !== want) {
        return { won: false, reason: 'you did not finish the drink order' };
      }
      if (elapsed < want * 350) {
        return { won: false, reason: 'the shift finished impossibly fast' };
      }
      // clicks are indexes into MEMORY_ICONS — compare against stored icons.
      for (let i = 0; i < want; i++) {
        if (MEMORY_ICONS[clicks[i]] !== (ch.icons || [])[i]) {
          return { won: false, reason: 'you entered the sequence incorrectly' };
        }
      }
      return { won: true, reason: 'order remade perfectly' };
    }
    case 'choice': {
      const pick = Math.floor(Number(a.pick));
      if (!Number.isInteger(pick) || pick < 0 || pick >= (ch.options || []).length) {
        return { won: false, reason: 'you did not pick a valid build' };
      }
      if (pick !== ch.correct) {
        return { won: false, reason: 'you shipped the wrong build' };
      }
      return { won: true, reason: 'correct build shipped' };
    }
    case 'timing': {
      const [lo, hi] = ch.zone || [0, 0];
      const period = ch.periodMs || 2000;
      if (elapsed < 200) {
        return { won: false, reason: 'you stopped the beacon instantly' };
      }
      const pos = elapsed % period;
      if (pos >= lo && pos <= hi) return { won: true, reason: 'beacon stopped in the zone' };
      return { won: false, reason: 'you stopped outside the target zone' };
    }
    case 'reaction': {
      if (a.reactedEarly) {
        return { won: false, reason: 'you jumped the gun before green' };
      }
      const goAt = ch.goAt || 0;
      const reaction = nowMs - goAt;
      // Submitted elapsedMs is advisory; the server clock decides.
      void elapsed;
      if (reaction < 80) {
        return { won: false, reason: 'you reacted impossibly fast' };
      }
      if (reaction > (ch.windowMs || 900)) {
        return { won: false, reason: 'you reacted too slowly' };
      }
      return { won: true, reason: `reacted in ${reaction}ms` };
    }
    default:
      return { won: false, reason: 'you did not finish the shift' };
  }
}

/** Server-side payout roll. min–max inclusive. */
export function rollPayout(job: JobDef, won: boolean): number {
  const lo = won ? job.payMin : job.failMin;
  const hi = won ? job.payMax : job.failMax;
  return lo + crypto.randomInt(hi - lo + 1);
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
  return `${p(h)}:${p(m)}:${p(sec)}`;
}
