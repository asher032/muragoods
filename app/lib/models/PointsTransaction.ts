import mongoose from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────
// The Muragoods points ledger.
//
// Points used to be a number on the User document plus a growing embedded
// `coinHistory` array with four fields: type, amount, label, date. That shape
// cannot answer the questions the ecosystem needs to ask:
//
//   - did this exact reward already pay out?  (a retry must not double-credit)
//   - which system granted this?              (games vs shop vs orders)
//   - what is the audit trail for a balance?  (embedded history is unbounded
//                                               and gets truncated on the doc)
//   - can the bot and the site agree?         (both need the same rows)
//
// So every movement becomes a row here. The balance on `User` remains the fast
// read, but it is a cache of this ledger, not the record of it.
//
// `txId` is the idempotency key AND the audit handle. A unique index on it is
// what makes "grant this reward" safe to retry from a queue, a double-tap, or
// two devices claiming the same achievement at once — the second attempt gets
// a duplicate-key error and is reported as `already_applied`, never as a new
// grant.
//
// This is the MUGLOBAL points account. Discord SERVER economy is a different
// thing entirely (guild-scoped, owned by Murabot) and must never be written
// here — see app/lib/economy-store.ts.
// ─────────────────────────────────────────────────────────────────────────

export const POINTS_SOURCES = [
  'game',
  'shop',
  'order',
  'murastream',
  'murabot',
  'event',
  'admin',
  'migration',
  'refund',
] as const;

export type PointsSource = (typeof POINTS_SOURCES)[number];

const PointsTransactionSchema = new mongoose.Schema({
  /**
   * Idempotency key. Unique. Callers derive it from the thing that happened
   * (`game:mysterybox:<sessionToken>:coins`) rather than from a counter, so a
   * replay of the same event collapses onto the same row.
   */
  txId: { type: String, required: true, unique: true, index: true },

  canonicalUserId: { type: String, required: true, index: true },
  // LEGACY owner key (lowercased email). Still written and still matched, so
  // accounts created before `userId` existed keep a continuous ledger.
  userEmail: { type: String, required: true, index: true },

  /** Which subsystem moved the points. Never free text. */
  source: { type: String, enum: POINTS_SOURCES, required: true, index: true },

  /** Signed: positive credits, negative debits. Never stored unsigned. */
  amount: { type: Number, required: true },

  /** Human-facing explanation, safe to render. */
  reason: { type: String, default: '', maxlength: 300 },

  /** Where the event came from — a game id, an order id, a route name. */
  reference: { type: String, default: '', index: true },

  /** Discord id denormalized for Murabot reads. Empty when not linked. */
  discordId: { type: String, default: '', index: true },

  /** Balance immediately after this entry — makes a total verifiable. */
  balanceAfter: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now, index: true },
}, { collection: 'points_transactions' });

PointsTransactionSchema.index({ canonicalUserId: 1, createdAt: -1 });
PointsTransactionSchema.index({ canonicalUserId: 1, source: 1, createdAt: -1 });

export default mongoose.models.PointsTransaction ||
  mongoose.model('PointsTransaction', PointsTransactionSchema);