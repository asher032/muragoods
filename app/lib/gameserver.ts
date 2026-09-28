import crypto from 'crypto';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import GameDefinition from '@/app/lib/models/GameDefinition';
import GameProgress from '@/app/lib/models/GameProgress';
import GameReward from '@/app/lib/models/GameReward';
import GameSession from '@/app/lib/models/GameSession';
import UserActivity from '@/app/lib/models/UserActivity';
import PromoCode from '@/app/lib/models/PromoCode';
import { getSessionUser } from '@/app/lib/session';

// ── Centralized game reward service ────────────────────────────────────
// Game → Reward Service → User Account → Discord + Website + Dashboard.
// The browser NEVER awards itself: every grant is computed here from
// server-side prize tables, gated by a single-use play session, daily
// caps, cooldowns and an idempotency ledger.

// Canonical catalog. Seeded into game_definitions on first read so admins
// can re-tune without deploys; code values are the fallback, never the boss.
export const GAME_CATALOG: Array<{
  gameId: string; title: string; description: string; category: string;
  route: string; maxPlaysPerDay: number; cooldownSec: number; xpPerPlay: number;
  config: Record<string, unknown>;
}> = [
  {
    gameId: 'spin', title: 'Spin the Wheel', description: 'Daily lucky wheel — 3 spins, win up to 50 coins.',
    category: 'chance', route: '/play/spin', maxPlaysPerDay: 3, cooldownSec: 0, xpPerPlay: 5,
    config: { cost: 15, segments: [5, 10, 2, 25, 15, 0, 50, 8] },
  },
  {
    gameId: 'trivia', title: 'Trivia Quest', description: 'Answer fast, build streaks, go legendary.',
    category: 'activities', route: '/play/trivia', maxPlaysPerDay: 2, cooldownSec: 1800, xpPerPlay: 10,
    config: { perQuestion: { easy: 3, medium: 5, hard: 8 }, timeBonus: [0, 2, 3], legendaryMult: 3 },
  },
  {
    gameId: 'memory', title: 'Memory Match', description: 'Clear the board in as few moves as you can.',
    category: 'arcade', route: '/play/memory', maxPlaysPerDay: 10, cooldownSec: 0, xpPerPlay: 8,
    config: { base: 50, moveCost: 2, timeCostPer10s: 1, minReward: 5 },
  },
  {
    gameId: 'flappy', title: 'Flappy Flight', description: 'Dodge the pipes — every 2 points earns a coin.',
    category: 'arcade', route: '/play/flappy', maxPlaysPerDay: 10, cooldownSec: 0, xpPerPlay: 5,
    config: { coinsPer2Points: 1, maxCoinsPerPlay: 100 },
  },
  {
    gameId: 'checkin', title: 'Daily Check-In', description: 'Come back every day — streaks pay more.',
    category: 'daily', route: '/play/checkin', maxPlaysPerDay: 1, cooldownSec: 86400, xpPerPlay: 3,
    config: { dayTable: [5, 8, 10, 12, 15, 20, 50] },
  },
  {
    gameId: 'mysterybox', title: 'Mystery Box', description: '10 coins a box — chase legendary and mythic pulls.',
    category: 'chance', route: '/play/mysterybox', maxPlaysPerDay: 20, cooldownSec: 300, xpPerPlay: 5,
    config: {
      cost: 10,
      prizes: [
        { label: '+5 coins', weight: 30, coins: 5 }, { label: '+8 coins', weight: 20, coins: 8 },
        { label: '+10 coins', weight: 15, coins: 10 }, { label: '+15 coins', weight: 12, coins: 15 },
        { label: '10% off', weight: 10, discount: 10 }, { label: '15% off', weight: 6, discount: 15 },
        { label: '20% off', weight: 4, discount: 20 }, { label: '+25 coins', weight: 2, coins: 25 },
        { label: '+50 coins LEGENDARY', weight: 1, coins: 50 },
        { label: '+100 coins MYTHIC', weight: 1, coins: 100 },
      ],
    },
  },
  {
    gameId: 'refer', title: 'Refer Friends', description: 'Share your code — real rewards land on signup.',
    category: 'social', route: '/play/refer', maxPlaysPerDay: 999, cooldownSec: 0, xpPerPlay: 0,
    config: {},
  },
];

export async function ensureCatalog(): Promise<void> {
  await dbConnect();
  for (const [i, g] of GAME_CATALOG.entries()) {
    await GameDefinition.updateOne(
      { gameId: g.gameId },
      {
        $setOnInsert: {
          title: g.title, description: g.description, category: g.category,
          route: g.route, maxPlaysPerDay: g.maxPlaysPerDay, cooldownSec: g.cooldownSec,
          xpPerPlay: g.xpPerPlay, config: g.config, sortOrder: i,
        },
      },
      { upsert: true },
    );
  }
}

export interface GameIdentity {
  email: string;
  emailLc: string;
  name: string;
  userId: string;
  discordId: string;
  discordUsername: string;
}

/** Resolve the caller's game identity server-side from the shop session. */
export async function gameIdentity(req: Request): Promise<GameIdentity | null> {
  const session = await getSessionUser(req);
  if (!session) return null;
  await dbConnect();
  const user = await User.findOne({ email: session.email })
    .select('name email userId discord').lean() as {
      name: string; email: string; userId?: string;
      discord?: { discordId?: string; username?: string };
    } | null;
  if (!user) return null;
  return {
    email: user.email,
    emailLc: user.email.toLowerCase(),
    name: user.name,
    userId: user.userId || '',
    discordId: user.discord?.discordId || '',
    discordUsername: user.discord?.username || '',
  };
}

export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function rollWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = crypto.randomInt(total);
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

/** Server-side achievement rules. Returns newly unlocked ids. */
function achievementsFor(gameId: string, result: Record<string, number>, prevBest: number): string[] {
  const out: string[] = [`first_play_${gameId}`];
  if (gameId === 'trivia' && (result.score || 0) >= 20) out.push('trivia_master');
  if (gameId === 'memory' && result.cleared === 1 && (result.difficulty || 0) >= 2) out.push('memory_master');
  if (gameId === 'flappy' && (result.score || 0) >= 20) out.push('flappy_ace');
  if (gameId === 'checkin' && (result.streak || 0) >= 7) out.push('week_warrior');
  if (gameId === 'mysterybox' && result.legendary === 1) out.push('legendary_pull');
  if (gameId === 'spin' && (result.coins || 0) >= 50) out.push('jackpot_spinner');
  if ((result.score || 0) > prevBest && prevBest > 0) out.push(`${gameId}_new_best`);
  return [...new Set(out)];
}

export interface AwardInput {
  gameId: string;
  sessionToken: string;
  // Client-reported gameplay facts (validated for sanity, never trusted
  // for amounts — prizes come from the tables below).
  score?: number;
  moves?: number;
  timeSec?: number;
  difficulty?: number;
  cleared?: number;
  playTimeSec?: number;
}

export interface AwardResult {
  ok: boolean;
  coins?: number;
  xp?: number;
  achievements?: string[];
  playsLeft?: number;
  discountCode?: string;
  discountPct?: number;
  streak?: number;
  error?: string;
  status?: number;
}

/**
 * Validate a play result and grant its reward atomically. Consumes the
 * session token first (replay protection), enforces daily caps/cooldowns,
 * computes prizes server-side, then $incs coins/XP with an idempotency row.
 */
export async function awardPlay(id: GameIdentity, input: AwardInput): Promise<AwardResult> {
  await dbConnect();
  const gameId = String(input.gameId || '');
  const def = await GameDefinition.findOne({ gameId }).lean() as {
    enabled?: boolean; maxPlaysPerDay?: number; cooldownSec?: number;
    xpPerPlay?: number; config?: Record<string, unknown>;
  } | null;
  if (!def) return { ok: false, error: 'Unknown game', status: 404 };
  if (def.enabled === false) return { ok: false, error: 'That game is in maintenance', status: 403 };

  // 1. Consume the single-use session (atomic — only the first redeem wins).
  const session = await GameSession.findOneAndUpdate(
    { token: String(input.sessionToken || ''), userEmail: id.emailLc, gameId, consumed: false, expiresAt: { $gt: new Date() } },
    { $set: { consumed: true } },
  );
  if (!session) return { ok: false, error: 'Invalid or already-used play session — start a new game', status: 409 };

  const today = dayKey();
  const maxPlays = def.maxPlaysPerDay ?? 10;
  const playsToday = await GameReward.countDocuments({
    userEmail: id.emailLc, gameId, kind: { $in: ['coins', 'xp'] }, createdAt: { $gte: new Date(`${today}T00:00:00Z`) },
  });
  // Each play writes up to 2 rows (coins+xp); divide to get play count.
  if (Math.ceil(playsToday / 2) >= maxPlays) {
    return { ok: false, error: 'Daily play limit reached for this game', status: 429 };
  }

  const cooldownSec = def.cooldownSec ?? 0;
  if (cooldownSec > 0) {
    const last = await GameReward.findOne({ userEmail: id.emailLc, gameId })
      .sort({ createdAt: -1 }).select('createdAt').lean<{ createdAt: Date } | null>();
    if (last && Date.now() - new Date(last.createdAt).getTime() < cooldownSec * 1000) {
      const wait = Math.ceil(cooldownSec - (Date.now() - new Date(last.createdAt).getTime()) / 1000);
      return { ok: false, error: `On cooldown — try again in ${wait}s`, status: 429 };
    }
  }

  // 2a. Entry costs (spin, mystery box) are charged atomically first —
  // the guarded update refuses when the balance cannot cover it.
  const cfgEarly = (def.config || {}) as Record<string, unknown>;
  const cost = Math.max(0, Math.floor(Number(cfgEarly.cost ?? 0)));
  if (cost > 0) {
    const charged = await User.findOneAndUpdate(
      { email: id.email, coinBalance: { $gte: cost } },
      {
        $inc: { coinBalance: -cost },
        $push: { coinHistory: { $each: [{ type: 'spend', amount: cost, label: `${gameId} entry`, date: new Date() }], $slice: -200 } },
      },
    );
    if (!charged) return { ok: false, error: 'Not enough coins to play', status: 402 };
  }

  // 2b. Compute the prize server-side from validated facts.
  const r: Record<string, number> = {
    score: Math.max(0, Math.min(1_000_000, Math.floor(Number(input.score) || 0))),
    moves: Math.max(0, Math.min(10000, Math.floor(Number(input.moves) || 0))),
    timeSec: Math.max(0, Math.min(86400, Math.floor(Number(input.timeSec) || 0))),
    difficulty: Math.max(0, Math.min(3, Math.floor(Number(input.difficulty) || 0))),
    cleared: Number(input.cleared) === 1 ? 1 : 0,
    playTimeSec: Math.max(0, Math.min(7200, Math.floor(Number(input.playTimeSec) || 0))),
  };
  let coins = 0;
  let discountPct = 0;
  let legendary = 0;
  const cfg = (def.config || {}) as Record<string, unknown>;
  if (gameId === 'spin') {
    const segments = (cfg.segments as number[]) || [5, 10, 2, 25, 15, 0, 50, 8];
    coins = segments[crypto.randomInt(segments.length)] ?? 0;
  } else if (gameId === 'trivia') {
    coins = Math.min(60, r.score);
  } else if (gameId === 'memory') {
    if (!r.cleared) return { ok: false, error: 'Board was not cleared', status: 422 };
    const base = Number(cfg.base ?? 50);
    coins = Math.max(Number(cfg.minReward ?? 5), base - r.moves * Number(cfg.moveCost ?? 2) - Math.floor(r.timeSec / 10));
  } else if (gameId === 'flappy') {
    coins = Math.min(Number(cfg.maxCoinsPerPlay ?? 100), Math.floor(r.score / 2));
  } else if (gameId === 'checkin') {
    const prog = await GameProgress.findOne({ userEmail: id.emailLc, gameId }).lean<{ streak?: number; lastPlayedDay?: string } | null>();
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    const streak = prog?.lastPlayedDay === yesterday ? (prog?.streak || 0) + 1 : 1;
    const table = (cfg.dayTable as number[]) || [5, 8, 10, 12, 15, 20, 50];
    coins = table[(streak - 1) % table.length] ?? 5;
    r.streak = streak;
  } else if (gameId === 'mysterybox') {
    const prizes = (cfg.prizes as Array<{ label: string; weight: number; coins?: number; discount?: number }>) || [];
    if (!prizes.length) return { ok: false, error: 'No prizes configured', status: 500 };
    const prize = rollWeighted(prizes);
    coins = prize.coins || 0;
    discountPct = prize.discount || 0;
    if (prize.coins === 50) legendary = 1;
  } else {
    return { ok: false, error: 'This game grants no play rewards', status: 422 };
  }
  const xp = def.xpPerPlay ?? 5;

  // 3. Grant atomically with idempotency. Per-play session tokens stop
  // replays; the daily check-in is additionally keyed by day so two
  // concurrent claims collapse into exactly one grant.
  const idem = gameId === 'checkin'
    ? `play:${id.emailLc}:${gameId}:${today}`
    : `play:${id.emailLc}:${gameId}:${session.token}`;
  const now = new Date();
  try {
    await GameReward.create({
      idempotencyKey: `${idem}:coins`, userEmail: id.emailLc, discordId: id.discordId,
      gameId, kind: 'coins', amount: coins, label: `${gameId} reward`, createdAt: now,
    });
  } catch (e) {
    const dup = e instanceof Error && /E11000|duplicate/i.test(e.message);
    return dup
      ? { ok: false, error: 'Reward already granted for this play', status: 409 }
      : { ok: false, error: 'Could not record reward — try again', status: 500 };
  }
  await GameReward.create({
    idempotencyKey: `${idem}:xp`, userEmail: id.emailLc, discordId: id.discordId,
    gameId, kind: 'xp', amount: xp, label: `${gameId} xp`, createdAt: now,
  });
  if (coins !== 0) {
    await User.updateOne(
      { email: id.email },
      {
        $inc: { coinBalance: coins },
        $push: { coinHistory: { $each: [{ type: coins > 0 ? 'earn' : 'spend', amount: Math.abs(coins), label: `${gameId} reward`, date: now }], $slice: -200 } },
      },
    );
  }

  // 4. Progress (best score, plays, xp, streak, achievements).
  // Read the previous best BEFORE the $max update so "new best"
  // achievements fire exactly when the record actually falls.
  const prevBestDoc = await GameProgress.findOne({ userEmail: id.emailLc, gameId })
    .select('bestScore achievements').lean<{ bestScore?: number; achievements?: string[] } | null>();
  const prevBest = Math.max(0, prevBestDoc?.bestScore || 0);
  const prog = await GameProgress.findOneAndUpdate(
    { userEmail: id.emailLc, gameId },
    {
      $setOnInsert: { discordId: id.discordId, level: 1 },
      $set: { lastPlayed: now, lastPlayedDay: today, updatedAt: now, discordId: id.discordId },
      $inc: { plays: 1, xp, playTimeSec: r.playTimeSec },
      $max: { bestScore: r.score },
    },
    { upsert: true, new: true },
  ).lean<{ bestScore: number; achievements: string[]; streak?: number } & Record<string, unknown>>();
  const newAch = achievementsFor(gameId, { ...r, coins, legendary }, prevBest);
  const unseen = newAch.filter((a) => !(prog?.achievements || []).includes(a));
  if (unseen.length) {
    await GameProgress.updateOne({ userEmail: id.emailLc, gameId }, { $addToSet: { achievements: { $each: unseen } } });
    for (const a of unseen) {
      await GameReward.create({
        idempotencyKey: `${idem}:ach:${a}`, userEmail: id.emailLc, discordId: id.discordId,
        gameId, kind: 'achievement', amount: 0, label: a, createdAt: now,
      }).catch(() => undefined);
    }
  }
  if (gameId === 'checkin' && r.streak) {
    await GameProgress.updateOne({ userEmail: id.emailLc, gameId }, { $set: { streak: r.streak } });
  }
  await UserActivity.create({
    userEmail: id.emailLc, discordId: id.discordId, type: 'game',
    text: `Played ${gameId} (+${coins} coins)`, ref: gameId, visibility: 'private', createdAt: now,
  }).catch(() => undefined);

  // 5. Discount prizes become real one-time server promo codes (usable at
  // checkout via the validated promo path). Ownership is recorded in the
  // description (`game:<email>`) and enforced at validate time, so a leaked
  // code is useless to anyone else. Consumption happens server-side in the
  // orders route when the discount is applied.
  let discountCode: string | undefined;
  if (discountPct > 0) {
    const code = `MURA-${gameId.toUpperCase().slice(0, 4)}-${crypto.randomInt(1000, 9999)}`;
    await PromoCode.create({
      code, type: 'percent', value: discountPct, minOrder: 100, maxUses: 1,
      usedCount: 0, usedBy: [], validUntil: new Date(Date.now() + 7 * 86400000), active: true,
      description: `game:${id.emailLc}`,
    }).catch(() => undefined);
    discountCode = code;
    await GameReward.create({
      idempotencyKey: `${idem}:discount`, userEmail: id.emailLc, discordId: id.discordId,
      gameId, kind: 'discount', amount: discountPct, label: code, createdAt: now,
    }).catch(() => undefined);
  }

  const leftToday = await GameReward.countDocuments({
    userEmail: id.emailLc, gameId, kind: 'coins', createdAt: { $gte: new Date(`${today}T00:00:00Z`) },
  });
  return {
    ok: true, coins, xp, achievements: unseen,
    playsLeft: Math.max(0, maxPlays - leftToday), discountCode,
    ...(discountCode ? { discountPct } : {}),
    ...(gameId === 'checkin' && r.streak ? { streak: r.streak } : {}),
  };
}

/** Privacy-preserving public player key (same HMAC pattern as /api/leaderboard). */
export function playerKey(emailLc: string): string {
  const secret = process.env.AUTH_SECRET || 'unconfigured';
  return crypto.createHmac('sha256', secret).update(`game:${emailLc}`).digest('hex').slice(0, 22);
}

export function gameLevel(totalXp: number): { level: number; into: number; need: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, totalXp) / 100)) + 1;
  const base = (level - 1) * (level - 1) * 100;
  const need = (level * level * 100) - base;
  return { level, into: Math.max(0, totalXp - base), need };
}
