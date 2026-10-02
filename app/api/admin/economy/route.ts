import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { requireStaff } from '@/app/lib/access-control';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// Economy overview for the Muragoods Admin Panel.
//
// Scope: `economy`. The owner sees the whole ledger; a support-scoped staff
// member does not, because "answer a question about coins" and "move the
// economy" are different jobs. Individual balance edits happen through
// /api/admin/coins, which writes a coinHistory entry so every adjustment is
// attributable.
//
// Coin configuration that lives in Murabot's guild configuration is
// guild-scoped and is NOT read through the public dashboard here — the
// canonical store is read directly, so this surface does not depend on the
// dashboard's permission model.
// ─────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const guard = await requireStaff(req, ['economy']);
  if (!guard.ok) return guard.response;

  await dbConnect();

  const [totals, topHolders, recent] = await Promise.all([
    User.aggregate<{ total: number; accounts: number }>([
      { $match: { coinBalance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$coinBalance' }, accounts: { $sum: 1 } } },
    ]),
    User.find({ coinBalance: { $gt: 0 } })
      .select('name email coinBalance userId')
      .sort({ coinBalance: -1 })
      .limit(15)
      .lean<Array<{ name?: string; email: string; coinBalance?: number; userId?: string }>>(),
    User.find({ 'coinHistory.0': { $exists: true } })
      .select('name email coinHistory')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean<Array<{ name?: string; email: string; coinHistory?: { type?: string; amount?: number; label?: string; date?: string }[] }>>(),
  ]);

  const totalCoins = totals[0]?.total ?? 0;
  const accountsWithCoins = totals[0]?.accounts ?? 0;

  return NextResponse.json({
    success: true,
    totals: {
      coinsInCirculation: totalCoins,
      accountsHoldingCoins: accountsWithCoins,
      averageBalance: accountsWithCoins > 0 ? Math.round(totalCoins / accountsWithCoins) : 0,
    },
    topHolders: topHolders.map((u) => ({
      name: u.name || '—',
      email: u.email,
      userId: u.userId || null,
      coinBalance: u.coinBalance || 0,
    })),
    recentActivity: recent.flatMap((u) => (u.coinHistory || []).slice(-5).map((h) => ({
      who: u.name || u.email,
      email: u.email,
      type: h.type || 'unknown',
      amount: h.amount || 0,
      label: h.label || '',
      at: h.date || null,
    }))).sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? ''))).slice(0, 30),
    antiExploit: {
      note: 'Anti-exploit settings (cooldowns, rate caps, gambling limits) are enforced in Murabot '
        + 'against its guild configuration. This panel reads and reports them through the '
        + 'canonical store rather than through the public dashboard API.',
      canonicalStore: "the site's guild_config collection (guild_config.economy)",
    },
    readOnly: guard.access.level !== 'muragoods_owner',
  });
}