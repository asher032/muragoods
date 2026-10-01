import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { getIdentityWithId, ownerFilter } from '@/app/lib/identity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/account/points — ONE points account per person.
//
// The balance lives on the single `User` document and every transaction is a
// `GameReward` row owned by the same canonical `userId`. There is no separate
// Murastream/Murabot/Shop points account: visiting any of them reads this.
// Identity comes from the session, so a caller cannot read someone else's
// ledger by passing an id.

export async function GET(req: Request) {
  try {
    const user = await getIdentityWithId(req);
    if (!user) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });

    await dbConnect();
    const { default: GameReward } = await import('@/app/lib/models/GameReward');

    const [account, rewards, orderAgg] = await Promise.all([
      User.findOne({ userId: user.userId }).select('coinBalance').lean<{ coinBalance?: number } | null>(),
      GameReward.find({ ...ownerFilter(user, 'userEmail'), kind: 'coins' })
        .sort({ createdAt: -1 }).limit(200)
        .lean<Array<{ amount?: number; label?: string; gameId?: string; createdAt?: Date }>>(),
      // Order deliveries also earn points; they are recorded as coins entries
      // on the same ledger, but reading orders keeps the total honest even if
      // a delivery predates the ledger.
      import('@/app/lib/models/Order').then(({ default: Order }) =>
        Order.find(ownerFilter(user, 'userId')).select('total pointsEarned').limit(500)
          .lean<Array<{ total?: number; pointsEarned?: number }>>()),
    ]);

    let earned = 0;
    let spent = 0;
    const history = rewards.map((r) => {
      const amount = Math.abs(Number(r.amount) || 0);
      if ((Number(r.amount) || 0) >= 0) earned += amount;
      else spent += amount;
      return {
        type: (Number(r.amount) || 0) >= 0 ? ('earn' as const) : ('spend' as const),
        amount,
        label: r.label || r.gameId || 'Points',
        date: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      };
    });

    const orderPoints = orderAgg.reduce((s, o) => s + (Number(o.pointsEarned) || 0), 0);

    return NextResponse.json({
      success: true,
      userId: user.userId,
      // The one balance. Never a per-service figure.
      balance: account?.coinBalance || 0,
      earned,
      spent,
      // Points from delivered orders are part of the same total, not a
      // separate pool.
      orderPoints,
      rewards: orderPoints,
      transactions: history.length,
      history,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load points' }, { status: 500 });
  }
}