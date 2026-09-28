import { NextResponse } from 'next/server';
import { awardPlay, gameIdentity, dayKey } from '@/app/lib/gameserver';
import dbConnect from '@/app/lib/mongodb';
import { rateLimit } from '@/app/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/games/award { gameId, sessionToken, score?, moves?, ... }
// The ONLY way browser games earn: server validates the play, computes the
// prize from its own tables, and grants atomically with idempotency.
export async function POST(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const rl = rateLimit(`gaward:${id.emailLc}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const result = await awardPlay(id, {
      gameId: String(body.gameId || ''),
      sessionToken: String(body.sessionToken || ''),
      score: Number(body.score ?? 0),
      moves: Number(body.moves ?? 0),
      timeSec: Number(body.timeSec ?? 0),
      difficulty: Number(body.difficulty ?? 0),
      cleared: Number(body.cleared ?? 0),
      playTimeSec: Number(body.playTimeSec ?? 0),
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status || 400 });
    }
    // Fresh server balance so the UI confirms without trusting local math.
    await dbConnect();
    const { default: User } = await import('@/app/lib/models/User');
    const user = await User.findOne({ email: id.email }).select('coinBalance').lean<{ coinBalance?: number } | null>();
    return NextResponse.json({
      success: true,
      coins: result.coins, xp: result.xp, achievements: result.achievements,
      playsLeft: result.playsLeft, discountCode: result.discountCode,
      discountPct: result.discountPct, streak: result.streak,
      balance: user?.coinBalance ?? null, day: dayKey(),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Award failed' }, { status: 500 });
  }
}
