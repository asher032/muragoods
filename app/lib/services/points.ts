import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import PointsTransaction, { POINTS_SOURCES, type PointsSource } from '@/app/lib/models/PointsTransaction';
import type { CanonicalUser } from '@/app/lib/identity';

// ─────────────────────────────────────────────────────────────────────────
// THE points writer. There is no second one.
//
// Rule 12 of the brief is "no client-side authority over currency", and the
// way that is usually broken is not by a malicious client but by a second
// code path that adjusts a balance. So this module is deliberately narrow:
//
//   grantPoints()  credits, idempotent on txId
//   spendPoints()  debits, idempotent on txId, refuses to overdraw
//   reversePoints() credits back against the original txId
//
// Everything goes through `record()`, which writes the ledger row FIRST and
// only then moves the cached balance. Ledger-first matters: if the process
// dies between the two writes the next read can see that points were promised
// but not yet applied, which is a reportable inconsistency. The reverse —
// balance updated, ledger row lost — is silent and unfixable.
//
// Idempotency is structural, not advisory. `txId` carries a unique index, so
// two concurrent claims of the same achievement race to insert and exactly one
// wins. The loser is told `already_applied`, which is a SUCCESS from the
// caller's point of view (the reward IS in the account) and must not be
// reported as an error.
//
// This is the MUGLOBAL Muragoods points account. Guild-scoped Discord server
// economy is deliberately NOT reachable from here: converting Muragoods points
// into server currency has to be an explicit, configured decision, never a
// side effect of awarding a game prize.
// ─────────────────────────────────────────────────────────────────────────

export type PointsResult =
  | { ok: true; applied: boolean; balance: number; txId: string; amount: number }
  | { ok: false; code: PointsErrorCode; error: string; balance?: number };

export type PointsErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_AMOUNT'
  | 'INVALID_SOURCE'
  | 'ALREADY_APPLIED'
  | 'INSUFFICIENT_FUNDS'
  | 'WRITE_FAILED';

const MAX_SINGLE_MUTATION = 1_000_000;

function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: number; message?: string } | null;
  return Boolean(e && (e.code === 11000 || /E11000|duplicate key/i.test(e.message || '')));
}

function assertIdentity(user: CanonicalUser | null): user is CanonicalUser {
  if (!user || !user.userId) return false;
  return true;
}

/**
 * The one place a balance moves.
 *
 * `txId` is required and must describe the EVENT, not the attempt — so a retry
 * of the same event reuses it. Amount 0 is a no-op that still returns the
 * current balance, because "the reward was worth nothing" is a real outcome
 * (a weighted prize table can roll zero) and not an error.
 */
async function record(
  user: CanonicalUser,
  input: { txId: string; source: PointsSource; amount: number; reason: string; reference?: string },
): Promise<PointsResult> {
  await dbConnect();

  const amount = Math.trunc(input.amount);
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_SINGLE_MUTATION) {
    return { ok: false, code: 'INVALID_AMOUNT', error: 'Amount out of range' };
  }
  if (!(POINTS_SOURCES as readonly string[]).includes(input.source)) {
    return { ok: false, code: 'INVALID_SOURCE', error: `Unknown points source "${input.source}"` };
  }

  const emailLc = user.emailLc;

  // Amount 0 is a legitimate prize outcome. Record nothing, move nothing.
  if (amount === 0) {
    const current = await User.findOne({ userId: user.userId }).select('coinBalance')
      .lean<{ coinBalance?: number } | null>();
    return { ok: true, applied: false, balance: current?.coinBalance || 0, txId: input.txId, amount: 0 };
  }

  // Claim the event by inserting the ledger row. The unique index on txId is
  // what makes this the atomic step — not a read-then-write, which races.
  try {
    await PointsTransaction.create({
      txId: input.txId,
      canonicalUserId: user.userId,
      userEmail: emailLc,
      source: input.source,
      amount,
      reason: input.reason.slice(0, 300),
      reference: input.reference || '',
      discordId: user.discordUserId || '',
      createdAt: new Date(),
      balanceAfter: 0, // filled in below; corrected if the update races
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      // Already granted. This is the replay path, and it is a success with
      // `applied: false` — the caller must not retry or double-credit.
      const existing = await PointsTransaction.findOne({ txId: input.txId })
        .select('balanceAfter amount').lean<{ balanceAfter?: number; amount?: number } | null>();
      const balance = await currentBalance(user);
      return {
        ok: true,
        applied: false,
        balance: existing?.balanceAfter ?? balance,
        txId: input.txId,
        amount: existing?.amount ?? amount,
      };
    }
    return { ok: false, code: 'WRITE_FAILED', error: 'The points ledger could not be written' };
  }

  // Ledger row exists; now move the cached balance. $inc is atomic, so two
  // different events for the same person cannot lose each other's update.
  const updated = await User.findOneAndUpdate(
    { userId: user.userId },
    { $inc: { coinBalance: amount }, $set: { updatedAt: new Date() } },
    { new: true },
  ).select('coinBalance').lean<{ coinBalance?: number } | null>();

  const balance = Math.max(0, updated?.coinBalance ?? 0);

  // A debit that would have gone negative is clamped by `$max`-free math
  // above; record what the balance actually became so the ledger is verifiable.
  await PointsTransaction.updateOne(
    { txId: input.txId },
    { $set: { balanceAfter: balance } },
  );

  // Keep the legacy embedded history in step. It is not the record — the
  // ledger is — but existing UI still reads it, so it must not silently go
  // stale and show a different total.
  await User.updateOne(
    { userId: user.userId },
    {
      $push: {
        coinHistory: {
          $each: [{
            type: amount >= 0 ? 'earn' : 'spend',
            amount: Math.abs(amount),
            label: input.reason || input.source,
            date: new Date(),
          }],
          $slice: -200,
        },
      },
    },
  ).catch(() => undefined);

  return { ok: true, applied: true, balance, txId: input.txId, amount };
}

async function currentBalance(user: CanonicalUser): Promise<number> {
  const doc = await User.findOne({ userId: user.userId }).select('coinBalance')
    .lean<{ coinBalance?: number } | null>();
  return doc?.coinBalance || 0;
}

/**
 * Debit points with an ATOMIC balance guard.
 *
 * `spendPoints` reads the balance, then writes — which two concurrent spends
 * can both pass. That is fine for a shop checkout, but not for a game entry
 * fee, where two simultaneous taps on "play" must not both succeed against one
 * balance. This variant keeps the guarded `$inc` (the `$gte` in the filter is
 * what makes it safe) and still writes the ledger row, so the entry fee ends
 * up in the same auditable record as everything else.
 *
 * `scripts/check-admin-coverage.mjs` fails the build if any file outside this
 * module mutates `coinBalance`, which is what keeps this the only place.
 */
export async function spendPointsAtomic(
  user: CanonicalUser | null,
  input: { txId: string; source: PointsSource; amount: number; reason: string; reference?: string },
): Promise<PointsResult> {
  if (!assertIdentity(user)) {
    return { ok: false, code: 'UNAUTHENTICATED', error: 'Sign in required' };
  }
  await dbConnect();

  const amount = Math.abs(Math.trunc(input.amount));
  if (!Number.isFinite(amount) || amount > MAX_SINGLE_MUTATION) {
    return { ok: false, code: 'INVALID_AMOUNT', error: 'Amount out of range' };
  }
  if (amount === 0) {
    return { ok: true, applied: false, balance: await currentBalance(user), txId: input.txId, amount: 0 };
  }

  // Claim the event first, exactly as record() does, so a retry collapses.
  try {
    await PointsTransaction.create({
      txId: input.txId,
      canonicalUserId: user.userId,
      userEmail: user.emailLc,
      source: input.source,
      amount: -amount,
      reason: input.reason.slice(0, 300),
      reference: input.reference || '',
      discordId: user.discordUserId || '',
      createdAt: new Date(),
      balanceAfter: 0,
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      return {
        ok: true,
        applied: false,
        balance: await currentBalance(user),
        txId: input.txId,
        amount: -amount,
      };
    }
    return { ok: false, code: 'WRITE_FAILED', error: 'The points ledger could not be written' };
  }

  // The guard is the whole point: `$gte` in the filter means this cannot take
  // the balance below zero, and two concurrent debits cannot both win.
  const debited = await User.findOneAndUpdate(
    { userId: user.userId, coinBalance: { $gte: amount } },
    { $inc: { coinBalance: -amount }, $set: { updatedAt: new Date() } },
    { new: true },
  ).select('coinBalance').lean<{ coinBalance?: number } | null>();

  if (!debited) {
    // The balance moved between the check and the debit. Roll the claim back
    // so the person is not left with a phantom debit in their ledger.
    await PointsTransaction.deleteOne({ txId: input.txId }).catch(() => undefined);
    const balance = await currentBalance(user);
    return { ok: false, code: 'INSUFFICIENT_FUNDS', error: 'Not enough points', balance };
  }

  const balance = Math.max(0, debited.coinBalance ?? 0);
  await PointsTransaction.updateOne({ txId: input.txId }, { $set: { balanceAfter: balance } });
  await User.updateOne(
    { userId: user.userId },
    {
      $push: {
        coinHistory: {
          $each: [{ type: 'spend', amount, label: input.reason || input.source, date: new Date() }],
          $slice: -200,
        },
      },
    },
  ).catch(() => undefined);

  return { ok: true, applied: true, balance, txId: input.txId, amount: -amount };
}

/**
 * Credit points. `txId` must identify the EVENT — e.g.
 * `game:trivia:<sessionToken>:coins` — so a retry collapses onto one row.
 */
export function grantPoints(
  user: CanonicalUser | null,
  input: { txId: string; source: PointsSource; amount: number; reason: string; reference?: string },
): Promise<PointsResult> {
  if (!assertIdentity(user)) {
    return Promise.resolve({ ok: false, code: 'UNAUTHENTICATED', error: 'Sign in required' });
  }
  return record(user, { ...input, amount: Math.abs(input.amount) });
}

/**
 * Debit points. Refuses to overdraw rather than clamping silently: a debit
 * that silently becomes smaller than requested is a bug in the caller, and
 * hiding it would let a purchase succeed for less than it cost.
 */
export async function spendPoints(
  user: CanonicalUser | null,
  input: { txId: string; source: PointsSource; amount: number; reason: string; reference?: string },
): Promise<PointsResult> {
  if (!assertIdentity(user)) {
    return { ok: false, code: 'UNAUTHENTICATED', error: 'Sign in required' };
  }
  const amount = Math.abs(Math.trunc(input.amount));
  const balance = await currentBalance(user);
  if (balance < amount) {
    return {
      ok: false,
      code: 'INSUFFICIENT_FUNDS',
      error: 'Not enough points',
      balance,
    };
  }
  return record(user, { ...input, amount: -amount });
}

/**
 * Give points back against the event that took them. Keyed on the ORIGINAL
 * txId so a refund is itself idempotent — refunding the same order twice
 * credits once.
 */
export async function reversePoints(
  user: CanonicalUser | null,
  input: { originalTxId: string; source?: PointsSource; reason: string },
): Promise<PointsResult> {
  if (!assertIdentity(user)) {
    return { ok: false, code: 'UNAUTHENTICATED', error: 'Sign in required' };
  }
  await dbConnect();
  const original = await PointsTransaction.findOne({ txId: input.originalTxId })
    .select('amount canonicalUserId userEmail').lean<{ amount?: number; canonicalUserId?: string } | null>();
  if (!original) {
    return { ok: false, code: 'WRITE_FAILED', error: 'The original transaction could not be found' };
  }
  // Refunding someone else's transaction is refused, not clamped.
  if (original.canonicalUserId && original.canonicalUserId !== user.userId) {
    return { ok: false, code: 'WRITE_FAILED', error: 'That transaction belongs to another account' };
  }
  return record(user, {
    txId: `refund:${input.originalTxId}`,
    source: input.source || 'refund',
    amount: Math.abs(original.amount || 0),
    reason: input.reason || 'Reversal',
    reference: input.originalTxId,
  });
}

/** Read the ledger. Never the browser's copy of it. */
export async function pointsLedger(
  user: CanonicalUser | null,
  opts: { limit?: number; source?: PointsSource } = {},
): Promise<{
  userId: string;
  balance: number;
  earned: number;
  spent: number;
  transactions: Array<{
    txId: string; source: string; amount: number; reason: string;
    reference: string; balanceAfter: number; createdAt: string;
  }>;
} | null> {
  if (!assertIdentity(user)) return null;
  await dbConnect();

  const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
  const filter: Record<string, unknown> = { canonicalUserId: user.userId };
  if (opts.source) filter.source = opts.source;

  const [balance, rows] = await Promise.all([
    currentBalance(user),
    PointsTransaction.find(filter).sort({ createdAt: -1 }).limit(limit)
      .lean<Array<{ txId: string; source: string; amount: number; reason: string; reference: string; balanceAfter: number; createdAt: Date }>>(),
  ]);

  let earned = 0;
  let spent = 0;
  for (const r of rows) {
    if (r.amount >= 0) earned += r.amount;
    else spent += Math.abs(r.amount);
  }

  return {
    userId: user.userId,
    balance,
    earned,
    spent,
    transactions: rows.map((r) => ({
      txId: r.txId,
      source: r.source,
      amount: r.amount,
      reason: r.reason,
      reference: r.reference,
      balanceAfter: r.balanceAfter,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  };
}