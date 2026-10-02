import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Order from '@/app/lib/models/Order';
import { getIdentityWithId, ownerFilter } from '@/app/lib/identity';
import { pointsLedger } from '@/app/lib/services/points';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────
// GET /api/account/points — ONE points account per person.
//
// There is no separate Murastream/Murabot/Shop points account: every surface
// reads this. Identity comes from the session, so a caller cannot read
// somebody else's ledger by passing an id.
//
// The history is assembled from two places, deliberately:
//
//   1. PointsTransaction — the canonical ledger. Every new movement lands
//      here first, with a transaction id, a source and a reason. This is the
//      record.
//
//   2. GameReward + delivered Orders — pre-ledger history. Rows written before
//      this existed are real points a person earned and must keep showing up,
//      so they are included and marked `legacy`. Dropping them would make a
//      returning member's history quietly shrink to nothing on the day this
//      shipped, which reads as "my points vanished".
//
// The distinction is labelled rather than hidden: `transactions` is the
// verifiable ledger, and the totals include both so the number a member sees
// matches what they actually earned.
// ─────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const user = await getIdentityWithId(req);
    if (!user) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });

    await dbConnect();
    const { default: GameReward } = await import('@/app/lib/models/GameReward');

    const [ledger, rewards, orderAgg] = await Promise.all([
      pointsLedger(user, { limit: 100 }),
      GameReward.find({ ...ownerFilter(user, 'userEmail'), kind: 'coins' })
        .sort({ createdAt: -1 }).limit(200)
        .lean<Array<{ amount?: number; label?: string; gameId?: string; ledgerTxId?: string; createdAt?: Date }>>(),
      Order.find(ownerFilter(user, 'userId')).select('total pointsEarned').limit(500)
        .lean<Array<{ total?: number; pointsEarned?: number }>>(),
    ]);

    // Legacy entries the ledger does not already represent. A GameReward row
    // that carries a ledgerTxId IS that ledger entry, so it is counted once
    // and only rows predating the ledger are added on.
    const ledgerKeys = new Set((ledger?.transactions || []).map((t) => t.txId));

    const legacyHistory = rewards
      .filter((r) => !r.ledgerTxId || !ledgerKeys.has(r.ledgerTxId))
      .map((r) => {
        const amount = Math.abs(Number(r.amount) || 0);
        return {
          type: (Number(r.amount) || 0) >= 0 ? ('earn' as const) : ('spend' as const),
          amount,
          label: r.label || r.gameId || 'Points',
          date: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
          legacy: true,
        };
      });

    const ledgerEarned = ledger?.earned ?? 0;
    const ledgerSpent = ledger?.spent ?? 0;
    const legacyEarned = legacyHistory.filter((h) => h.type === 'earn').reduce((s, h) => s + h.amount, 0);
    const legacySpent = legacyHistory.filter((h) => h.type === 'spend').reduce((s, h) => s + h.amount, 0);

    // Delivered orders earn points too. Shown separately because they are not
    // ledger entries and cannot be spent or reversed through it.
    const orderPoints = orderAgg.reduce((s, o) => s + (Number(o.pointsEarned) || 0), 0);

    return NextResponse.json({
      success: true,
      userId: user.userId,
      // The one balance. Never a per-service figure.
      balance: ledger?.balance ?? 0,
      earned: ledgerEarned + legacyEarned,
      spent: ledgerSpent + legacySpent,
      orderPoints,
      rewards: orderPoints,
      transactions: (ledger?.transactions.length ?? 0) + legacyHistory.length,
      // The verifiable ledger: every entry carries a transaction id.
      ledger: ledger?.transactions ?? [],
      // Pre-ledger activity, labelled so it is never mistaken for a ledger row.
      history: [
        ...(ledger?.transactions ?? []).map((t) => ({
          type: t.amount >= 0 ? ('earn' as const) : ('spend' as const),
          amount: Math.abs(t.amount),
          label: t.reason || t.source,
          date: t.createdAt,
          txId: t.txId,
          source: t.source,
          balanceAfter: t.balanceAfter,
          legacy: false,
        })),
        ...legacyHistory,
      ],
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load points' }, { status: 500 });
  }
}